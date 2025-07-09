import { checkScheduledCampaigns } from "./campaign.cron";
import { BotManager } from "../bot.manager";
import { CronJob } from "cron";
import logger from "../configs/logger.config";

export function initCrons(botManager: BotManager) {
    // Check scheduled campaigns every minute
    new CronJob(
        "* * * * *",
        () => checkScheduledCampaigns(botManager),
        null,
        true,
        "Africa/Lome"
    );
    logger.info("Cron jobs initialized");
}