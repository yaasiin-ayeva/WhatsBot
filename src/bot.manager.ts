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
const qrcode = require('qrcode-terminal');

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

    private async trackContact(user: WAWebJS.Contact, message: Message, userI18n: UserI18n) {
        try {
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
        } catch (error) {
            logger.error('Failed to track contact:', error);
        }
    }

    private async handleMessage(message: Message) {
        let chat = null;
        let userI18n: UserI18n;

        const content = message.body.trim();

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
        await commands[AppConfig.instance.getDefaultAudioAiCommand()].run(message, args, userI18n);
    }

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