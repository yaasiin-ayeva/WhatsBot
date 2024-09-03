import logger from "../configs/logger.config";
import cron from 'node-cron';
import path from 'path';
import fs from 'fs/promises';

// TODO : Investigate if this method actually works

export const cacheWiperCron = {
    name: 'Cache Wiper Cron',
    description: 'Helper for clearing cache folder, optimizing memory usage & cpu usage in some ways',
    interval: '* */4 * * *', // every 4 hours
    schedule: (interval: string) => {
        cron.schedule(interval, async () => {
            try {
                logger.info(`Running ${cacheWiperCron.name}...`);

                const cachePath = path.join("./.wwebjs_auth/session/Default/Cache/Cache_Data");

                try {
                    const cacheFiles = await fs.readdir(cachePath);

                    for (const file of cacheFiles) {
                        try {
                            const filePath = path.join(cachePath, file);
                            const stats = await fs.stat(filePath);

                            if (['data_0', 'data_1', 'data_2', 'data_3', 'index'].includes(file)) {
                                continue;
                            }

                            if (stats.isDirectory()) {
                                await fs.rm(filePath, { recursive: true, force: true });
                            } else {
                                await fs.unlink(filePath);
                            }
                        } catch (fileError) {
                            logger.error(`Error deleting file ${file}: ${fileError}`);
                        }
                    }
                } catch (dirError) {
                    logger.warn(`Error reading cache directory: ${cachePath} - ${dirError}`);
                }

                logger.info(`${cacheWiperCron.name} execution completed.`);
            } catch (error) {
                logger.error(`Critical error when running ${cacheWiperCron.name}: ${error}`);
            }
        });
    }
}
