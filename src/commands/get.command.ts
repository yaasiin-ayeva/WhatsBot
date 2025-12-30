import { Message, MessageMedia } from "whatsapp-web.js";
import { DOWNLOAD_DIR, downloader, downloadFile, identifySocialNetwork, MAX_STREAMING_FILE_SIZE } from "../utils/get.util";

import logger from "../configs/logger.config";
import { del_file, isUrl } from "../utils/common.util";
import { AppConfig } from "../configs/app.config";
import { UserI18n } from "../utils/i18n.util";

const path = require("path");
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs');

export const run = async (message: Message, args: string[] = null, _videoUrl = null, socialNetwork = null, userI18n: UserI18n) => {
    if (!_videoUrl) {
        const url = args?.join(" ") || '';
        _videoUrl = url;
        if (!url || !isUrl(url)) {
            await sendErrorMessage(message, userI18n.t('getMessages.invalidUrl'), userI18n);
            return;
        }
    }

    if (!socialNetwork) {
        socialNetwork = identifySocialNetwork(_videoUrl);
        if (!socialNetwork) {
            await sendErrorMessage(message, userI18n.t('getMessages.unsupportedNetwork'), userI18n);
            return;
        }
    }

    let mediaPath: string | null = null;
    let convertedFilePath: string | null = null;

    try {
        const downloadingMessage = userI18n.t('getMessages.downloading', {
            network: socialNetwork,
            size: (MAX_STREAMING_FILE_SIZE / 1024 / 1024).toString()
        });

        await message.reply(`> WhatsBot 🤖 ${downloadingMessage}`);

        const downloadResult = await downloader(_videoUrl, socialNetwork);

        // Validate download result
        if (!downloadResult) {
            throw new Error('Download failed: No result returned');
        }

        if (fs.existsSync(downloadResult)) {
            mediaPath = downloadResult;
        } else {
            const uniqid = Date.now();
            mediaPath = path.join(DOWNLOAD_DIR, `${uniqid}_temp.mp4`);
            await downloadFile(downloadResult, mediaPath);
        }

        // Verify downloaded file exists and has content
        if (!mediaPath || !fs.existsSync(mediaPath)) {
            throw new Error('Download failed: File not found after download');
        }

        const fileStats = fs.statSync(mediaPath);
        if (fileStats.size === 0) {
            throw new Error('Download failed: Downloaded file is empty');
        }

        const uniqid = Date.now();
        convertedFilePath = path.join(DOWNLOAD_DIR, `${uniqid}.mp4`);
        ffmpeg.setFfmpegPath(ffmpegPath);

        await new Promise((resolve, reject) => {
            const ffmpegProcess = ffmpeg(mediaPath)
                .videoCodec('libx264')
                .outputOptions('-preset', 'slow')
                .outputOptions('-crf', '22')
                .on('end', () => {
                    if (!fs.existsSync(convertedFilePath!)) {
                        reject(new Error('Converted file not created'));
                        return;
                    }
                    resolve(true);
                })
                .on('error', (err) => {
                    logger.error('FFmpeg error:', err);
                    reject(new Error(`FFmpeg conversion failed: ${err.message}`));
                })
                .save(convertedFilePath);

            // Add timeout for FFmpeg conversion (3 minutes max)
            const timeout = setTimeout(() => {
                ffmpegProcess.kill('SIGKILL');
                reject(new Error('FFmpeg conversion timeout after 3 minutes'));
            }, 3 * 60 * 1000);

            ffmpegProcess.on('end', () => clearTimeout(timeout));
            ffmpegProcess.on('error', () => clearTimeout(timeout));
        });

        const media = await MessageMedia.fromFilePath(convertedFilePath);
        await message.reply(media, null, {
            caption: userI18n.random('getMessages.captions', { prefix: '/' })
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (err) {
        logger.error('Download failed:', err);
        await sendErrorMessage(message, userI18n.t('getMessages.downloadError'), userI18n);
    } finally {
        await cleanupFiles(mediaPath, convertedFilePath);
    }
};

async function cleanupFiles(mediaPath: string | null, convertedFilePath: string | null) {
    const cleanFile = async (filePath: string | null, retries = 3) => {
        if (!filePath || !fs.existsSync(filePath)) {
            return;
        }

        for (let i = 0; i < retries; i++) {
            try {
                await del_file(filePath);
                logger.debug(`Successfully deleted: ${filePath}`);
                return;
            } catch (cleanErr) {
                if (i === retries - 1) {
                    logger.warn(`Failed to clean file ${filePath} after ${retries} attempts:`, cleanErr);
                } else {
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
                }
            }
        }
    };

    await Promise.all([
        cleanFile(mediaPath),
        cleanFile(convertedFilePath)
    ]);
}

async function sendErrorMessage(message: Message, text: string, _userI18n: UserI18n) {
    await message.reply(
        MessageMedia.fromFilePath(AppConfig.instance.getBotAvatar("confused")),
        null,
        {
            sendVideoAsGif: true,
            caption: `> WhatsBot 🤖 ${text}`
        }
    );
}