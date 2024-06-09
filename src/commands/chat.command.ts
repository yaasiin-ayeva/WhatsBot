import { Message, MessageMedia } from "whatsapp-web.js";
import { geminiCompletion } from "../utils/gemini.util";
import logger from "../configs/logger.config";

export const run = async (message: Message, args: string[], _prefix: string = "/") => {
    const query = args.join(" ");

    if (!query) {
        message.reply(`> WhatsBot 🤖 : Please provide a message for Gemini AI.`);
        return;
    }

    try {
        const result = await geminiCompletion(query);
        const chatReply = result.response.text() || 'No reply';
        const media = MessageMedia.fromFilePath('public/favicon.png');

        await message.reply(
            media,
            null,
            { caption: `> WhatsBot 🤖 : Gemini AI's response \n\n${chatReply}` },
        );

    } catch (err) {
        logger.error(err);
        message.reply('> WhatsBot 🤖 : Error communicating with Gemini AI.');
    }
};
