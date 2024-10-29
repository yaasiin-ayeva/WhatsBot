import { Message, MessageMedia } from "whatsapp-web.js";
import { MAX_STREAMING_FILE_SIZE, downloadFile, downloader, identifySocialNetwork } from "../utils/get.util";
import logger from "../configs/logger.config";
import { del_file, isUrl } from "../utils/common.util";
import { AppConfig } from "../configs/app.config";

const path = require("path");
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

const DOWNLOAD_DIR = "public/downloads";

export const run = async (message: Message, args: string[] = null, _videoUrl = null, socialNetwork = null) => {

    if (!_videoUrl) {
        const url = args.join(" ");
        _videoUrl = url;
        if (!url || !isUrl(url)) {
            await message.reply(
                MessageMedia.fromFilePath(AppConfig.instance.getBotAvatar("confused")),
                null,
                { sendVideoAsGif: true, caption: "> WhatsBot 🤖 Please provide a valid URL for the video." },
            );
            return;
        }
    }

    if (!socialNetwork) {

        socialNetwork = identifySocialNetwork(_videoUrl);
        if (!socialNetwork) {
            await message.reply(
                MessageMedia.fromFilePath(AppConfig.instance.getBotAvatar("confused")),
                null,
                { sendVideoAsGif: true, caption: "> WhatsBot 🤖 Unsupported social network." },
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

        message.reply(`> WhatsBot 🤖 Getting your file from ${socialNetwork} (Max file size allowed ${MAX_STREAMING_FILE_SIZE / 1024 / 1024} Mb)...`);

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
        await message.reply(media, null, {
            caption: `Download your TikTok, Instagram, twitter, Facebook, LinkedIn videos on WhatsApp without watermark. Just send the video link to this bot https://wa.me/qr/SBHRATABRAZVA1`,
        });

    } catch (err) {
        logger.error(err);
        await message.reply(
            MessageMedia.fromFilePath(AppConfig.instance.getBotAvatar("confused")),
            null,
            { sendVideoAsGif: true, caption: "> WhatsBot 🤖 Error during file download." },
        );
        return;
    } finally {
        del_file(originalFilePath);
        del_file(convertedFilePath);
    }
};