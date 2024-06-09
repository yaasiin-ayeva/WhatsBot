import { Message } from "whatsapp-web.js";

export const run = (message: Message, _args: string[] = null, _prefix: string = "/") => {
    message.reply(`> WhatsBot 🤖 : Pong! Latency is ${Date.now() - message.timestamp * 1000}ms.`);
};
