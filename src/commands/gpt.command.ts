import { Message } from "whatsapp-web.js";
import { chatGptCompletion } from "../utils/chat-gpt.util";
import logger from "../configs/logger.config";

export const run = async (message: Message, args: string[], _prefix: string = "/") => {
    const query = args.join(" ");

    if (!query) {
        message.reply(`> WhatsBot 🤖 Please provide a message for GPT.`);
        return;
    }

    try {
        const result = await chatGptCompletion(query);
        const chatReply = result.choices[0].message.content || 'No reply';
        message.reply(`> WhatsBot 🤖 GPT's response \n\n${chatReply}`);
    } catch (err) {
        logger.error(err);
        message.reply('> WhatsBot 🤖 Error communicating with GPT.');
    }
};
