import express from 'express';
import { BotManager } from '../../bot.manager';
import logger from '../../configs/logger.config';
import { authenticate, authorizeAdmin } from '../middlewares/auth.middleware';
import { CampaignModel } from '../models/campaign.model';
import { ContactModel } from '../models/contact.model';
import { AuthService } from '../utils/auth.util';
import { TemplateModel } from '../models/template.model';
import { SettingsModel } from '../models/settings.model';
import { PhoneDetectionUtil } from '../../utils/phone-detection.util';
import { AuditLogModel } from '../models/audit-log.model';
import { UserModel } from '../models/user.model';
import { LogBuffer, LogEntry } from '../../utils/log-buffer.util';
import { sendCampaignMessages } from '../../crons/campaign.cron';
import commands from '../../commands';
import { MessageModel } from '../models/message.model';
import { ScoreRuleModel } from '../models/score-rule.model';
import { TemplateRevisionModel } from '../models/template-revision.model';
import { ScheduledMessageModel } from '../models/scheduled-message.model';
import { messageEmitter } from '../../utils/message-emitter.util';
import { IntegrationModel, INTEGRATION_EVENTS } from '../models/integration.model';
import { AutoReplyModel } from '../models/auto-reply.model';
import { fireEvent } from '../../utils/fire-event.util';
import { geminiCompletion } from '../../utils/gemini.util';
import { claudeCompletion } from '../../utils/claude.util';
import { chatGptCompletion } from '../../utils/chat-gpt.util';
import crypto from 'crypto';

export const router = express.Router();

// Audit Log Helper
async function addAuditLog(
    userId: string, username: string,
    action: string, resource: string,
    resourceId?: string, details?: any
) {
    try {
        await AuditLogModel.create({ userId, username, action, resource, resourceId, details });
    } catch (err) {
        logger.error('Failed to write audit log:', err);
    }
}

// CSV Helpers
function parseCSV(csv: string): Array<{ phoneNumber: string; name?: string }> {
    const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    let startIdx = 0;
    const firstLine = lines[0].toLowerCase();
    if (firstLine.includes('phone') || firstLine.includes('name')) startIdx = 1;
    return lines.slice(startIdx).map(line => {
        const parts = line.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
        const phoneNumber = parts[0]?.replace(/\s/g, '');
        const name = parts[1] || undefined;
        return phoneNumber ? { phoneNumber, name } : null;
    }).filter(Boolean) as Array<{ phoneNumber: string; name?: string }>;
}

