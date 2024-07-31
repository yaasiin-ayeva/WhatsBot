import logger from "./configs/logger.config";
import commands from "./commands/index";
import { ClientConfig } from "./configs/client.config";
import { Message } from "whatsapp-web.js";
import { readAsciiArt } from "./utils/ascii-art.util";
import { AppConfig } from "./configs/app.config";
import { textToSpeech } from "./utils/text-to-speech.util";
import { speechToText } from "./utils/speech-to-text.util";
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

const prefix = AppConfig.instance.getBotPrefix();

client.on('message_create', async (message: Message) => {
    const content = message.body.trim();
    if (!content.startsWith(prefix)) return;

    let user = await message.getContact();
    logger.info(`Message received from @${user.pushname} (${user.number}) : ${content}`);

    const args = content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    const DOWNLOAD_DIR = "public/downloads";

    // const audioPath = `${DOWNLOAD_DIR}/${message.id.id}.ogg`;
    // const ttsFilePath = await textToSpeech('Hello, World! It\'s me from the other side', audioPath);
    // await speechToText("./public/downloads/sample.wav");
    // const media = await MessageMedia.fromFilePath(audioPath);
    // await message.reply(media);

    try {
        if (command && command in commands) {
            await commands[command].run(message, args);
        } else {
            message.reply(`> 🤖 Unknown command: ${command}, to see available commands, type ${prefix}help`);
        }
    } catch (error) {
        message.reply(`> 🤖 Oops, something went wrong, kindly retry.`);
        logger.error(error);
    }
});

client.initialize();