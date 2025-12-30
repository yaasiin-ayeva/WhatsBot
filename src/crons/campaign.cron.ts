import { BotManager } from '../bot.manager';
import logger from '../configs/logger.config';
import { CampaignModel } from '../crm/models/campaign.model';

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

async function sendCampaignMessages(botManager: BotManager, campaign: any) {
  try {
    campaign.status = 'sending';
    await campaign.save();

    let sentCount = 0;
    let failedCount = 0;

    for (const phoneNumber of campaign.contacts) {
      try {
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