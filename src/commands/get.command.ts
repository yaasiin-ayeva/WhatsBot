import { Message, MessageMedia } from "whatsapp-web.js";
import { downloader, identifySocialNetwork, MAX_STREAMING_FILE_SIZE } from "../utils/get.util";
import logger from "../configs/logger.config";
import { del_file, isUrl } from "../utils/common.util";
import { AppConfig } from "../configs/app.config";
import { UserI18n } from "../utils/i18n.util";
const path = require("path");
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

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

    try {
        const downloadingMessage = userI18n.t('getMessages.downloading', {
            network: socialNetwork,
            size: (MAX_STREAMING_FILE_SIZE / 1024 / 1024).toString()
        });
        await message.reply(`> WhatsBot 🤖 ${downloadingMessage}`);

        mediaPath = await downloader(_videoUrl, socialNetwork);

        const convertedPath = await convertMedia(mediaPath);

        const media = MessageMedia.fromFilePath(convertedPath || mediaPath);
        await message.reply(media, null, {
            caption: userI18n.t('getMessages.caption')
        });

    } catch (err) {
        logger.error('Download failed:', err);
        await sendErrorMessage(message, userI18n.t('getMessages.downloadError'), userI18n);
    } finally {
        if (mediaPath) del_file(mediaPath);
    }
};

async function convertMedia(inputPath: string): Promise<string | null> {
    if (inputPath.endsWith('.mp4')) return null;

    const outputPath = inputPath.replace(path.extname(inputPath), '.mp4');

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .setFfmpegPath(ffmpegPath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .output(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', (err) => {
                logger.error('Conversion failed:', err);
                resolve(null);
            })
            .run();
    });
}

async function sendErrorMessage(message: Message, text: string, userI18n: UserI18n) {
    await message.reply(
        MessageMedia.fromFilePath(AppConfig.instance.getBotAvatar("confused")),
        null,
        {
            sendVideoAsGif: true,
            caption: `> WhatsBot 🤖 ${text}`
        }
    );
}