import express from 'express';
import { BotManager } from '../../bot.manager';
import logger from '../../configs/logger.config';
import { authenticate, authorizeAdmin } from '../middlewares/auth.middleware';
import { CampaignModel } from '../models/campaign.model';
import { ContactModel } from '../models/contact.model';
import { AuthService } from '../utils/auth.util';

export const router = express.Router();

export default function (botManager: BotManager) {
    // Contacts API
    router.get('/contacts', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { page = 1, limit = 20, search = '' } = req.query;
            const skip = (Number(page) - 1) * Number(limit);

            const query = search
                ? {
                    $or: [
                        { phoneNumber: { $regex: search, $options: 'i' } },
                        { name: { $regex: search, $options: 'i' } },
                        { pushName: { $regex: search, $options: 'i' } }
                    ]
                }
                : {};

            const contacts = await ContactModel.find(query)
                .sort({ lastInteraction: -1 })
                .skip(skip)
                .limit(Number(limit));

            const total = await ContactModel.countDocuments(query);

            res.json({
                data: contacts,
                meta: {
                    total,
                    page: Number(page),
                    limit: Number(limit),
                    pages: Math.ceil(total / Number(limit))
                }
            });
        } catch (error) {
            logger.error('Failed to fetch contacts:', error);
            res.status(500).json({ error: 'Failed to fetch contacts' });
        }
    });

    // Campaigns API
    router.post('/campaigns', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { name, message, scheduledAt, contacts } = req.body;

            const campaign = new CampaignModel({
                name,
                message,
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                contacts,
                createdBy: req.user.userId,
                status: scheduledAt ? 'scheduled' : 'draft'
            });

            await campaign.save();

            if (!scheduledAt) {
                // Send immediately
                await sendCampaignMessages(botManager, campaign);
            }

            res.status(201).json(campaign);
        } catch (error) {
            logger.error('Failed to create campaign:', error);
            res.status(500).json({ error: 'Failed to create campaign' });
        }
    });

    router.get('/campaigns', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const campaigns = await CampaignModel.find()
                .sort({ createdAt: -1 })
                .populate('createdBy', 'username');

            res.json(campaigns);
        } catch (error) {
            logger.error('Failed to fetch campaigns:', error);
            res.status(500).json({ error: 'Failed to fetch campaigns' });
        }
    });


    router.post('/auth/register', async (req, res) => {
        try {
            const { username, password } = req.body;
            const user = await AuthService.register(username, password, 'admin');
            res.status(201).json(user);
        } catch (error) {
            logger.error('Registration failed:', error);
            res.status(400).json({ error: error.message });
        }
    });

    router.post('/auth/login', async (req, res) => {
        try {
            const { username, password } = req.body;
            console.log("Username:", username);
            console.log("Password:", password);


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

    // Send message route
    router.post('/send-message', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const { phoneNumber, message } = req.body;
            const formattedNumber = phoneNumber.includes('@')
                ? phoneNumber
                : `${phoneNumber}@c.us`;

            await botManager.client.sendMessage(formattedNumber, message);
            res.json({ success: true });
        } catch (error) {
            logger.error('Failed to send message:', error);
            res.status(500).json({ error: 'Failed to send message' });
        }
    });

    return router;
}

async function sendCampaignMessages(botManager: BotManager, campaign: any) {
    try {
        campaign.status = 'sending';
        await campaign.save();

        let sentCount = 0;
        let failedCount = 0;

        for (const phoneNumber of campaign.contacts) {
            try {
                // Format phone number if needed (add country code, etc.)
                const formattedNumber = phoneNumber.includes('@')
                    ? phoneNumber
                    : `${phoneNumber}@c.us`;

                await botManager.client.sendMessage(formattedNumber, campaign.message);
                sentCount++;
            } catch (error) {
                logger.error(`Failed to send message to ${phoneNumber}:`, error);
                failedCount++;
            }
        }

        campaign.sentCount = sentCount;
        campaign.failedCount = failedCount;
        campaign.status = sentCount > 0 ? 'sent' : 'failed';
        campaign.sentAt = new Date();
        await campaign.save();

    } catch (error) {
        logger.error('Failed to send campaign:', error);
        campaign.status = 'failed';
        await campaign.save();
    }
}

