import { Message } from "whatsapp-web.js";
import { languages } from "../utils/translate.util";

export const run = (message: Message, _args: string[] = null) => {
    let table = "";
    let tableLength = 0;

    Object.keys(languages).forEach((key, index) => {
        table += `${key} - ${languages[key]}\n`;
        tableLength = index + 1;
    });

    message.reply(`> WhatsBot 🤖 : Available code languages (${tableLength}) - :\n ${table}`);
};
