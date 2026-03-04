import WAWebJS, { Client, Message, MessageTypes } from "whatsapp-web.js";
import { AppConfig } from "./configs/app.config";
import { ClientConfig } from "./configs/client.config";
import logger from "./configs/logger.config";
import { UserI18n } from "./utils/i18n.util";
import commands from "./commands";
import { isUrl } from "./utils/common.util";
import { identifySocialNetwork, YtDlpDownloader } from "./utils/get.util";
import { onboard } from "./utils/onboarding.util";
import { ContactModel } from "./crm/models/contact.model";
import { SettingsModel } from "./crm/models/settings.model";
import { MessageModel } from "./crm/models/message.model";
import { ScoreRuleModel } from "./crm/models/score-rule.model";
import { CampaignModel } from "./crm/models/campaign.model";
import { messageEmitter } from "./utils/message-emitter.util";
import { AutoReplyModel } from "./crm/models/auto-reply.model";
import { fireEvent } from "./utils/fire-event.util";
import { claudeCompletion } from "./utils/claude.util";
import { FlowModel } from "./crm/models/flow.model";
import { FlowSessionModel } from "./crm/models/flow-session.model";
const qrcode = require('qrcode-terminal');

// Per-contact auto-reply cooldown: phone → last triggered timestamp
const autoReplyCooldown = new Map<string, Map<string, Date>>();

async function applyScore(phoneNumber: string, action: string) {
    try {
        const rule = await ScoreRuleModel.findOne({ action, enabled: true }).lean();
        if (rule) {
            await ContactModel.updateOne({ phoneNumber }, { $inc: { score: rule.points } });
        }
    } catch (_) { /* non-critical */ }
}

export class BotManager {
    private static instance: BotManager;
    public client: any;
    public qrData = {
        qrCodeData: "",
        qrScanned: false,
        authenticated: false
    };
    private userI18nCache = new Map<string, UserI18n>();
    private prefix = AppConfig.instance.getBotPrefix();

    private constructor() {
        this.client = new Client(ClientConfig);
        this.setupEventHandlers();
    }

    public static getInstance(): BotManager {
        if (!BotManager.instance) {
            BotManager.instance = new BotManager();
        }
        return BotManager.instance;
    }

    private setupEventHandlers() {
        console.log("Setting up event handlers...");
        this.client.on('ready', this.handleReady.bind(this));
        this.client.on('authenticated', this.handleAuthenticated.bind(this));
        this.client.on('auth_failure', this.handleAuthFailure.bind(this));
        this.client.on('qr', this.handleQr.bind(this));
        this.client.on('message_create', this.handleMessage.bind(this));
        this.client.on('disconnected', this.handleDisconnect.bind(this));
    }


    private async handleReady() {
        this.qrData.qrScanned = true;
        this.qrData.authenticated = true;
        logger.info("Client is ready!");

        try {
            await YtDlpDownloader.getInstance().initialize();
        } catch (error) {
            logger.error("Downloader check failed:", error);
        }

    }

    private handleAuthenticated() {
        logger.info('Client authenticated successfully!');
        this.qrData.authenticated = true;
        this.qrData.qrScanned = true;
    }

    private handleAuthFailure(message: string) {
        logger.error('Authentication failed:', message);
        this.qrData.authenticated = false;
        this.qrData.qrScanned = false;
        this.qrData.qrCodeData = "";
    }

    private handleQr(qr: string) {
        logger.info('QR RECEIVED');
        this.qrData.qrCodeData = qr;
        this.qrData.qrScanned = false;
        this.qrData.authenticated = false;
        console.log(qr);
        qrcode.generate(qr, { small: true });
    }

    private handleDisconnect(reason: string) {
        logger.info(`Client disconnected: ${reason}`);
        this.qrData.qrScanned = false;
        this.qrData.authenticated = false;
        this.qrData.qrCodeData = "";

        setTimeout(() => {
            logger.info('Attempting to reconnect...');
            this.client.initialize();
        }, 5000);
    }

