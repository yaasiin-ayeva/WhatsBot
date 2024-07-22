import logger from "./configs/logger.config";
import commands from "./commands/index";
import { ClientConfig } from "./configs/client.config";
import { Message } from "whatsapp-web.js";
import { readAsciiArt } from "./utils/ascii-art.util";
const { Client } = require("whatsapp-web.js");

const client = new Client(ClientConfig);
const qrcode = require("qrcode-terminal");

client.on('ready', () => {
    const asciiArt = readAsciiArt();
    logger.info(asciiArt || "Ready!");
});

client.on('qr', (qr: any) => {
    qrcode.generate(qr, { small: true });
});

const prefix = ".";

client.on('message_create', async (message: Message) => {
    const content = message.body.trim();
    if (!content.startsWith(prefix)) return;

    let user = await message.getContact();
    logger.info(`Message received from @${user.pushname} (${user.number}) : ${content}`);

    const args = content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();
    try {
        if (command && command in commands) {
            await commands[command].run(message, args, prefix);
        } else {
            message.reply(`> 🤖 Unknown command: ${command}, to see available commands, type ${prefix}help`);
        }
    } catch (error) {
        message.reply(`> 🤖 Oops, something went wrong, kindly retry.`);
        logger.error(error);
    }
});

client.initialize();