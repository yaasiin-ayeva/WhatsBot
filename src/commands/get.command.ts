import { Message, MessageMedia } from "whatsapp-web.js";
import { downloadFile, downloader, identifySocialNetwork } from "../utils/dl.util";
import logger from "../configs/logger.config";
import { isUrl } from "../utils/common.util";
const path = require("path");

const DOWNLOAD_DIR = "public/downloads";

export const run = async (message: Message, args: string[] = null, _prefix: string = "/") => {

    const url = args.join(" ");

    if (!url || !isUrl(url)) {
        message.reply(`> WhatsBot 🤖 Please provide a valid URL for the video.`);
        return;
    }

    try {

        const socialNetwork = identifySocialNetwork(url);

        if (!socialNetwork) {
            message.reply(`> WhatsBot 🤖 Unsupported social network.`);
            return
        }

        const videoUrl = await downloader(url, socialNetwork);

        const uniqid = Date.now();
        const filePath = path.join(DOWNLOAD_DIR, `${uniqid}.mp4`);

        message.reply(`> WhatsBot 🤖 Downloading your file from ${socialNetwork}...`);

        await downloadFile(videoUrl, filePath);

        const media = MessageMedia.fromFilePath(filePath);
        await message.reply(media, null, { caption: `> WhatsBot 🤖 : ${socialNetwork} video downloaded` });

    } catch (err) {
        logger.error(err);
        message.reply('> WhatsBot 🤖 Error during file download.');
    }
};