    public initialize() {
        try {
            this.client.initialize();
        } catch (error) {
            logger.error(`Client initialization error: ${error}`);
        }
    }

    public getStatus(): { status: string; phone?: string; pushName?: string; qrCode?: string; uptime: number } {
        const info = this.client?.info;
        if (info) {
            return {
                status: 'connected',
                phone: info.wid?.user,
                pushName: info.pushname,
                uptime: process.uptime()
            };
        }
        if (this.qrData.qrCodeData && !this.qrData.qrScanned) {
            return { status: 'scanning', qrCode: this.qrData.qrCodeData, uptime: process.uptime() };
        }
        return { status: 'disconnected', uptime: process.uptime() };
    }

    public async reconnect(): Promise<void> {
        try {
            this.qrData.qrScanned = false;
            this.qrData.authenticated = false;
            this.qrData.qrCodeData = '';
            await this.client.destroy();
        } catch (_) { /* ignore destroy errors */ }
        setTimeout(() => {
            logger.info('Reconnecting client...');
            this.client.initialize();
        }, 1000);
    }

    private async trackContact(user: WAWebJS.Contact, _message: Message, userI18n: UserI18n) {
        try {
            const existing = await ContactModel.findOne({ phoneNumber: user.number }).lean();
            const isNew = !existing;

            await ContactModel.findOneAndUpdate(
                { phoneNumber: user.number },
                {
                    $set: {
                        name: user.name || user.pushname,
                        pushName: user.pushname,
                        language: userI18n.getLanguage(),
                        lastInteraction: new Date()
                    },
                    $inc: { interactionsCount: 1 }
                },
                { upsert: true, new: true }
            );

            if (isNew) {
                await applyScore(user.number, 'first_interaction');
                fireEvent('contact.new', { phoneNumber: user.number, name: user.name || user.pushname }).catch(() => {});
            }
            await applyScore(user.number, 'message_received');
        } catch (error) {
            logger.error('Failed to track contact:', error);
        }
    }

    private async handleMessage(message: Message) {
        let chat = null;
        let userI18n: UserI18n;

        const content = message.body?.trim() || "";

        if (AppConfig.instance.getSupportedMessageTypes().indexOf(message.type) === -1) {
            return;
        }

        try {
            const user = await message.getContact();
            logger.info(`Message from @${user.pushname} (${user.number}): ${content}`);

            if (!user || !user.number) {
                return;
            }

            userI18n = this.getUserI18n(user.number);

            if (!user.isMe) await this.trackContact(user, message, userI18n);
            chat = await message.getChat();

            if (message.from === this.client.info.wid._serialized || message.isStatus) {
                return;
            }

            // Persist incoming message for inbox
            if (!user.isMe) {
                const inboxBody = content || (message.type === MessageTypes.VOICE ? '[Voice message]' : '[Empty message]');
                const inboxType = message.type === MessageTypes.TEXT ? 'text' : 'other';
                const isGroup = chat?.isGroup ?? false;
                const msgDoc = await MessageModel.create({
                    phoneNumber: user.number,
                    body: inboxBody,
                    type: inboxType,
                    direction: 'in',
                    sentVia: 'whatsapp',
                    read: false,
                    timestamp: new Date(),
                    isGroup,
                    groupId: isGroup ? message.from : undefined,
                    senderName: isGroup ? (user.pushname || user.name || user.number) : undefined,
                });
                messageEmitter.emit('message', msgDoc.toObject());

                // Fire integration event
                fireEvent('message.received', { phoneNumber: user.number, body: inboxBody }).catch(() => {});

                // Track campaign reply (mark first unacknowledged delivery for this phone)
                const updated = await CampaignModel.updateOne(
                    {
                        'deliveryReport.phone': user.number,
                        'deliveryReport.status': 'sent',
                        'deliveryReport.repliedAt': { $exists: false }
                    },
                    { $set: { 'deliveryReport.$.repliedAt': new Date() } }
                );
                if (updated.modifiedCount > 0) {
                    await applyScore(user.number, 'campaign_reply');
                }

                // Check auto-reply rules
                const replied = await this.checkAutoReply(user.number, content, chat);
                if (replied) return;

                // Check active flows
                const flowHandled = await this.executeFlow(user.number, content, chat);
                if (flowHandled) return;
            }

            await Promise.all([
                onboard(message, userI18n),
                this.processMessageContent(message, content, userI18n, chat)
            ]);

        } catch (error) {
            logger.error(`Message handling error: ${error}`);
            if (chat) {
                const errorMessage = userI18n?.t('errorOccurred') || 'An error occurred';
                chat.sendMessage(`> 🤖 ${errorMessage}`);
            }
        } finally {
            if (chat) await chat.clearState();
        }
    }

