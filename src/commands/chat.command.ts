import { Message, MessageMedia } from "whatsapp-web.js";
import { geminiCompletion } from "../utils/gemini.util";
import logger from "../configs/logger.config";
import { AppConfig } from "../configs/app.config";

export const run = async (message: Message, args: string[]) => {
    const query = args.join(" ");

    if (!query) {
        message.reply(AppConfig.instance.printMessage("Please provide a message for Gemini AI."));
        return;
    }

    try {
        const result = await geminiCompletion(query);
        const chatReply = result.response.text() || 'No reply';
        const media = MessageMedia.fromFilePath(AppConfig.instance.getBotAvatar());

        await message.reply(
            media,
            null,
            { caption: AppConfig.instance.printMessage(chatReply) },
        );

    } catch (err) {
        logger.error(err);
        message.reply(AppConfig.instance.printMessage("Error communicating with Gemini AI."));
    }
};
