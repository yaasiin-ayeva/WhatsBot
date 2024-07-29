import { Message } from "whatsapp-web.js";
import { chatGptCompletion } from "../utils/chat-gpt.util";
import logger from "../configs/logger.config";
import { AppConfig } from "../configs/app.config";

export const run = async (message: Message, args: string[]) => {
    const query = args.join(" ");

    if (!query) {
        message.reply(`> WhatsBot 🤖 Please provide a message for GPT.`);
        return;
    }

    try {
        const result = await chatGptCompletion(query);
        const chatReply = result.choices[0].message.content || 'No reply';
        message.reply(AppConfig.instance.printMessage(chatReply));
    } catch (err) {
        logger.error(err);
        message.reply('> WhatsBot 🤖 Error communicating with GPT.');
    }
};