    private getUserI18n(userNumber: string): UserI18n {
        if (!this.userI18nCache.has(userNumber)) {
            const userI18n = new UserI18n(userNumber);
            this.userI18nCache.set(userNumber, userI18n);
            logger.info(`New user detected: ${userNumber} (${userI18n.getLanguage()})`);
        }
        return this.userI18nCache.get(userNumber)!;
    }

    private async processMessageContent(message: Message, content: string, userI18n: UserI18n, chat: any) {
        if (message.type === MessageTypes.VOICE) {
            await this.handleVoiceMessage(message, userI18n);
            return;
        }

        if (message.type === MessageTypes.TEXT) {
            await this.handleTextMessage(message, content, userI18n, chat);
        }
    }

    private async handleVoiceMessage(message: Message, userI18n: UserI18n) {
        const args = message.body.trim().split(/ +/).slice(1);
        const settings = await SettingsModel.findOne().lean() as any;
        const commandName = settings?.defaultAudioAiCommand || AppConfig.instance.getDefaultAudioAiCommand();
        const selectedCommand = commands[commandName] ? commandName : AppConfig.instance.getDefaultAudioAiCommand();
        await commands[selectedCommand].run(message, args, userI18n);
    }

    private async checkAutoReply(phoneNumber: string, content: string, chat: any): Promise<boolean> {
        try {
            const rules = await AutoReplyModel.find({ enabled: true }).sort({ priority: -1 }).lean();
            for (const rule of rules) {
                // Cooldown check
                const cooldownKey = String(rule._id);
                const phoneCooldowns = autoReplyCooldown.get(phoneNumber);
                if (phoneCooldowns) {
                    const lastTriggered = phoneCooldowns.get(cooldownKey);
                    if (lastTriggered) {
                        const elapsedMs = Date.now() - lastTriggered.getTime();
                        if (elapsedMs < rule.cooldownMinutes * 60 * 1000) continue;
                    }
                }

                // Match check
                const lc = content.toLowerCase();
                const trigger = rule.trigger.toLowerCase();
                let matched = false;
                if (rule.matchType === 'exact') matched = lc === trigger;
                else if (rule.matchType === 'contains') matched = lc.includes(trigger);
                else if (rule.matchType === 'startsWith') matched = lc.startsWith(trigger);
                else if (rule.matchType === 'regex') {
                    try { matched = new RegExp(rule.trigger, 'i').test(content); } catch { matched = false; }
                }

                if (!matched) continue;

                let replyText = rule.response;

                if (rule.useAI && rule.aiProvider !== 'none') {
                    try {
                        if (rule.aiProvider === 'openai') {
                            const { default: OpenAI } = await import('openai');
                            const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
                            const completion = await client.chat.completions.create({
                                model: 'gpt-4o-mini',
                                messages: [
                                    { role: 'system', content: rule.aiPrompt || 'You are a helpful WhatsApp assistant. Reply briefly.' },
                                    { role: 'user', content }
                                ],
                                max_tokens: 300
                            });
                            replyText = completion.choices[0]?.message?.content || rule.response;
                        } else if (rule.aiProvider === 'gemini') {
                            const { GoogleGenerativeAI } = await import('@google/generative-ai');
                            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
                            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
                            const result = await model.generateContent(`${rule.aiPrompt}\n\nUser: ${content}`);
                            replyText = result.response.text() || rule.response;
                        } else if (rule.aiProvider === 'claude') {
                            const result = await claudeCompletion(
                                content,
                                rule.aiPrompt || 'You are a helpful WhatsApp assistant. Reply briefly.'
                            );
                            replyText = result?.content?.find((item: any) => item.type === 'text')?.text || rule.response;
                        }
                    } catch (aiErr) {
                        logger.warn('Auto-reply AI generation failed, using static response:', aiErr);
                        replyText = rule.response;
                    }
                }

                if (replyText) {
                    await chat.sendMessage(replyText);
                    // Update cooldown
                    if (!autoReplyCooldown.has(phoneNumber)) autoReplyCooldown.set(phoneNumber, new Map());
                    autoReplyCooldown.get(phoneNumber)!.set(cooldownKey, new Date());
                    fireEvent('autoreply.triggered', { phoneNumber, rule: rule.name, trigger: rule.trigger }).catch(() => {});
                    return true;
                }
            }
        } catch (err) {
            logger.error('checkAutoReply error:', err);
        }
        return false;
    }

