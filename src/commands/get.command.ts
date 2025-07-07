import { Message, MessageMedia } from "whatsapp-web.js";
import { MAX_STREAMING_FILE_SIZE, downloadFile, downloader, identifySocialNetwork } from "../utils/get.util";
import logger from "../configs/logger.config";
import { del_file, isUrl } from "../utils/common.util";
import { AppConfig } from "../configs/app.config";
import { UserI18n } from "../utils/i18n.util";

const path = require("path");
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

const DOWNLOAD_DIR = "public/downloads";

export const run = async (message: Message, args: string[] = null, _videoUrl = null, socialNetwork = null, userI18n: UserI18n) => {

    if (!_videoUrl) {
        const url = args.join(" ");
        _videoUrl = url;
        if (!url || !isUrl(url)) {
            const errorMessage = userI18n.t('getMessages.invalidUrl');
            await message.reply(
                MessageMedia.fromFilePath(AppConfig.instance.getBotAvatar("confused")),
                null,
                { sendVideoAsGif: true, caption: `> WhatsBot 🤖 ${errorMessage}` },
            );
            return;
        }
    }

    if (!socialNetwork) {
        socialNetwork = identifySocialNetwork(_videoUrl);
        if (!socialNetwork) {
            const errorMessage = userI18n.t('getMessages.unsupportedNetwork');
            await message.reply(
                MessageMedia.fromFilePath(AppConfig.instance.getBotAvatar("confused")),
                null,
                { sendVideoAsGif: true, caption: `> WhatsBot 🤖 ${errorMessage}` },
            );
            return;
        }
    }

    let originalFilePath = null;
    let convertedFilePath = null;

    try {

        const videoUrl = await downloader(_videoUrl, socialNetwork);

        const uniqid = Date.now();
        originalFilePath = path.join(DOWNLOAD_DIR, `${uniqid}.original.mp4`);
        convertedFilePath = path.join(DOWNLOAD_DIR, `${uniqid}.mp4`);

        ffmpeg.setFfmpegPath(ffmpegPath);

        const downloadingMessage = userI18n.t('getMessages.downloading', {
            network: socialNetwork,
            size: (MAX_STREAMING_FILE_SIZE / 1024 / 1024).toString()
        });
        message.reply(`> WhatsBot 🤖 ${downloadingMessage}`);

        await downloadFile(videoUrl, originalFilePath);

        await new Promise((resolve, reject) => {
            ffmpeg(originalFilePath)
                .videoCodec('libx264')
                .outputOptions('-preset', 'slow')
                .outputOptions('-crf', '22')
                .on('end', resolve)
                .on('error', reject)
                .save(convertedFilePath);
        });

        const media = MessageMedia.fromFilePath(convertedFilePath);
        const caption = userI18n.t('getMessages.caption');
        await message.reply(media, null, {
            caption: caption,
        });

    } catch (err) {
        logger.error(err);
        const errorMessage = userI18n.t('getMessages.downloadError');
        await message.reply(
            MessageMedia.fromFilePath(AppConfig.instance.getBotAvatar("confused")),
            null,
            { sendVideoAsGif: true, caption: `> WhatsBot 🤖 ${errorMessage}` },
        );
        return;
    } finally {
        del_file(originalFilePath);
        del_file(convertedFilePath);
    }
};