function contactsToCSV(contacts: any[]): string {
    const header = 'phoneNumber,name,pushName,language,country,region,lastInteraction,tags,blocked,archived';
    const rows = contacts.map(c => [
        c.phoneNumber, c.name || '', c.pushName || '',
        c.detectedLanguage || '', c.detectedCountry || '', c.detectedRegion || '',
        c.lastInteraction ? new Date(c.lastInteraction).toISOString() : '',
        (c.tags || []).join(';'),
        c.blocked ? '1' : '0', c.archived ? '1' : '0'
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    return [header, ...rows].join('\n');
}

export default function (botManager: BotManager) {

    // Contacts
    router.get('/contacts', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { page = 1, limit = 20, search = '', sort = '-lastInteraction', language = '' } = req.query;
            const skip = (Number(page) - 1) * Number(limit);

            const query: any = {};
            if (req.query.showBlocked !== 'true') query.blocked = { $ne: true };
            if (req.query.showArchived === 'true') query.archived = true;
            else query.archived = { $ne: true };

            if (search) {
                query.$or = [
                    { phoneNumber: { $regex: search, $options: 'i' } },
                    { name: { $regex: search, $options: 'i' } },
                    { pushName: { $regex: search, $options: 'i' } }
                ];
            }
            if (language === 'en' || language === 'fr' || language === 'other') {
                query.detectedLanguage = language;
            }

            const contacts = await ContactModel.find(query)
                .sort(sort as string).skip(skip).limit(Number(limit));

            for (const contact of contacts) {
                if (!contact.detectedLanguage) {
                    const detection = PhoneDetectionUtil.detectLanguageFromPhone(contact.phoneNumber);
                    contact.detectedLanguage = detection.primaryLanguage;
                    contact.detectedCountry = detection.countryCode;
                    contact.detectedRegion = detection.region;
                    await contact.save();
                }
            }

            const total = await ContactModel.countDocuments(query);
            const stats = {
                total: await ContactModel.countDocuments({ blocked: { $ne: true }, archived: { $ne: true } }),
                english: await ContactModel.countDocuments({ detectedLanguage: 'en', blocked: { $ne: true } }),
                french: await ContactModel.countDocuments({ detectedLanguage: 'fr', blocked: { $ne: true } }),
                other: await ContactModel.countDocuments({ detectedLanguage: 'other', blocked: { $ne: true } }),
                blocked: await ContactModel.countDocuments({ blocked: true }),
                archived: await ContactModel.countDocuments({ archived: true }),
            };

            res.json({
                data: contacts,
                meta: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
                stats
            });
        } catch (error) {
            logger.error('Failed to fetch contacts:', error);
            res.status(500).json({ error: 'Failed to fetch contacts' });
        }
    });

    router.post('/contacts/import', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { csv } = req.body;
            if (!csv) return res.status(400).json({ error: 'csv field required' });
            const records = parseCSV(csv);
            if (!records.length) return res.status(400).json({ error: 'No valid records found' });

            const ops = records.map(r => ({
                updateOne: {
                    filter: { phoneNumber: r.phoneNumber },
                    update: { $set: { phoneNumber: r.phoneNumber, ...(r.name ? { name: r.name } : {}) } },
                    upsert: true
                }
            }));
            const result = await ContactModel.bulkWrite(ops);
            await addAuditLog(req.user.userId, req.user.username || '', 'contacts.import', 'contact', undefined, { count: records.length });
            res.json({ imported: records.length, upserted: result.upsertedCount, modified: result.modifiedCount });
        } catch (error) {
            logger.error('Failed to import contacts:', error);
            res.status(500).json({ error: 'Failed to import contacts' });
        }
    });

    router.get('/contacts/export', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const contacts = await ContactModel.find({ blocked: { $ne: true } }).sort('-lastInteraction');
            const csv = contactsToCSV(contacts);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
            res.send(csv);
        } catch (error) {
            logger.error('Failed to export contacts:', error);
            res.status(500).json({ error: 'Failed to export contacts' });
        }
    });

    router.patch('/contacts/:id/tags', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { tags } = req.body;
            const contact = await ContactModel.findByIdAndUpdate(req.params.id, { tags }, { new: true });
            if (!contact) return res.status(404).json({ error: 'Contact not found' });
            await addAuditLog(req.user.userId, req.user.username || '', 'contacts.tag', 'contact', req.params.id, { tags });
            res.json(contact);
        } catch (error) {
            logger.error('Failed to update tags:', error);
            res.status(500).json({ error: 'Failed to update tags' });
        }
    });

    router.patch('/contacts/:id/block', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const contact = await ContactModel.findById(req.params.id);
            if (!contact) return res.status(404).json({ error: 'Contact not found' });
            contact.blocked = !contact.blocked;
            await contact.save();
            await addAuditLog(req.user.userId, req.user.username || '', contact.blocked ? 'contacts.block' : 'contacts.unblock', 'contact', req.params.id);
            res.json(contact);
        } catch (error) {
            logger.error('Failed to toggle block:', error);
            res.status(500).json({ error: 'Failed to toggle block' });
        }
    });

    router.patch('/contacts/:id/archive', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const contact = await ContactModel.findById(req.params.id);
            if (!contact) return res.status(404).json({ error: 'Contact not found' });
            contact.archived = !contact.archived;
            await contact.save();
            await addAuditLog(req.user.userId, req.user.username || '', contact.archived ? 'contacts.archive' : 'contacts.unarchive', 'contact', req.params.id);
            res.json(contact);
        } catch (error) {
            logger.error('Failed to toggle archive:', error);
            res.status(500).json({ error: 'Failed to toggle archive' });
        }
    });

    // Campaigns
    router.post('/campaigns', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const {
                name, message, scheduledAt, contacts,
                recurringType, recurringDay,
                notes, throttleRate, expiresAt,
                excludeTags, abVariantB, messages, mediaUrl
            } = req.body;
            const campaign = new CampaignModel({
                name, message,
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                contacts,
                createdBy: req.user.userId,
                recurringType: recurringType || 'none',
                recurringDay: recurringDay || null,
                status: scheduledAt ? 'scheduled' : 'draft',
                notes: notes || '',
                throttleRate: throttleRate || 60,
                expiresAt: expiresAt ? new Date(expiresAt) : undefined,
                excludeTags: excludeTags || [],
                abVariantB: abVariantB || '',
                messages: messages || [],
                mediaUrl: mediaUrl || ''
            });
            await campaign.save();
            await addAuditLog(req.user.userId, req.user.username || '', 'campaign.create', 'campaign', String(campaign._id), { name });
            if (!scheduledAt) await sendCampaignMessages(botManager, campaign);
            res.status(201).json(campaign);
        } catch (error) {
            logger.error('Failed to create campaign:', error);
            res.status(500).json({ error: 'Failed to create campaign' });
        }
    });

    router.get('/campaigns', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const campaigns = await CampaignModel.find().sort({ createdAt: -1 }).populate('createdBy', 'username');
            res.json(campaigns);
        } catch (error) {
            logger.error('Failed to fetch campaigns:', error);
            res.status(500).json({ error: 'Failed to fetch campaigns' });
        }
    });

    router.delete('/campaigns/:id', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const campaign = await CampaignModel.findByIdAndDelete(req.params.id);
            if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
            await addAuditLog(req.user.userId, req.user.username || '', 'campaign.delete', 'campaign', req.params.id);
            res.json({ success: true });
        } catch (error) {
            logger.error('Failed to delete campaign:', error);
            res.status(500).json({ error: 'Failed to delete campaign' });
        }
    });

    router.get('/campaigns/:id/delivery-report', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const campaign = await CampaignModel.findById(req.params.id).select('name deliveryReport sentCount failedCount');
            if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
            res.json(campaign);
        } catch (error) {
            logger.error('Failed to fetch delivery report:', error);
            res.status(500).json({ error: 'Failed to fetch delivery report' });
        }
    });

    router.post('/campaigns/:id/retry', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const campaign = await CampaignModel.findById(req.params.id);
            if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
            const failedPhones = campaign.deliveryReport.filter(r => r.status === 'failed').map(r => r.phone);
            if (!failedPhones.length) return res.json({ message: 'No failed contacts to retry' });

            const tempCampaign = { ...campaign.toObject(), contacts: failedPhones, deliveryReport: [] };
            await sendCampaignMessages(botManager, tempCampaign);

            campaign.deliveryReport.push(...tempCampaign.deliveryReport);
            campaign.sentCount = (campaign.sentCount || 0) + (tempCampaign.sentCount || 0);
            campaign.failedCount = tempCampaign.failedCount || 0;
            if (campaign.failedCount === 0) campaign.status = 'sent';
            await campaign.save();

            await addAuditLog(req.user.userId, req.user.username || '', 'campaign.retry', 'campaign', req.params.id);
            res.json(campaign);
        } catch (error) {
            logger.error('Failed to retry campaign:', error);
            res.status(500).json({ error: 'Failed to retry campaign' });
        }
    });

    // Templates
    router.get('/templates', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const templates = await TemplateModel.find().sort({ createdAt: -1 });
            res.json(templates);
        } catch (error) {
            logger.error('Failed to fetch templates:', error);
            res.status(500).json({ error: 'Failed to fetch templates' });
        }
    });

    router.post('/templates', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { name, content, category } = req.body;
            const template = new TemplateModel({ name, content, category: category || 'general', createdBy: req.user.userId });
            await template.save();
            await addAuditLog(req.user.userId, req.user.username || '', 'template.create', 'template', String(template._id), { name });
            res.status(201).json(template);
        } catch (error) {
            logger.error('Failed to create template:', error);
            res.status(500).json({ error: 'Failed to create template' });
        }
    });

    router.put('/templates/:id', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { name, content, category } = req.body;
            const existing = await TemplateModel.findById(req.params.id);
            if (!existing) return res.status(404).json({ error: 'Template not found' });

            // Save revision snapshot before overwriting
            const currentRev = (existing as any).revision || 0;
            await TemplateRevisionModel.create({
                templateId: existing._id,
                revision: currentRev,
                name: (existing as any).name,
                content: (existing as any).content,
                category: (existing as any).category || 'general',
                savedBy: req.user.username || 'admin',
                savedAt: new Date()
            });

            const template = await TemplateModel.findByIdAndUpdate(
                req.params.id,
                { name, content, category, revision: currentRev + 1 },
                { new: true }
            );
            await addAuditLog(req.user.userId, req.user.username || '', 'template.update', 'template', req.params.id, { name });
            res.json(template);
        } catch (error) {
            logger.error('Failed to update template:', error);
            res.status(500).json({ error: 'Failed to update template' });
        }
    });

    router.delete('/templates/:id', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const template = await TemplateModel.findByIdAndDelete(req.params.id);
            if (!template) return res.status(404).json({ error: 'Template not found' });
            await addAuditLog(req.user.userId, req.user.username || '', 'template.delete', 'template', req.params.id);
            res.json({ success: true });
        } catch (error) {
            logger.error('Failed to delete template:', error);
            res.status(500).json({ error: 'Failed to delete template' });
        }
    });

    // Auth
    router.post('/auth/register', async (req, res) => {
        try {
            const { username, password, role } = req.body;
            const user = await AuthService.register(username, password, role || 'admin');
            res.status(201).json(user);
        } catch (error) {
            logger.error('Registration failed:', error);
            res.status(400).json({ error: error.message });
        }
    });

    router.post('/auth/login', async (req, res) => {
        try {
            const { username, password } = req.body;
            const { token, user } = await AuthService.login(username, password);
            res.json({ token, user });
        } catch (error) {
            logger.error('Login failed:', error);
            res.status(401).json({ error: error.message });
        }
    });

    router.get('/auth/check', authenticate, (req, res) => {
        res.json({ user: req.user });
    });

    // Settings
    router.get('/settings', authenticate, authorizeAdmin, async (req, res) => {
        try {
            let settings = await SettingsModel.findOne();
            if (!settings) settings = await SettingsModel.create({});

            const apiKeysMap: Map<string, string> = settings.get('apiKeys') || new Map();
            const maskedKeys: Record<string, string> = {};
            const displayKeys: Record<string, string> = {};
            const sensitiveKeys = new Set([
                'GEMINI_API_KEY',
                'CHAT_GPT_PROJECT_ID',
                'CHAT_GPT_ORG_ID',
                'CHAT_GPT_API_KEY',
                'ANTHROPIC_API_KEY',
                'OPENWEATHERMAP_API_KEY',
            ]);
            apiKeysMap.forEach((val, key) => {
                const masked = val.length > 8 ? val.slice(0, 4) + '…' + val.slice(-4) : val ? '****' : '';
                maskedKeys[key] = masked;
                displayKeys[key] = sensitiveKeys.has(key) ? masked : val;
            });

            const runtimeDisplayKeys = [
                'SHERPA_ONNX_ASR_ENCODER_PATH',
                'SHERPA_ONNX_ASR_DECODER_PATH',
                'SHERPA_ONNX_ASR_TOKENS_PATH',
                'SHERPA_ONNX_TTS_MODEL_PATH',
                'SHERPA_ONNX_TTS_TOKENS_PATH',
                'SHERPA_ONNX_TTS_LEXICON_PATH',
                'SHERPA_ONNX_TTS_DATA_DIR',
            ];
            runtimeDisplayKeys.forEach((key) => {
                if (!displayKeys[key] && process.env[key]) {
                    displayKeys[key] = String(process.env[key]);
                }
            });

            const hasRuntimeKey = (key: string) => !!(process.env[key] || apiKeysMap.get(key));

            res.json({
                ...settings.toObject(),
                apiKeysMasked: maskedKeys,
                apiKeysDisplay: displayKeys,
                env: {
                    GEMINI_API_KEY: hasRuntimeKey('GEMINI_API_KEY'),
                    OPENWEATHERMAP_API_KEY: hasRuntimeKey('OPENWEATHERMAP_API_KEY'),
                    SHERPA_ONNX_ASR_ENCODER_PATH: hasRuntimeKey('SHERPA_ONNX_ASR_ENCODER_PATH'),
                    SHERPA_ONNX_ASR_DECODER_PATH: hasRuntimeKey('SHERPA_ONNX_ASR_DECODER_PATH'),
                    SHERPA_ONNX_ASR_TOKENS_PATH: hasRuntimeKey('SHERPA_ONNX_ASR_TOKENS_PATH'),
                    SHERPA_ONNX_TTS_MODEL_PATH: hasRuntimeKey('SHERPA_ONNX_TTS_MODEL_PATH'),
                    SHERPA_ONNX_TTS_TOKENS_PATH: hasRuntimeKey('SHERPA_ONNX_TTS_TOKENS_PATH'),
                    SHERPA_ONNX_TTS_LEXICON_PATH: hasRuntimeKey('SHERPA_ONNX_TTS_LEXICON_PATH'),
                    CHAT_GPT_API_KEY: hasRuntimeKey('CHAT_GPT_API_KEY'),
                    ANTHROPIC_API_KEY: hasRuntimeKey('ANTHROPIC_API_KEY'),
                    ENV: process.env.ENV || 'unknown',
                    PORT: process.env.PORT || '3000',
                }
            });
        } catch (error) {
            logger.error('Failed to fetch settings:', error);
            res.status(500).json({ error: 'Failed to fetch settings' });
        }
    });

    router.put('/settings', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { maxFileSizeMb, autoDownloadEnabled, defaultAudioAiCommand, apiKeys } = req.body;
            const update: any = {};
            if (maxFileSizeMb !== undefined) update.maxFileSizeMb = maxFileSizeMb;
            if (autoDownloadEnabled !== undefined) update.autoDownloadEnabled = autoDownloadEnabled;
            if (defaultAudioAiCommand !== undefined) update.defaultAudioAiCommand = defaultAudioAiCommand;
            if (apiKeys && typeof apiKeys === 'object') {
                for (const [key, value] of Object.entries(apiKeys)) {
                    if (value) {
                        update[`apiKeys.${key}`] = value;
                        process.env[key] = String(value);
                    }
                }
            }
            const settings = await SettingsModel.findOneAndUpdate({}, update, { upsert: true, new: true });
            await addAuditLog(req.user.userId, req.user.username || '', 'settings.update', 'settings', undefined, { keys: Object.keys(req.body) });
            res.json(settings);
        } catch (error) {
            logger.error('Failed to update settings:', error);
            res.status(500).json({ error: 'Failed to update settings' });
        }
    });

    // Commands
    router.get('/commands', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const settings = await SettingsModel.findOne().lean() as any;
            const disabled: string[] = settings?.disabledCommands || [];
            const stats = settings?.commandStats || {};
            const list = Object.keys(commands).map(name => ({
                name, disabled: disabled.includes(name), usageCount: stats[name] || 0
            }));
            res.json(list);
        } catch (error) {
            logger.error('Failed to fetch commands:', error);
            res.status(500).json({ error: 'Failed to fetch commands' });
        }
    });

    router.get('/commands/stats', authenticate, authorizeAdmin, async (_req, res) => {
        try {
            const settings = await SettingsModel.findOne().lean() as any;
            res.json(settings?.commandStats || {});
        } catch (error) {
            logger.error('Failed to fetch command stats:', error);
            res.status(500).json({ error: 'Failed to fetch command stats' });
        }
    });

    router.patch('/commands/:name', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { name } = req.params;
            if (!(name in commands)) return res.status(404).json({ error: 'Command not found' });
            const settings = await SettingsModel.findOne().lean() as any;
            const disabled: string[] = settings?.disabledCommands || [];
            const isDisabled = disabled.includes(name);
            const update = isDisabled ? { $pull: { disabledCommands: name } } : { $addToSet: { disabledCommands: name } };
            await SettingsModel.findOneAndUpdate({}, update, { upsert: true });
            await addAuditLog(req.user.userId, req.user.username || '', isDisabled ? 'command.enable' : 'command.disable', 'command', name);
            res.json({ name, disabled: !isDisabled });
        } catch (error) {
            logger.error('Failed to toggle command:', error);
            res.status(500).json({ error: 'Failed to toggle command' });
        }
    });

    // Users
    router.get('/users', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const users = await UserModel.find().select('-password').sort({ createdAt: -1 });
            res.json(users);
        } catch (error) {
            logger.error('Failed to fetch users:', error);
            res.status(500).json({ error: 'Failed to fetch users' });
        }
    });

    router.put('/users/:id', authenticate, authorizeAdmin, async (req, res) => {
        try {
            if (req.params.id === req.user.userId) return res.status(400).json({ error: 'Cannot change your own role' });
            const { role } = req.body;
            const user = await UserModel.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
            if (!user) return res.status(404).json({ error: 'User not found' });
            await addAuditLog(req.user.userId, req.user.username || '', 'user.role', 'user', req.params.id, { role });
            res.json(user);
        } catch (error) {
            logger.error('Failed to update user:', error);
            res.status(500).json({ error: 'Failed to update user' });
        }
    });

    router.delete('/users/:id', authenticate, authorizeAdmin, async (req, res) => {
        try {
            if (req.params.id === req.user.userId) return res.status(400).json({ error: 'Cannot delete your own account' });
            const user = await UserModel.findByIdAndDelete(req.params.id);
            if (!user) return res.status(404).json({ error: 'User not found' });
            await addAuditLog(req.user.userId, req.user.username || '', 'user.delete', 'user', req.params.id, { username: user.username });
            res.json({ success: true });
        } catch (error) {
            logger.error('Failed to delete user:', error);
            res.status(500).json({ error: 'Failed to delete user' });
        }
    });

    // Audit Logs
    router.get('/audit-logs', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { page = 1, limit = 30, action = '', resource = '' } = req.query;
            const skip = (Number(page) - 1) * Number(limit);
            const query: any = {};
            if (action) query.action = { $regex: action, $options: 'i' };
            if (resource) query.resource = resource;
            const [logs, total] = await Promise.all([
                AuditLogModel.find(query).sort({ timestamp: -1 }).skip(skip).limit(Number(limit)),
                AuditLogModel.countDocuments(query)
            ]);
            res.json({ data: logs, meta: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } });
        } catch (error) {
            logger.error('Failed to fetch audit logs:', error);
            res.status(500).json({ error: 'Failed to fetch audit logs' });
        }
    });

    // Analytics
    router.get('/analytics', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
            const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
            const yesterdayEnd = new Date(todayStart);

            const [
                contactsOverTime, campaigns, langStats,
                contactsToday, contactsYesterday,
                messagesToday, messagesYesterday,
                failedCampaigns, recentAudit, settings
            ] = await Promise.all([
                ContactModel.aggregate([
                    { $match: { createdAt: { $gte: thirtyDaysAgo } } },
                    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
                    { $sort: { _id: 1 } }
                ]),
                CampaignModel.find().sort({ createdAt: -1 }).limit(20).select('name sentCount failedCount status'),
                Promise.all([
                    ContactModel.countDocuments({ detectedLanguage: 'en', blocked: { $ne: true } }),
                    ContactModel.countDocuments({ detectedLanguage: 'fr', blocked: { $ne: true } }),
                    ContactModel.countDocuments({ detectedLanguage: 'other', blocked: { $ne: true } }),
                ]),
                ContactModel.countDocuments({ createdAt: { $gte: todayStart, $lte: todayEnd } }),
                ContactModel.countDocuments({ createdAt: { $gte: yesterdayStart, $lt: yesterdayEnd } }),
                MessageModel.countDocuments({ direction: 'in', timestamp: { $gte: todayStart, $lte: todayEnd } }),
                MessageModel.countDocuments({ direction: 'in', timestamp: { $gte: yesterdayStart, $lt: yesterdayEnd } }),
                CampaignModel.find({ status: 'failed', updatedAt: { $gte: sevenDaysAgo } }).select('name createdAt').limit(10),
                AuditLogModel.find().sort({ timestamp: -1 }).limit(5).select('username action resource timestamp'),
                SettingsModel.findOne().lean()
            ]);

            const commandStats: Record<string, number> = (settings as any)?.commandStats || {};
            const topCommands = Object.entries(commandStats)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([name, count]) => ({ name, count }));

            res.json({
                contactsOverTime: contactsOverTime.map((d: any) => ({ date: d._id, count: d.count })),
                campaignDelivery: campaigns.map(c => ({ name: c.name, sentCount: c.sentCount || 0, failedCount: c.failedCount || 0, status: c.status })),
                languageDistribution: { en: langStats[0], fr: langStats[1], other: langStats[2] },
                contactsDelta: { today: contactsToday, yesterday: contactsYesterday },
                messagesDelta: { today: messagesToday, yesterday: messagesYesterday },
                failedCampaigns: failedCampaigns.map(c => ({ name: c.name, id: c._id })),
                topCommands,
                recentAudit
            });
        } catch (error) {
            logger.error('Failed to fetch analytics:', error);
            res.status(500).json({ error: 'Failed to fetch analytics' });
        }
    });

    // Bot Status
    router.get('/bot/status', authenticate, authorizeAdmin, (req, res) => {
        res.json(botManager.getStatus());
    });

    router.post('/bot/reconnect', authenticate, authorizeAdmin, async (req, res) => {
        try {
            await botManager.reconnect();
            await addAuditLog(req.user.userId, req.user.username || '', 'bot.reconnect', 'bot');
            res.json({ success: true });
        } catch (error) {
            logger.error('Failed to reconnect bot:', error);
            res.status(500).json({ error: 'Failed to reconnect' });
        }
    });

    // Log Streaming (SSE)
    router.get('/logs/stream', async (req, res) => {
        const token = req.query.token as string;
        if (!token) return res.status(401).end();
        const decoded = await AuthService.verifyToken(token) as any;
        if (!decoded || decoded.role !== 'admin') return res.status(401).end();

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });
        res.flushHeaders();

        const buffer = LogBuffer.getInstance();
        buffer.entries.forEach((entry: LogEntry) => {
            res.write(`data: ${JSON.stringify(entry)}\n\n`);
        });

        const onLog = (entry: LogEntry) => {
            try { res.write(`data: ${JSON.stringify(entry)}\n\n`); } catch (_) {}
        };
        buffer.emitter.on('log', onLog);
        req.on('close', () => buffer.emitter.off('log', onLog));
    });

    // Inbox
    router.get('/inbox', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const conversations = await MessageModel.aggregate([
                { $sort: { timestamp: -1 } },
                {
                    $group: {
                        _id: '$phoneNumber',
                        lastMessage: { $first: '$body' },
                        lastTimestamp: { $first: '$timestamp' },
                        direction: { $first: '$direction' },
                        unread: { $sum: { $cond: [{ $and: [{ $eq: ['$direction', 'in'] }, { $eq: ['$read', false] }] }, 1, 0] } }
                    }
                },
                { $sort: { lastTimestamp: -1 } },
                { $limit: 100 }
            ]);
            // Enrich with contact info
            const phones = conversations.map((c: any) => c._id);
            const contacts = await ContactModel.find({ phoneNumber: { $in: phones } }).lean();
            const contactMap: Record<string, any> = {};
            contacts.forEach(c => { contactMap[c.phoneNumber] = c; });
            const result = conversations.map((c: any) => ({
                phoneNumber: c._id,
                lastMessage: c.lastMessage,
                lastTimestamp: c.lastTimestamp,
                unread: c.unread,
                contact: contactMap[c._id] || null
            }));
            res.json(result);
        } catch (error) {
            logger.error('Failed to fetch inbox:', error);
            res.status(500).json({ error: 'Failed to fetch inbox' });
        }
    });

    router.get('/inbox/stream', async (req, res) => {
        const token = req.query.token as string;
        if (!token) return res.status(401).end();
        const decoded = await AuthService.verifyToken(token) as any;
        if (!decoded || decoded.role !== 'admin') return res.status(401).end();

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });
        res.flushHeaders();

        const onMsg = (msg: any) => {
            try { res.write(`data: ${JSON.stringify(msg)}\n\n`); } catch (_) {}
        };
        messageEmitter.on('message', onMsg);
        req.on('close', () => messageEmitter.off('message', onMsg));
    });

    router.get('/inbox/:phone', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { phone } = req.params;
            const messages = await MessageModel.find({ phoneNumber: phone })
                .sort({ timestamp: 1 })
                .limit(200);
            await MessageModel.updateMany(
                { phoneNumber: phone, direction: 'in', read: false },
                { $set: { read: true } }
            );
            const contact = await ContactModel.findOne({ phoneNumber: phone }).lean();
            res.json({ messages, contact });
        } catch (error) {
            logger.error('Failed to fetch conversation:', error);
            res.status(500).json({ error: 'Failed to fetch conversation' });
        }
    });

    router.post('/inbox/:phone/reply', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { phone } = req.params;
            const { message } = req.body;
            if (!message) return res.status(400).json({ error: 'message required' });

            const formattedNumber = phone.includes('@') ? phone : `${phone}@c.us`;
            await botManager.client.sendMessage(formattedNumber, message);

            const msgDoc = await MessageModel.create({
                phoneNumber: phone,
                body: message,
                type: 'text',
                direction: 'out',
                sentVia: 'admin',
                read: true,
                timestamp: new Date()
            });
            messageEmitter.emit('message', msgDoc.toObject());
            res.json(msgDoc);
        } catch (error) {
            logger.error('Failed to send reply:', error);
            res.status(500).json({ error: 'Failed to send reply' });
        }
    });

    // Contact Scoring
    router.get('/contacts/leaderboard', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const limit = Number(req.query.limit) || 10;
            const contacts = await ContactModel.find().sort({ score: -1 }).limit(limit).lean();
            res.json(contacts);
        } catch (error) {
            logger.error('Failed to fetch leaderboard:', error);
            res.status(500).json({ error: 'Failed to fetch leaderboard' });
        }
    });

    router.get('/scoring/rules', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const rules = await ScoreRuleModel.find().sort({ action: 1 });
            res.json(rules);
        } catch (error) {
            logger.error('Failed to fetch score rules:', error);
            res.status(500).json({ error: 'Failed to fetch score rules' });
        }
    });

    router.post('/scoring/rules', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { action, label, points, enabled } = req.body;
            const rule = new ScoreRuleModel({ action, label, points: Number(points), enabled: enabled !== false });
            await rule.save();
            await addAuditLog(req.user.userId, req.user.username || '', 'scoring.create', 'score-rule', String(rule._id), { action });
            res.status(201).json(rule);
        } catch (error) {
            logger.error('Failed to create score rule:', error);
            res.status(500).json({ error: 'Failed to create score rule' });
        }
    });

    router.put('/scoring/rules/:id', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { points, enabled, label } = req.body;
            const update: any = {};
            if (points !== undefined) update.points = Number(points);
            if (enabled !== undefined) update.enabled = enabled;
            if (label !== undefined) update.label = label;
            const rule = await ScoreRuleModel.findByIdAndUpdate(req.params.id, update, { new: true });
            if (!rule) return res.status(404).json({ error: 'Rule not found' });
            await addAuditLog(req.user.userId, req.user.username || '', 'scoring.update', 'score-rule', req.params.id);
            res.json(rule);
        } catch (error) {
            logger.error('Failed to update score rule:', error);
            res.status(500).json({ error: 'Failed to update score rule' });
        }
    });

    router.delete('/scoring/rules/:id', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const rule = await ScoreRuleModel.findByIdAndDelete(req.params.id);
            if (!rule) return res.status(404).json({ error: 'Rule not found' });
            await addAuditLog(req.user.userId, req.user.username || '', 'scoring.delete', 'score-rule', req.params.id);
            res.json({ success: true });
        } catch (error) {
            logger.error('Failed to delete score rule:', error);
            res.status(500).json({ error: 'Failed to delete score rule' });
        }
    });

    // Campaign Extra Actions
    router.patch('/campaigns/:id/pause', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const campaign = await CampaignModel.findByIdAndUpdate(req.params.id, { status: 'paused' }, { new: true });
            if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
            await addAuditLog(req.user.userId, req.user.username || '', 'campaign.pause', 'campaign', req.params.id);
            res.json(campaign);
        } catch (error) {
            logger.error('Failed to pause campaign:', error);
            res.status(500).json({ error: 'Failed to pause campaign' });
        }
    });

    router.patch('/campaigns/:id/resume', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const campaign = await CampaignModel.findByIdAndUpdate(req.params.id, { status: 'scheduled' }, { new: true });
            if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
            await addAuditLog(req.user.userId, req.user.username || '', 'campaign.resume', 'campaign', req.params.id);
            res.json(campaign);
        } catch (error) {
            logger.error('Failed to resume campaign:', error);
            res.status(500).json({ error: 'Failed to resume campaign' });
        }
    });

    router.patch('/campaigns/:id/cancel', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const campaign = await CampaignModel.findByIdAndUpdate(req.params.id, { status: 'cancelled' }, { new: true });
            if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
            await addAuditLog(req.user.userId, req.user.username || '', 'campaign.cancel', 'campaign', req.params.id);
            res.json(campaign);
        } catch (error) {
            logger.error('Failed to cancel campaign:', error);
            res.status(500).json({ error: 'Failed to cancel campaign' });
        }
    });

    router.patch('/campaigns/:id/archive', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const campaign = await CampaignModel.findByIdAndUpdate(req.params.id, { status: 'archived' }, { new: true });
            if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
            await addAuditLog(req.user.userId, req.user.username || '', 'campaign.archive', 'campaign', req.params.id);
            res.json(campaign);
        } catch (error) {
            logger.error('Failed to archive campaign:', error);
            res.status(500).json({ error: 'Failed to archive campaign' });
        }
    });

    router.patch('/campaigns/:id/notes', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { notes } = req.body;
            const campaign = await CampaignModel.findByIdAndUpdate(req.params.id, { notes }, { new: true });
            if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
            res.json(campaign);
        } catch (error) {
            logger.error('Failed to update notes:', error);
            res.status(500).json({ error: 'Failed to update notes' });
        }
    });

    router.get('/campaigns/:id/preview', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const campaign = await CampaignModel.findById(req.params.id).lean();
            if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
            const phone = String(req.query.phone || '');
            const contact = await ContactModel.findOne({ phoneNumber: phone }).lean();
            const vars = {
                name: contact?.name || contact?.pushName || phone || 'Friend',
                phone: phone || '0000000000',
                date: new Date().toLocaleDateString()
            };
            const preview = campaign.message.replace(/\{\{(\w+)(?:\|([^}]*))?\}\}|\{(\w+)\}/g, (_: any, k1: string, fallback: string, k2: string) => {
                const key = k1 || k2;
                return (vars as any)[key] || fallback || '';
            });
            res.json({ preview });
        } catch (error) {
            logger.error('Failed to preview campaign:', error);
            res.status(500).json({ error: 'Failed to preview campaign' });
        }
    });

    router.post('/campaigns/:id/test-send', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const campaign = await CampaignModel.findById(req.params.id).lean();
            if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
            const phone = String(req.query.phone || req.body.phone || '');
            if (!phone) return res.status(400).json({ error: 'phone required' });
            const contact = await ContactModel.findOne({ phoneNumber: phone }).lean();
            const vars = {
                name: contact?.name || contact?.pushName || phone,
                phone,
                date: new Date().toLocaleDateString()
            };
            const body = campaign.message.replace(/\{\{(\w+)(?:\|([^}]*))?\}\}|\{(\w+)\}/g, (_: any, k1: string, fallback: string, k2: string) => {
                const key = k1 || k2;
                return (vars as any)[key] || fallback || '';
            });
            const formattedNumber = phone.includes('@') ? phone : `${phone}@c.us`;
            await botManager.client.sendMessage(formattedNumber, body);
            res.json({ success: true });
        } catch (error) {
            logger.error('Failed to send test message:', error);
            res.status(500).json({ error: 'Failed to send test message' });
        }
    });

    router.get('/campaigns/:id/delivery-report/export', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const campaign = await CampaignModel.findById(req.params.id).select('name deliveryReport');
            if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
            const header = 'phone,status,error,sentAt,repliedAt';
            const rows = campaign.deliveryReport.map(r => [
                r.phone, r.status, r.error || '', r.sentAt ? new Date(r.sentAt).toISOString() : '',
                (r as any).repliedAt ? new Date((r as any).repliedAt).toISOString() : ''
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
            const csv = [header, ...rows].join('\n');
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="delivery-report-${req.params.id}.csv"`);
            res.send(csv);
        } catch (error) {
            logger.error('Failed to export delivery report:', error);
            res.status(500).json({ error: 'Failed to export delivery report' });
        }
    });

    // Template Extra Actions
    router.post('/templates/:id/duplicate', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const original = await TemplateModel.findById(req.params.id).lean();
            if (!original) return res.status(404).json({ error: 'Template not found' });
            const copy = new TemplateModel({
                name: `Copy of ${(original as any).name}`,
                content: (original as any).content,
                category: (original as any).category || 'general',
                createdBy: req.user.userId,
                pinned: false,
                usageCount: 0,
                revision: 0,
                approvalStatus: 'draft'
            });
            await copy.save();
            await addAuditLog(req.user.userId, req.user.username || '', 'template.duplicate', 'template', String(copy._id), { from: req.params.id });
            res.status(201).json(copy);
        } catch (error) {
            logger.error('Failed to duplicate template:', error);
            res.status(500).json({ error: 'Failed to duplicate template' });
        }
    });

    router.patch('/templates/:id/pin', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const template = await TemplateModel.findById(req.params.id);
            if (!template) return res.status(404).json({ error: 'Template not found' });
            (template as any).pinned = !(template as any).pinned;
            await template.save();
            await addAuditLog(req.user.userId, req.user.username || '', (template as any).pinned ? 'template.pin' : 'template.unpin', 'template', req.params.id);
            res.json(template);
        } catch (error) {
            logger.error('Failed to toggle pin:', error);
            res.status(500).json({ error: 'Failed to toggle pin' });
        }
    });

    router.patch('/templates/:id/approval', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { approvalStatus } = req.body;
            const template = await TemplateModel.findByIdAndUpdate(req.params.id, { approvalStatus }, { new: true });
            if (!template) return res.status(404).json({ error: 'Template not found' });
            await addAuditLog(req.user.userId, req.user.username || '', 'template.approval', 'template', req.params.id, { approvalStatus });
            res.json(template);
        } catch (error) {
            logger.error('Failed to update approval:', error);
            res.status(500).json({ error: 'Failed to update approval' });
        }
    });

    router.get('/templates/:id/revisions', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const revisions = await TemplateRevisionModel.find({ templateId: req.params.id }).sort({ revision: -1 });
            res.json(revisions);
        } catch (error) {
            logger.error('Failed to fetch revisions:', error);
            res.status(500).json({ error: 'Failed to fetch revisions' });
        }
    });

    router.post('/templates/:id/revisions/:rev/restore', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const revision = await TemplateRevisionModel.findOne({ templateId: req.params.id, revision: Number(req.params.rev) });
            if (!revision) return res.status(404).json({ error: 'Revision not found' });
            const template = await TemplateModel.findById(req.params.id);
            if (!template) return res.status(404).json({ error: 'Template not found' });

            // Save current state as new revision before restoring
            const currentRev = (template as any).revision || 0;
            await TemplateRevisionModel.create({
                templateId: template._id,
                revision: currentRev,
                name: (template as any).name,
                content: (template as any).content,
                category: (template as any).category || 'general',
                savedBy: req.user.username || 'admin',
                savedAt: new Date()
            });

            (template as any).name = revision.name;
            (template as any).content = revision.content;
            (template as any).category = revision.category;
            (template as any).revision = currentRev + 1;
            await template.save();

            await addAuditLog(req.user.userId, req.user.username || '', 'template.restore', 'template', req.params.id, { revision: req.params.rev });
            res.json(template);
        } catch (error) {
            logger.error('Failed to restore revision:', error);
            res.status(500).json({ error: 'Failed to restore revision' });
        }
    });

    // Scheduled Messages
    router.get('/scheduled-messages', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const msgs = await ScheduledMessageModel.find().sort({ scheduledAt: 1 });
            res.json(msgs);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch scheduled messages' });
        }
    });

    router.post('/scheduled-messages', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { phoneNumber, message, scheduledAt, contactName } = req.body;
            if (!phoneNumber || !message || !scheduledAt) {
                return res.status(400).json({ error: 'phoneNumber, message and scheduledAt are required' });
            }
            const doc = await ScheduledMessageModel.create({
                phoneNumber, message,
                scheduledAt: new Date(scheduledAt),
                contactName: contactName || '',
                createdBy: req.user.userId
            });
            await addAuditLog(req.user.userId, req.user.username || '', 'scheduled_message.create', 'scheduled_message', String(doc._id), { phoneNumber, scheduledAt });
            res.status(201).json(doc);
        } catch (error) {
            res.status(500).json({ error: 'Failed to create scheduled message' });
        }
    });

    router.delete('/scheduled-messages/:id', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const doc = await ScheduledMessageModel.findById(req.params.id);
            if (!doc) return res.status(404).json({ error: 'Not found' });
            if (doc.status === 'sent') return res.status(400).json({ error: 'Cannot delete a sent message' });
            await doc.deleteOne();
            await addAuditLog(req.user.userId, req.user.username || '', 'scheduled_message.delete', 'scheduled_message', req.params.id, {});
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete scheduled message' });
        }
    });

    // Conversations Search
    router.get('/conversations/search', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const q = (req.query.q as string || '').trim();
            const phone = (req.query.phone as string || '').trim();
            const filter: any = {};
            if (phone) filter.phoneNumber = { $regex: phone, $options: 'i' };
            if (q) filter.body = { $regex: q, $options: 'i' };

            const messages = await MessageModel.find(filter)
                .sort({ timestamp: -1 })
                .limit(200)
                .lean();

            // Group by phoneNumber for conversation threads
            const threadMap: Record<string, any[]> = {};
            messages.forEach(m => {
                if (!threadMap[m.phoneNumber]) threadMap[m.phoneNumber] = [];
                threadMap[m.phoneNumber].push(m);
            });

            const phones = Object.keys(threadMap);
            const contacts = await ContactModel.find({ phoneNumber: { $in: phones } }).lean();
            const contactMap: Record<string, any> = {};
            contacts.forEach(c => { contactMap[c.phoneNumber] = c; });

            const threads = phones.map(pn => ({
                phoneNumber: pn,
                contact: contactMap[pn] || null,
                matchCount: threadMap[pn].length,
                lastMessage: threadMap[pn][0]?.body || '',
                lastTimestamp: threadMap[pn][0]?.timestamp || null,
                messages: threadMap[pn].reverse() // chronological order
            }));

            res.json(threads);
        } catch (error) {
            res.status(500).json({ error: 'Failed to search conversations' });
        }
    });

    // Direct Message
    router.post('/send-message', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { phoneNumber, message } = req.body;
            const formattedNumber = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@c.us`;
            await botManager.client.sendMessage(formattedNumber, message);
            res.json({ success: true });
        } catch (error) {
            logger.error('Failed to send message:', error);
            res.status(500).json({ error: 'Failed to send message' });
        }
    });

    // Integrations (Webhooks / Slack / Discord)
    router.get('/integrations', authenticate, authorizeAdmin, async (_req, res) => {
        try {
            const items = await IntegrationModel.find().sort({ createdAt: -1 }).lean();
            res.json(items);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch integrations' });
        }
    });

    router.get('/integrations/events', authenticate, authorizeAdmin, (_req, res) => {
        res.json(INTEGRATION_EVENTS);
    });

    router.post('/integrations', authenticate, authorizeAdmin, async (req: any, res) => {
        try {
            const { name, type, url, events, secret, enabled } = req.body;
            if (!name || !type || !url) return res.status(400).json({ error: 'name, type, url are required' });
            const integration = await IntegrationModel.create({
                name, type, url,
                events: events || [],
                secret: secret || '',
                enabled: enabled !== false,
                createdBy: req.user?.id
            });
            await addAuditLog(req.user?.id, req.user?.username, 'create', 'integration', String(integration._id), { name, type });
            res.status(201).json(integration);
        } catch (error) {
            res.status(500).json({ error: 'Failed to create integration' });
        }
    });

    // SMTP Settings
    // Keep these above /integrations/:id so "smtp" is not treated as an id.
    router.get('/integrations/smtp', authenticate, authorizeAdmin, async (_req, res) => {
        try {
            const settings = await SettingsModel.findOne().lean() as any;
            res.json(settings?.smtp || {});
        } catch (error) {
            logger.error('Failed to fetch SMTP settings:', error);
            res.status(500).json({ error: 'Failed to fetch SMTP settings' });
        }
    });

    router.put('/integrations/smtp', authenticate, authorizeAdmin, async (req: any, res) => {
        try {
            const { host, port, secure, user, pass, fromName, fromEmail } = req.body;
            await SettingsModel.findOneAndUpdate(
                {},
                { $set: { 'smtp.host': host, 'smtp.port': port, 'smtp.secure': secure, 'smtp.user': user, 'smtp.pass': pass, 'smtp.fromName': fromName, 'smtp.fromEmail': fromEmail } },
                { upsert: true }
            );
            await addAuditLog(req.user?.userId, req.user?.username, 'update', 'smtp-settings');
            res.json({ success: true });
        } catch (error) {
            logger.error('Failed to save SMTP settings:', error);
            res.status(500).json({ error: 'Failed to save SMTP settings' });
        }
    });

    router.post('/integrations/smtp/test', authenticate, authorizeAdmin, async (_req, res) => {
        try {
            const settings = await SettingsModel.findOne().lean() as any;
            const smtp = settings?.smtp;
            if (!smtp?.host || !smtp?.user || !smtp?.pass) {
                return res.status(400).json({ error: 'SMTP not fully configured' });
            }
            const nodemailer = await import('nodemailer');
            const transporter = nodemailer.default.createTransport({
                host: smtp.host, port: smtp.port || 587,
                secure: smtp.secure || false,
                auth: { user: smtp.user, pass: smtp.pass }
            });
            await transporter.verify();
            res.json({ success: true, message: 'SMTP connection verified successfully' });
        } catch (error: any) {
            logger.error('SMTP connection test failed:', error);
            res.status(400).json({ error: error.message || 'SMTP connection failed' });
        }
    });

    router.put('/integrations/:id', authenticate, authorizeAdmin, async (req: any, res) => {
        try {
            const { name, type, url, events, secret, enabled } = req.body;
            const integration = await IntegrationModel.findByIdAndUpdate(
                req.params.id,
                { name, type, url, events, secret, enabled },
                { new: true }
            );
            if (!integration) return res.status(404).json({ error: 'Not found' });
            await addAuditLog(req.user?.id, req.user?.username, 'update', 'integration', req.params.id, { name });
            res.json(integration);
        } catch (error) {
            res.status(500).json({ error: 'Failed to update integration' });
        }
    });

    router.delete('/integrations/:id', authenticate, authorizeAdmin, async (req: any, res) => {
        try {
            await IntegrationModel.findByIdAndDelete(req.params.id);
            await addAuditLog(req.user?.id, req.user?.username, 'delete', 'integration', req.params.id);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete integration' });
        }
    });

    // Test-fire an integration manually
    router.post('/integrations/:id/test', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const integration = await IntegrationModel.findById(req.params.id).lean();
            if (!integration) return res.status(404).json({ error: 'Not found' });
            const testPayload = { phoneNumber: 'test-number', body: 'Test event fired from admin panel', name: 'Test Campaign', sentCount: 10, failedCount: 2 };
            await fireEvent(integration.events[0] as any || 'message.received', testPayload);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Test failed' });
        }
    });

    // Auto-Reply Rules
    router.get('/auto-reply', authenticate, authorizeAdmin, async (_req, res) => {
        try {
            const rules = await AutoReplyModel.find().sort({ priority: -1, createdAt: 1 }).lean();
            res.json(rules);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch auto-reply rules' });
        }
    });

    router.post('/auto-reply', authenticate, authorizeAdmin, async (req: any, res) => {
        try {
            const { name, matchType, trigger, response, useAI, aiProvider, aiPrompt, cooldownMinutes, priority, enabled } = req.body;
            if (!name || !trigger) return res.status(400).json({ error: 'name and trigger are required' });
            const rule = await AutoReplyModel.create({
                name, matchType: matchType || 'contains', trigger,
                response: response || '',
                useAI: useAI || false,
                aiProvider: aiProvider || 'none',
                aiPrompt: aiPrompt || '',
                cooldownMinutes: cooldownMinutes ?? 60,
                priority: priority ?? 0,
                enabled: enabled !== false,
                createdBy: req.user?.id
            });
            await addAuditLog(req.user?.id, req.user?.username, 'create', 'auto-reply', String(rule._id), { name });
            res.status(201).json(rule);
        } catch (error) {
            res.status(500).json({ error: 'Failed to create auto-reply rule' });
        }
    });

    router.put('/auto-reply/:id', authenticate, authorizeAdmin, async (req: any, res) => {
        try {
            const rule = await AutoReplyModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
            if (!rule) return res.status(404).json({ error: 'Not found' });
            await addAuditLog(req.user?.id, req.user?.username, 'update', 'auto-reply', req.params.id, { name: rule.name });
            res.json(rule);
        } catch (error) {
            res.status(500).json({ error: 'Failed to update auto-reply rule' });
        }
    });

    router.delete('/auto-reply/:id', authenticate, authorizeAdmin, async (req: any, res) => {
        try {
            await AutoReplyModel.findByIdAndDelete(req.params.id);
            await addAuditLog(req.user?.id, req.user?.username, 'delete', 'auto-reply', req.params.id);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete auto-reply rule' });
        }
    });

    // Inbound API
    // External systems can POST here to send a WhatsApp message, no login needed — API key required
    router.post('/inbound/send', async (req, res) => {
        try {
            const apiKey = req.headers['x-api-key'] as string || req.body.apiKey;
            if (!apiKey) return res.status(401).json({ error: 'API key required' });

            const settings = await SettingsModel.findOne().lean() as any;
            if (!settings?.inboundApiKey || settings.inboundApiKey !== apiKey) {
                return res.status(403).json({ error: 'Invalid API key' });
            }

            const { phoneNumber, message } = req.body;
            if (!phoneNumber || !message) return res.status(400).json({ error: 'phoneNumber and message required' });

            const formattedNumber = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@c.us`;
            await botManager.client.sendMessage(formattedNumber, message);
            res.json({ success: true });
        } catch (error) {
            logger.error('Inbound API send failed:', error);
            res.status(500).json({ error: 'Failed to send message' });
        }
    });

    // Groups / Recap

    // GET /crm/groups — distinct groups known from persisted messages
    router.get('/groups', authenticate, authorizeAdmin, async (_req, res) => {
        try {
            const groups = await MessageModel.aggregate([
                { $match: { isGroup: true, groupId: { $exists: true, $ne: null } } },
                { $group: { _id: '$groupId', count: { $sum: 1 }, lastMessage: { $max: '$timestamp' } } },
                { $sort: { lastMessage: -1 } },
            ]);

            // Resolve group names from the live WhatsApp client where possible
            const result = await Promise.all(groups.map(async (g) => {
                let name = g._id;
                try {
                    const waChat = await botManager.client.getChatById(g._id);
                    if (waChat?.name) name = waChat.name;
                } catch (_) { /* client may not be connected */ }
                return { id: g._id, name, count: g.count, lastMessage: g.lastMessage };
            }));

            res.json(result);
        } catch (error) {
            logger.error('GET /groups error:', error);
            res.status(500).json({ error: 'Failed to fetch groups' });
        }
    });

    // POST /crm/groups/:groupId/recap — AI summary of group messages for a period
    router.post('/groups/:groupId/recap', authenticate, authorizeAdmin, async (req: any, res) => {
        try {
            const { groupId } = req.params;
            const { period = '24h' } = req.body;

            // Parse period string (e.g. "6h", "2d", "1w")
            const match = (period as string).match(/^(\d+)(h|d|w)$/);
            let ms = 24 * 3600 * 1000;
            let label = 'last 24 hours';
            if (match) {
                const n = parseInt(match[1], 10);
                const unit = match[2];
                if (unit === 'h') { ms = n * 3600 * 1000; label = `last ${n} hour${n === 1 ? '' : 's'}`; }
                else if (unit === 'd') { ms = n * 24 * 3600 * 1000; label = `last ${n} day${n === 1 ? '' : 's'}`; }
                else { ms = n * 7 * 24 * 3600 * 1000; label = `last ${n} week${n === 1 ? '' : 's'}`; }
            }
            const cutoff = new Date(Date.now() - ms);

            const messages = await MessageModel.find({
                groupId,
                isGroup: true,
                timestamp: { $gte: cutoff },
            }).sort({ timestamp: 1 }).lean();

            if (!messages.length) {
                return res.json({ summary: null, count: 0, label });
            }

            // Build transcript
            const transcript = messages.map(m => {
                const t = new Date(m.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                return `[${t}] ${m.senderName || m.phoneNumber}: ${m.body}`;
            }).join('\n');

            // Resolve group name
            let groupName = groupId;
            try {
                const waChat = await botManager.client.getChatById(groupId);
                if (waChat?.name) groupName = waChat.name;
            } catch (_) { /* ignore */ }

            // Pick AI provider from settings (same setting as audio AI command)
            const settings = await SettingsModel.findOne().lean() as any;
            const provider: string = settings?.defaultAudioAiCommand || 'chat';

            const prompt = `You are summarising the WhatsApp group "${groupName}".
Below is a transcript of the conversation from the ${label} (${messages.length} messages).
Each line is formatted as: [HH:MM] Name: message

Provide a structured summary using **bold** section headers. When attributing a topic, decision, or statement to someone, always mention them by name (e.g. "Alice raised...", "Bob and Carol agreed on..."). Only use names that appear in the transcript — do not invent or assume names.

**Participants**
List every person who sent at least one message.

**Main topics discussed**
For each topic, note who raised or drove it.

**Key decisions or conclusions**
Attribute decisions to the people who made them.

**Important announcements**
Note who announced what.

**Notable exchanges**
Highlight any significant back-and-forth between specific people.

Skip any section with nothing to report. Keep the total under 500 words. Be concise and factual.

Transcript:
${transcript}`;

            let summary = '';
            if (provider === 'gpt') {
                const result = await chatGptCompletion(prompt);
                summary = result.choices[0]?.message?.content || '';
            } else if (provider === 'claude') {
                const result = await claudeCompletion(
                    prompt,
                    'You are a helpful assistant that summarises group conversations.'
                );
                summary = result?.content?.find((c: any) => c.type === 'text')?.text || '';
            } else {
                const result = await geminiCompletion(prompt);
                summary = result.response.text() || '';
            }

            res.json({ summary: summary.trim(), count: messages.length, label, groupName, provider });
        } catch (error) {
            logger.error('POST /groups/:groupId/recap error:', error);
            res.status(500).json({ error: 'Failed to generate recap' });
        }
    });

    // Get / rotate inbound API key (admin only)
    router.get('/inbound/api-key', authenticate, authorizeAdmin, async (_req, res) => {
        try {
            const settings = await SettingsModel.findOne().lean() as any;
            res.json({ inboundApiKey: settings?.inboundApiKey || '' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch API key' });
        }
    });

    router.post('/inbound/api-key/rotate', authenticate, authorizeAdmin, async (req: any, res) => {
        try {
            const newKey = crypto.randomBytes(24).toString('hex');
            await SettingsModel.findOneAndUpdate({}, { inboundApiKey: newKey }, { upsert: true });
            await addAuditLog(req.user?.id, req.user?.username, 'rotate', 'inbound-api-key');
            res.json({ inboundApiKey: newKey });
        } catch (error) {
            res.status(500).json({ error: 'Failed to rotate API key' });
        }
    });

    return router;
}
