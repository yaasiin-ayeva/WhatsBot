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
    let shouldCleanup = true;

    try {
        const downloadingMessage = userI18n.t('getMessages.downloading', {
            network: socialNetwork,
            size: (MAX_STREAMING_FILE_SIZE / 1024 / 1024).toString()
        });

        await message.reply(`> WhatsBot 🤖 ${downloadingMessage}`);

        const downloadResult = await downloader(_videoUrl, socialNetwork);

        if (fs.existsSync(downloadResult)) {
            mediaPath = downloadResult;
        }
        else {
            const uniqid = Date.now();
            mediaPath = path.join(DOWNLOAD_DIR, `${uniqid}_temp.mp4`);
            await downloadFile(downloadResult, mediaPath);
        }

        const uniqid = Date.now();
        convertedFilePath = path.join(DOWNLOAD_DIR, `${uniqid}.mp4`);
        ffmpeg.setFfmpegPath(ffmpegPath);

        await new Promise((resolve, reject) => {
            ffmpeg(mediaPath)
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
                    reject(err);
                })
                .save(convertedFilePath);
        });

        const media = await MessageMedia.fromFilePath(convertedFilePath);
        await message.reply(media, null, {
            caption: userI18n.t('getMessages.caption')
        });

        shouldCleanup = false;

    } catch (err) {
        logger.error('Download failed:', err);
        await sendErrorMessage(message, userI18n.t('getMessages.downloadError'), userI18n);
    } finally {
        if (shouldCleanup) {
            const cleanFile = async (filePath: string | null) => {
                if (filePath && fs.existsSync(filePath)) {
                    try {
                        await del_file(filePath);
                    } catch (cleanErr) {
                        logger.warn(`Failed to clean file ${filePath}:`, cleanErr);
                    }
                }
            };

            await Promise.all([
                cleanFile(mediaPath),
                cleanFile(convertedFilePath)
            ]);
        }
    }
};

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