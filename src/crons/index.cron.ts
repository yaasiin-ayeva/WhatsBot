import { checkScheduledCampaigns } from "./campaign.cron";
import { cleanupOldDownloads, checkDiskSpace } from "./cleanup.cron";
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

    // Cleanup old downloads every hour (at minute 0)
    new CronJob(
        "0 * * * *",
        () => cleanupOldDownloads(24), // Delete files older than 24 hours
        null,
        true,
        "Africa/Lome"
    );

    // Check disk space every 6 hours (at minute 0)
    new CronJob(
        "0 */6 * * *",
        () => checkDiskSpace(),
        null,
        true,
        "Africa/Lome"
    );

    logger.info("Cron jobs initialized (campaigns, cleanup, disk-space)");
}