    // ─── Flow Execution Engine ────────────────────────────────────────────────

    private async executeFlow(phoneNumber: string, content: string, chat: any): Promise<boolean> {
        try {
            // 1. Check for active session
            const session = await FlowSessionModel.findOne({ phoneNumber, status: 'active' })
                .populate<{ flowId: any }>('flowId')
                .exec();

            if (session && session.flowId) {
                const flow = session.flowId;

                // Clear expired delay
                if (session.resumeAt && new Date() < session.resumeAt) {
                    session.resumeAt = undefined;
                }

                if (session.waitingForReply) {
                    // Store the reply in the named variable
                    if (session.pendingVariable) {
                        session.variables.set(session.pendingVariable, content);
                    }
                    session.waitingForReply = false;
                    session.pendingVariable = '';

                    // Advance to the next node connected from the question's output
                    const nextEdge = flow.edges.find((e: any) => e.source === session.currentNodeId && e.sourceHandle === 'out');
                    if (!nextEdge) { await this.endFlowSession(session); return true; }
                    const nextNode = flow.nodes.find((n: any) => n.id === nextEdge.target);
                    if (!nextNode) { await this.endFlowSession(session); return true; }

                    session.currentNodeId = nextNode.id;
                    session.lastActivityAt = new Date();
                    await session.save();
                    await this.runFlowNode(session, nextNode, flow, chat);
                    return true;
                }
                // Active session but not waiting — shouldn't block normal messages
                return false;
            }

            // 2. No active session — match published flows by trigger
            const flows = await FlowModel.find({ status: 'published' }).lean();
            for (const flow of flows) {
                const trigger = flow.trigger;
                let matches = false;

                if (trigger.type === 'any_message') {
                    matches = true;
                } else if (trigger.type === 'keyword') {
                    const lc = content.toLowerCase().trim();
                    matches = (trigger.keywords || []).some(kw => lc === kw.toLowerCase().trim() || lc.startsWith(kw.toLowerCase().trim() + ' '));
                } else if (trigger.type === 'first_contact') {
                    const contact = await ContactModel.findOne({ phoneNumber }).lean();
                    matches = !contact || (contact as any).interactionsCount <= 1;
                } else if (trigger.type === 'campaign_reply') {
                    const campaign = await CampaignModel.findOne({ 'deliveryReport.phone': phoneNumber, 'deliveryReport.status': 'sent' }).lean();
                    matches = !!campaign;
                } else if (trigger.type === 'tag_applied') {
                    const contact = await ContactModel.findOne({ phoneNumber }).lean();
                    matches = !!(contact as any)?.tags?.includes(trigger.tagName);
                }

                if (!matches) continue;

                const triggerNode = flow.nodes.find(n => n.type === 'trigger');
                if (!triggerNode) continue;

                const newSession = await FlowSessionModel.create({
                    phoneNumber,
                    flowId: flow._id,
                    currentNodeId: triggerNode.id,
                    variables: {},
                    waitingForReply: false,
                    pendingVariable: '',
                    status: 'active',
                    startedAt: new Date(),
                    lastActivityAt: new Date(),
                });
                await FlowModel.updateOne({ _id: flow._id }, { $inc: { 'stats.activations': 1 } });
                await this.runFlowNode(newSession, triggerNode, flow as any, chat);
                return true;
            }
        } catch (err) {
            logger.error('Flow execution error:', err);
        }
        return false;
    }

