import fs from 'fs';
import path from 'path';
import logger from "../configs/logger.config";
import { DOWNLOAD_DIR } from "../utils/get.util";

/**
 * Clean up old files from the downloads directory
 * Removes files older than the specified age in hours
 */
export async function cleanupOldDownloads(maxAgeHours: number = 24): Promise<void> {
    try {
        if (!fs.existsSync(DOWNLOAD_DIR)) {
            logger.debug('Downloads directory does not exist, skipping cleanup');
            return;
        }

        const now = Date.now();
        const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
        const files = fs.readdirSync(DOWNLOAD_DIR);

        let deletedCount = 0;
        let totalSize = 0;

        for (const file of files) {
            const filePath = path.join(DOWNLOAD_DIR, file);

            try {
                const stats = fs.statSync(filePath);

                // Skip directories
                if (stats.isDirectory()) {
                    continue;
                }

                const fileAge = now - stats.mtimeMs;

                if (fileAge > maxAgeMs) {
                    const fileSize = stats.size;
                    fs.unlinkSync(filePath);
                    deletedCount++;
                    totalSize += fileSize;
                    logger.debug(`Cleaned up old file: ${file} (${(fileSize / 1024 / 1024).toFixed(2)} MB, ${(fileAge / 1000 / 60 / 60).toFixed(1)} hours old)`);
                }
            } catch (err) {
                logger.error(`Error processing file ${file} during cleanup:`, err);
            }
        }

        if (deletedCount > 0) {
            logger.info(`Cleanup completed: Deleted ${deletedCount} files, freed ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
        } else {
            logger.debug('Cleanup completed: No old files to delete');
        }
    } catch (error) {
        logger.error('Error during cleanup:', error);
    }
}

/**
 * Emergency cleanup when disk space is low
 * Removes all files from downloads directory
 */
export async function emergencyCleanup(): Promise<void> {
    try {
        if (!fs.existsSync(DOWNLOAD_DIR)) {
            return;
        }

        const files = fs.readdirSync(DOWNLOAD_DIR);
        let deletedCount = 0;

        for (const file of files) {
            const filePath = path.join(DOWNLOAD_DIR, file);

            try {
                const stats = fs.statSync(filePath);
                if (!stats.isDirectory()) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            } catch (err) {
                logger.error(`Error deleting file ${file}:`, err);
            }
        }

        logger.warn(`Emergency cleanup: Deleted ${deletedCount} files from downloads directory`);
    } catch (error) {
        logger.error('Error during emergency cleanup:', error);
    }
}

/**
 * Check disk space and trigger emergency cleanup if needed
 */
export async function checkDiskSpace(): Promise<void> {
    try {
        if (!fs.existsSync(DOWNLOAD_DIR)) {
            return;
        }

        const files = fs.readdirSync(DOWNLOAD_DIR);
        let totalSize = 0;
        let fileCount = 0;

        for (const file of files) {
            const filePath = path.join(DOWNLOAD_DIR, file);
            try {
                const stats = fs.statSync(filePath);
                if (!stats.isDirectory()) {
                    totalSize += stats.size;
                    fileCount++;
                }
            } catch (err) {
                // Ignore errors for individual files
            }
        }

        const totalSizeMB = totalSize / 1024 / 1024;

        // If downloads directory is over 1GB, trigger emergency cleanup
        if (totalSizeMB > 1024) {
            logger.warn(`Downloads directory is ${totalSizeMB.toFixed(2)} MB (${fileCount} files). Triggering emergency cleanup...`);
            await emergencyCleanup();
        } else if (totalSizeMB > 512) {
            logger.warn(`Downloads directory is ${totalSizeMB.toFixed(2)} MB (${fileCount} files). Consider cleanup.`);
        } else {
            logger.debug(`Downloads directory: ${totalSizeMB.toFixed(2)} MB (${fileCount} files)`);
        }
    } catch (error) {
        logger.error('Error checking disk space:', error);
    }
}
