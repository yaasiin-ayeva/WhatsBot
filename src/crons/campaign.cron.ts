import WAWebJS from 'whatsapp-web.js';
import { BotManager } from '../bot.manager';
import logger from '../configs/logger.config';
import { CampaignModel } from '../crm/models/campaign.model';
import { ContactModel } from '../crm/models/contact.model';
import { ScheduledMessageModel } from '../crm/models/scheduled-message.model';
import { fireEvent } from '../utils/fire-event.util';

function resolveVariables(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)(?:\|([^}]*))?\}\}|\{(\w+)\}/g, (_, k1, fallback, k2) => {
        const key = k1 || k2;
        return vars[key] || fallback || '';
    });
}

export async function checkScheduledCampaigns(botManager: BotManager) {
    try {
        const now = new Date();
        const campaigns = await CampaignModel.find({
            status: 'scheduled',
            scheduledAt: { $lte: now }
        });
        for (const campaign of campaigns) {
            await sendCampaignMessages(botManager, campaign);
        }
    } catch (error) {
        logger.error('Failed to check scheduled campaigns:', error);
    }
}

export async function checkScheduledMessages(botManager: BotManager) {
    try {
        const now = new Date();
        const pending = await ScheduledMessageModel.find({
            status: 'pending',
            scheduledAt: { $lte: now }
        });
        for (const msg of pending) {
            try {
                const formattedNumber = msg.phoneNumber.includes('@')
                    ? msg.phoneNumber
                    : `${msg.phoneNumber}@c.us`;
                await botManager.client.sendMessage(formattedNumber, msg.message);
                msg.status = 'sent';
                msg.sentAt = new Date();
                await msg.save();
                logger.info(`Scheduled message sent to ${msg.phoneNumber}`);
                fireEvent('scheduled.sent', { phoneNumber: msg.phoneNumber }).catch(() => {});
            } catch (error) {
                logger.error(`Failed to send scheduled message to ${msg.phoneNumber}:`, error);
                msg.status = 'failed';
                msg.error = (error as any).message;
                await msg.save();
                fireEvent('scheduled.failed', { phoneNumber: msg.phoneNumber, error: (error as any).message }).catch(() => {});
            }
        }
    } catch (error) {
        logger.error('Failed to check scheduled messages:', error);
    }
}

export async function sendCampaignMessages(botManager: BotManager, campaign: any) {
    try {
        // Expiry check
        if (campaign.expiresAt && new Date() > new Date(campaign.expiresAt)) {
            campaign.status = 'cancelled';
            await campaign.save();
            logger.info(`Campaign "${campaign.name}" cancelled: past expiry date`);
            return;
        }

        campaign.status = 'sending';
        campaign.deliveryReport = [];
        await campaign.save();

        let sentCount = 0;
        let failedCount = 0;
        const throttleRate = campaign.throttleRate || 60;
        const delayMs = Math.floor(60000 / throttleRate);

        // Pre-fetch media attachment once if a URL is set
        let media: WAWebJS.MessageMedia | null = null;
        if (campaign.mediaUrl) {
            try {
                media = await WAWebJS.MessageMedia.fromUrl(campaign.mediaUrl, { unsafeMime: true });
            } catch (err) {
                logger.warn(`Campaign "${campaign.name}": could not fetch media from ${campaign.mediaUrl}`, err);
            }
        }

        for (let i = 0; i < campaign.contacts.length; i++) {
            // Pause/cancel detection every 10 contacts
            if (i > 0 && i % 10 === 0) {
                const fresh = await CampaignModel.findById(campaign._id).lean();
                if (fresh?.status === 'paused' || fresh?.status === 'cancelled') {
                    logger.info(`Campaign "${campaign.name}" stopped mid-send: status=${fresh.status}`);
                    campaign.sentCount = sentCount;
                    campaign.failedCount = failedCount;
                    await campaign.save();
                    return;
                }
            }

            const phoneNumber = campaign.contacts[i];
            try {
                const contact = await ContactModel.findOne({ phoneNumber }).lean();

                if (contact?.blocked) {
                    campaign.deliveryReport.push({ phone: phoneNumber, status: 'skipped', sentAt: new Date() });
                    continue;
                }

                // Exclude tags check
                if (campaign.excludeTags?.length && contact?.tags?.length) {
                    const hasExcluded = campaign.excludeTags.some((tag: string) => contact.tags.includes(tag));
                    if (hasExcluded) {
                        campaign.deliveryReport.push({ phone: phoneNumber, status: 'skipped', sentAt: new Date() });
                        continue;
                    }
                }

                const contactName = contact?.name || contact?.pushName || phoneNumber;
                const vars: Record<string, string> = {
                    name: contactName,
                    phone: phoneNumber,
                    date: new Date().toLocaleDateString()
                };

                const formattedNumber = phoneNumber.includes('@')
                    ? phoneNumber
                    : `${phoneNumber}@c.us`;

                // Multi-message sequence
                if (campaign.messages?.length > 0) {
                    for (const step of campaign.messages) {
                        const body = resolveVariables(step.content, vars);
                        if (media) {
                            await botManager.client.sendMessage(formattedNumber, media, { caption: body });
                        } else {
                            await botManager.client.sendMessage(formattedNumber, body);
                        }
                        if (step.delaySeconds > 0) {
                            await new Promise(r => setTimeout(r, step.delaySeconds * 1000));
                        }
                    }
                } else {
                    // A/B test: odd-index contacts get variant B
                    const rawBody = (campaign.abVariantB && i % 2 === 1)
                        ? campaign.abVariantB
                        : campaign.message;
                    const personalizedMessage = resolveVariables(rawBody, vars);
                    if (media) {
                        await botManager.client.sendMessage(formattedNumber, media, { caption: personalizedMessage });
                    } else {
                        await botManager.client.sendMessage(formattedNumber, personalizedMessage);
                    }
                }

                campaign.deliveryReport.push({ phone: phoneNumber, status: 'sent', sentAt: new Date() });
                sentCount++;
            } catch (error) {
                logger.error(`Failed to send message to ${phoneNumber}:`, error);
                campaign.deliveryReport.push({
                    phone: phoneNumber,
                    status: 'failed',
                    error: (error as any).message,
                    sentAt: new Date()
                });
                failedCount++;
            }

            // Throttle delay between sends
            if (i < campaign.contacts.length - 1) {
                await new Promise(r => setTimeout(r, delayMs));
            }
        }

        campaign.sentCount = sentCount;
        campaign.failedCount = failedCount;

        if (campaign.recurringType && campaign.recurringType !== 'none') {
            const next = new Date(campaign.scheduledAt);
            if (campaign.recurringType === 'daily') next.setDate(next.getDate() + 1);
            else if (campaign.recurringType === 'weekly') next.setDate(next.getDate() + 7);
            else if (campaign.recurringType === 'monthly') next.setMonth(next.getMonth() + 1);
            campaign.scheduledAt = next;
            campaign.status = 'scheduled';
        } else {
            campaign.status = sentCount > 0 ? 'sent' : 'failed';
        }

        campaign.sentAt = new Date();
        await campaign.save();

        fireEvent('campaign.completed', {
            name: campaign.name,
            sentCount,
            failedCount
        }).catch(() => {});

    } catch (error) {
        logger.error('Failed to send campaign:', error);
        campaign.status = 'failed';
        await campaign.save();
        fireEvent('campaign.failed', { name: campaign.name }).catch(() => {});
    }
}
