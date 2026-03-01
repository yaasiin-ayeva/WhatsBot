import { BotManager } from '../bot.manager';
import logger from '../configs/logger.config';
import { CampaignModel } from '../crm/models/campaign.model';
import { ContactModel } from '../crm/models/contact.model';

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

export async function sendCampaignMessages(botManager: BotManager, campaign: any) {
    try {
        campaign.status = 'sending';
        campaign.deliveryReport = [];
        await campaign.save();

        let sentCount = 0;
        let failedCount = 0;

        for (const phoneNumber of campaign.contacts) {
            try {
                const contact = await ContactModel.findOne({ phoneNumber }).lean();

                if (contact?.blocked) {
                    campaign.deliveryReport.push({ phone: phoneNumber, status: 'skipped', sentAt: new Date() });
                    continue;
                }

                const contactName = contact?.name || contact?.pushName || phoneNumber;
                const personalizedMessage = (campaign.message as string)
                    .replace(/\{\{name\}\}|\{name\}/g, contactName)
                    .replace(/\{\{phone\}\}|\{phone\}/g, phoneNumber)
                    .replace(/\{\{date\}\}|\{date\}/g, new Date().toLocaleDateString());

                const formattedNumber = phoneNumber.includes('@')
                    ? phoneNumber
                    : `${phoneNumber}@c.us`;

                await botManager.client.sendMessage(formattedNumber, personalizedMessage);
                campaign.deliveryReport.push({ phone: phoneNumber, status: 'sent', sentAt: new Date() });
                sentCount++;
            } catch (error) {
                logger.error(`Failed to send message to ${phoneNumber}:`, error);
                campaign.deliveryReport.push({ phone: phoneNumber, status: 'failed', error: error.message, sentAt: new Date() });
                failedCount++;
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

    } catch (error) {
        logger.error('Failed to send campaign:', error);
        campaign.status = 'failed';
        await campaign.save();
    }
}
