import logger from "../configs/logger.config";
import { cacheWiperCron } from "./cache-wiper.cron";

export interface CronJob {
    name: string;
    description?: string;
    interval: string;
    schedule: (interval: string) => void;
}

export function scheduleCrons() {

    const crons: CronJob[] = [
        cacheWiperCron
    ];

    if (crons.length > 0) {
        logger.info('Scheduling crons...');
    }

    for (const cron of crons) {
        try {
            cron.schedule(cron.interval);
            logger.info(`${cron.name} scheduling completed`);
        } catch (error) {
            logger.error(`Error when scheduling ${cron.name}: ${error}`);
        }
    }

    logger.info('Crons scheduling completed.');
}