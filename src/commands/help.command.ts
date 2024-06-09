import { Message } from "whatsapp-web.js";

export const run = (message: Message, _args: string[] = null, prefix: string = "/") => {
    const commands = ["help", "ping", "langlist", "translate", "chat", "gpt", "meme", "joke"];
    message.reply(`> WhatsBot 🤖 Available commands\n\n ${commands.join(", ")} \n\nTo run a command, kindly start it with ${prefix}. \n\ne.g.: ${prefix}help`);
};
