import { Message } from "whatsapp-web.js";
import { languages } from "../utils/translate.util";

export const run = (message: Message, _args: string[] = null) => {
    message.reply(`> WhatsBot 🤖 : Available code languages (${languages.length}) - :\n ${languages.join(", ")}`);
};
