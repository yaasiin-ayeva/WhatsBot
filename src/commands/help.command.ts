import { Message } from "whatsapp-web.js";

export const run = (message: Message, args: string[] = null, prefix: string = "/") => {

    const query = args.join(" ").trim();

    const commands = [
        { name: "help", description: "Get command Description", eg: "help ping" }, { name: "ping", description: "Ping the bot", eg: "ping" },
        { name: "langlist", description: "Get list of available languages", eg: "langlist" }, { name: "translate", description: "Translate text", eg: "translate fr Hello guys!" },
        { name: "chat", description: "Chat with Gemini AI", eg: "chat Hello gemini!" }, { name: "gpt", description: "Chat with ChatGPT", eg: "gpt Hello chatgpt!" },
        { name: "meme", description: "Get random meme", eg: "meme" }, { name: "joke", description: "Get random joke", eg: "joke" },
        { name: "get", description: "Download file from a social media", eg: "get https://www.tiktok.com/@tiktok/video/7371419698862378270" },
        { name: "meteo", description: "Get the weather for a city", eg: "meteo New York" }
    ];

    let content = "";

    if (query && query.length > 0) {
        commands.forEach((command) => {
            if (command.name === query) {
                content = `*${prefix}${command.name}* - ${command.description}.\nExample:\n> ${prefix}${command.eg}`;
            }
        });
    } else {
        content = `List of available commands : \n_(To run a command, kindly start it with the prefix ${prefix})_`;
        commands.forEach((command) => {
            content += `\n\n*${prefix}${command.name}* - ${command.description}. \nExample:\n> ${prefix}${command.eg}`;
        });
    }

    if (content) {
        message.reply(`> WhatsBot 🤖 ${content}`);
        return;
    }
};
