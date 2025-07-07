import { Message } from "whatsapp-web.js";
import { languages, translateText } from "../utils/translate.util";
import logger from "../configs/logger.config";
import { AppConfig } from "../configs/app.config";
import { UserI18n } from "../utils/i18n.util";

export const run = async (message: Message, args: string[], userI18n: UserI18n) => {
    const lang = args.shift()?.toLowerCase();
    const query = args.join(" ");

    if (!lang || !query) {
        message.reply('> WhatsBot 🤖 : Please provide a language code and a message to translate.');
        return;
    }

    if (!Object.keys(languages).includes(lang)) {
        message.reply('> WhatsBot 🤖 : Language code not supported. Please use a valid language code.');
    }

    try {
        
        const payload: any = await translateText(query, lang);
        if (!payload) {
            message.reply('> WhatsBot : No Translation found.');
            return;
        }

        message.reply(AppConfig.instance.printMessage(`Translated text : *${payload.text}*`));
    } catch (err) {
        logger.error(err);
        message.reply('> WhatsBot : Translation error.');
    }
};
