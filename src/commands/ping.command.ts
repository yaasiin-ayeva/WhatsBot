import { Message } from "whatsapp-web.js";
import { UserI18n } from "../utils/i18n.util";

export const run = (message: Message, _args: string[] = null, userI18n: UserI18n) => {
    message.reply(`> WhatsBot 🤖 : Pong! Latency is ${Date.now() - message.timestamp * 1000}ms.`);
};
