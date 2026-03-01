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

export const router = express.Router();

// ─── Audit Log Helper ────────────────────────────────────────────────────────
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

// ─── CSV Helpers ─────────────────────────────────────────────────────────────
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

    // ── Contacts ──────────────────────────────────────────────────────────────
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

    // ── Campaigns ─────────────────────────────────────────────────────────────
    router.post('/campaigns', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { name, message, scheduledAt, contacts, recurringType, recurringDay } = req.body;
            const campaign = new CampaignModel({
                name, message,
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                contacts,
                createdBy: req.user.userId,
                recurringType: recurringType || 'none',
                recurringDay: recurringDay || null,
                status: scheduledAt ? 'scheduled' : 'draft'
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

    // ── Templates ─────────────────────────────────────────────────────────────
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
            const template = await TemplateModel.findByIdAndUpdate(req.params.id, { name, content, category }, { new: true });
            if (!template) return res.status(404).json({ error: 'Template not found' });
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

    // ── Auth ──────────────────────────────────────────────────────────────────
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

    // ── Settings ──────────────────────────────────────────────────────────────
    router.get('/settings', authenticate, authorizeAdmin, async (req, res) => {
        try {
            let settings = await SettingsModel.findOne();
            if (!settings) settings = await SettingsModel.create({});

            const apiKeysMap: Map<string, string> = settings.get('apiKeys') || new Map();
            const maskedKeys: Record<string, string> = {};
            apiKeysMap.forEach((val, key) => {
                maskedKeys[key] = val.length > 8 ? val.slice(0, 4) + '…' + val.slice(-4) : val ? '****' : '';
            });

            res.json({
                ...settings.toObject(),
                apiKeysMasked: maskedKeys,
                env: {
                    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
                    OPENWEATHERMAP_API_KEY: !!process.env.OPENWEATHERMAP_API_KEY,
                    ASSEMBLYAI_API_KEY: !!process.env.ASSEMBLYAI_API_KEY,
                    SPEECHIFY_API_KEY: !!process.env.SPEECHIFY_API_KEY,
                    CHAT_GPT_API_KEY: !!process.env.CHAT_GPT_API_KEY,
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
            const { maxFileSizeMb, autoDownloadEnabled, apiKeys } = req.body;
            const update: any = {};
            if (maxFileSizeMb !== undefined) update.maxFileSizeMb = maxFileSizeMb;
            if (autoDownloadEnabled !== undefined) update.autoDownloadEnabled = autoDownloadEnabled;
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

    // ── Commands ──────────────────────────────────────────────────────────────
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

    // ── Users ─────────────────────────────────────────────────────────────────
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

    // ── Audit Logs ────────────────────────────────────────────────────────────
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

    // ── Analytics ─────────────────────────────────────────────────────────────
    router.get('/analytics', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const [contactsOverTime, campaigns, langStats] = await Promise.all([
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
                ])
            ]);
            res.json({
                contactsOverTime: contactsOverTime.map((d: any) => ({ date: d._id, count: d.count })),
                campaignDelivery: campaigns.map(c => ({ name: c.name, sentCount: c.sentCount || 0, failedCount: c.failedCount || 0, status: c.status })),
                languageDistribution: { en: langStats[0], fr: langStats[1], other: langStats[2] }
            });
        } catch (error) {
            logger.error('Failed to fetch analytics:', error);
            res.status(500).json({ error: 'Failed to fetch analytics' });
        }
    });

    // ── Bot Status ────────────────────────────────────────────────────────────
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

    // ── Log Streaming (SSE) ───────────────────────────────────────────────────
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

    // ── Direct Message ────────────────────────────────────────────────────────
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

    return router;
}
