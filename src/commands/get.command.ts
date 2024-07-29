import { Message, MessageMedia } from "whatsapp-web.js";
import { MAX_STREAMING_FILE_SIZE, downloadFile, downloader, identifySocialNetwork } from "../utils/get.util";
import logger from "../configs/logger.config";
import { del_file, isUrl } from "../utils/common.util";

const path = require("path");
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

const DOWNLOAD_DIR = "public/downloads";

export const run = async (message: Message, args: string[] = null) => {

    const url = args.join(" ");

    if (!url || !isUrl(url)) {
        message.reply(`> WhatsBot 🤖 Please provide a valid URL for the video.`);
        return;
    }

    let originalFilePath = null;
    let convertedFilePath = null;

    try {

        const socialNetwork = identifySocialNetwork(url);

        if (!socialNetwork) {
            message.reply(`> WhatsBot 🤖 Unsupported social network.`);
            return
        }

        const videoUrl = await downloader(url, socialNetwork);

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
        await message.reply(media, null, { caption: `> WhatsBot 🤖 : ${socialNetwork} video downloaded` });

    } catch (err) {
        logger.error(err);
        message.reply('> WhatsBot 🤖 Error during file download.');
    } finally {
        del_file(originalFilePath);
        del_file(convertedFilePath);
    }
};