    private async runFlowNode(session: any, node: any, flow: any, chat: any, depth = 0): Promise<void> {
        if (depth > 20) { await this.endFlowSession(session); return; } // guard against loops

        const vars = Object.fromEntries(session.variables as Map<string, string>);
        const contact = await ContactModel.findOne({ phoneNumber: session.phoneNumber }).lean() as any;
        const ctx: Record<string, string> = {
            name:  contact?.name || contact?.pushName || 'Friend',
            phone: session.phoneNumber,
            ...vars,
        };
        const resolve = (text: string) =>
            (text || '').replace(/\{\{(\w+)(?:\|([^}]*))?\}\}/g, (_: string, k: string, fb: string) => ctx[k] || fb || '');

        const advance = async (handle = 'out') => {
            const edge = flow.edges.find((e: any) => e.source === node.id && e.sourceHandle === handle);
            if (!edge) { await this.endFlowSession(session); return; }
            const nextNode = flow.nodes.find((n: any) => n.id === edge.target);
            if (!nextNode) { await this.endFlowSession(session); return; }
            session.currentNodeId = nextNode.id;
            session.lastActivityAt = new Date();
            await session.save();
            await this.runFlowNode(session, nextNode, flow, chat, depth + 1);
        };

        try {
            switch (node.type) {
                case 'trigger':
                    await advance('out');
                    break;

                case 'message': {
                    const text = resolve(node.data.text || '');
                    if (text) await chat.sendMessage(text);
                    await advance('out');
                    break;
                }

                case 'question': {
                    const text = resolve(node.data.text || '');
                    if (text) await chat.sendMessage(text);
                    session.waitingForReply = true;
                    session.pendingVariable = node.data.variable || 'answer';
                    session.lastActivityAt = new Date();
                    await session.save();
                    break; // wait for reply — DO NOT advance
                }

                case 'condition': {
                    const actual   = ctx[node.data.variable || ''] || '';
                    const expected = resolve(node.data.value || '');
                    const op       = node.data.operator || 'equals';
                    let result = false;
                    if (op === 'equals')      result = actual.toLowerCase() === expected.toLowerCase();
                    else if (op === 'contains')    result = actual.toLowerCase().includes(expected.toLowerCase());
                    else if (op === 'starts_with') result = actual.toLowerCase().startsWith(expected.toLowerCase());
                    else if (op === 'not_empty')   result = actual.trim() !== '';
                    else if (op === 'is_empty')    result = actual.trim() === '';
                    await advance(result ? 'yes' : 'no');
                    break;
                }

                case 'tag': {
                    const tag    = node.data.tag || '';
                    const action = node.data.action || 'add';
                    if (tag) {
                        if (action === 'add') await ContactModel.updateOne({ phoneNumber: session.phoneNumber }, { $addToSet: { tags: tag } });
                        else                   await ContactModel.updateOne({ phoneNumber: session.phoneNumber }, { $pull:    { tags: tag } });
                    }
                    await advance('out');
                    break;
                }

                case 'delay': {
                    const secs = (parseInt(node.data.seconds) || 0) + (parseInt(node.data.minutes) || 0) * 60;
                    if (secs > 0 && secs <= 60) {
                        await new Promise(r => setTimeout(r, secs * 1000));
                    } else if (secs > 60) {
                        session.resumeAt = new Date(Date.now() + secs * 1000);
                        await session.save();
                    }
                    await advance('out');
                    break;
                }

                case 'set_variable': {
                    const varName = node.data.variable || '';
                    const value   = resolve(node.data.value || '');
                    if (varName) session.variables.set(varName, value);
                    await advance('out');
                    break;
                }

                case 'score': {
                    const pts = parseInt(node.data.points) || 0;
                    if (pts !== 0) await ContactModel.updateOne({ phoneNumber: session.phoneNumber }, { $inc: { score: pts } });
                    await advance('out');
                    break;
                }

                case 'transfer': {
                    const note = node.data.note ? resolve(node.data.note) : null;
                    if (note) await chat.sendMessage(`ℹ️ ${note}`);
                    await ContactModel.updateOne({ phoneNumber: session.phoneNumber }, { $addToSet: { tags: 'transfer-requested' } });
                    await this.endFlowSession(session);
                    break;
                }

                case 'jump': {
                    const targetFlow = await FlowModel.findById(node.data.flowId).lean();
                    if (targetFlow) {
                        const tNode = targetFlow.nodes.find((n: any) => n.type === 'trigger');
                        if (tNode) {
                            session.flowId = targetFlow._id;
                            session.currentNodeId = tNode.id;
                            await session.save();
                            await FlowModel.updateOne({ _id: targetFlow._id }, { $inc: { 'stats.activations': 1 } });
                            await this.runFlowNode(session, tNode, targetFlow as any, chat, depth + 1);
                            return;
                        }
                    }
                    await this.endFlowSession(session);
                    break;
                }

                case 'end':
                default: {
                    const text = node.data.text ? resolve(node.data.text) : null;
                    if (text) await chat.sendMessage(text);
                    await this.endFlowSession(session);
                    break;
                }
            }
        } catch (err) {
            logger.error(`runFlowNode error (type=${node.type}):`, err);
            await this.endFlowSession(session);
        }
    }

    private async endFlowSession(session: any): Promise<void> {
        session.status = 'completed';
        session.lastActivityAt = new Date();
        await session.save();
        await FlowModel.updateOne({ _id: session.flowId }, { $inc: { 'stats.completions': 1 } });
    }

    // ─────────────────────────────────────────────────────────────────────────

    private async handleTextMessage(message: Message, content: string, userI18n: UserI18n, chat: any) {
        const url = content.trim().split(/ +/)[0];
        const socialNetwork = identifySocialNetwork(url);

        if (url && isUrl(url)) {
            await commands["get"].run(message, null, url, socialNetwork, userI18n);
            return;
        }

        if (!content.startsWith(this.prefix)) return;

        const args = content.slice(this.prefix.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();

        if (command && command in commands) {
            const settings = await SettingsModel.findOne().lean();
            if (settings?.disabledCommands?.includes(command)) {
                chat.sendMessage(`> 🤖 ${userI18n.t('unknownCommand', { command, prefix: this.prefix })}`);
                return;
            }
            if (chat) await chat.sendStateTyping();
            await commands[command].run(message, args, userI18n);
            const phoneNumber = message.from.split('@')[0];
            applyScore(phoneNumber, 'command_used').catch(() => {});
            SettingsModel.findOneAndUpdate(
                {}, { $inc: { [`commandStats.${command}`]: 1 } }, { upsert: true }
            ).catch(() => {});
        } else {
            const errorMessage = userI18n.t('unknownCommand', {
                command: command || '',
                prefix: this.prefix
            });
            chat.sendMessage(`> 🤖 ${errorMessage}`);
        }
    }
}
