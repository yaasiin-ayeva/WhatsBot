import express from "express";
import logger from "./configs/logger.config";
import commands from "./commands/index";
import { ClientConfig } from "./configs/client.config";
import { Message } from "whatsapp-web.js";
import { MessageTypes } from "whatsapp-web.js";
import { readAsciiArt } from "./utils/ascii-art.util";
import { AppConfig } from "./configs/app.config";
import { isUrl } from "./utils/common.util";
import { identifySocialNetwork } from "./utils/get.util";
import EnvConfig from "./configs/env.config";

const { Client } = require("whatsapp-web.js");
const client = new Client(ClientConfig);
const qrcode = require("qrcode-terminal");

const app = express();
const port = EnvConfig.PORT || 3000;

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

    if (AppConfig.instance.getSupportedMessageTypes().indexOf(message.type) === -1) {
        return;
    }

    let user = await message.getContact();
    logger.info(`Message received from @${user.pushname} (${user.number}) : ${content}`);

    const args = content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    try {

        // ignoremessages from myself
        if (message.from === client.info.wid._serialized) return;
        // ignore status messages
        if (message.isStatus) return

        if (message.type === MessageTypes.VOICE) {
            await commands[AppConfig.instance.getDefaultAudioAiCommand()].run(message, args);
            return;
        } else if (message.type === MessageTypes.TEXT) {

            const url = content.trim().split(/ +/)[0];
            const socialNetwork = identifySocialNetwork(url);

            if (url && isUrl(url) && socialNetwork) {

                await commands["get"].run(message, null, url, socialNetwork);
                return;

            } else {

                if (!content.startsWith(prefix)) return;

                if (command && command in commands) {
                    await commands[command].run(message, args);
                } else {
                    message.reply(`> 🤖 Unknown command: ${command}, to see available commands, type ${prefix}help`);
                }
            }
        }
    } catch (error) {
        message.reply(`> 🤖 Oops, something went wrong, kindly retry.`);
        logger.error(error);
    }
});

client.initialize();

client.on('disconnected', (reason) => {
    logger.info('Client was logged out', reason);
    setTimeout(() => {
        client.initialize();
    }, 5000);
});

app.listen(port, () => {
    logger.info(`Server is running on port ${port}, awaiting for client to be ready...`);
});

app.get("/", (req, res) => {
    logger.info("GET /");
    res.send(`
        <h1>🤖 WhatsBot</h1>
        <p>
            <img src="https://github.com/yaasiin-ayeva/WhatsBot/blob/main/public/botavatar.gif?raw=true" alt="logo" width="300" height="300" />
        </p>
        <p>Get started: <a href="https://github.com/yaasiin-ayeva/WhatsBot/blob/main/README.md">https://github.com/yaasiin-ayeva/WhatsBot/blob/main/README.md</a></p>
    `);
});

app.get("/health", async (_req, res) => {
    try {
        const isClientReady = client && client.info ? true : false;

        const healthStatus = {
            status: isClientReady ? "healthy" : "unhealthy",
            clientReady: isClientReady,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            version: process.version,
        };

        logger.info("GET /health");
        res.status(200).json(healthStatus);
    } catch (error) {
        logger.error("Health check failed", error);
        res.status(500).json({ status: "unhealthy", error: "Internal Server Error" });
    }
});