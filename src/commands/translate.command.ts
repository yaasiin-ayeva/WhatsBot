import { Message } from "whatsapp-web.js";
import { translateText } from "../utils/translate.util";
import logger from "../configs/logger.config";
import { AppConfig } from "../configs/app.config";

export const run = async (message: Message, args: string[]) => {
    const lang = args.shift()?.toLowerCase();
    const query = args.join(" ");

    if (!lang || !query) {
        message.reply('> WhatsBot 🤖 : Please provide a language code and a message to translate.');
        return;
    }

    try {
        const translatedText = await translateText(query, lang);
        message.reply(AppConfig.instance.printMessage(`Translated text : *${translatedText}*`));
    } catch (err) {
        logger.error(err);
        message.reply('> WhatsBot : Translation error.');
    }
};
