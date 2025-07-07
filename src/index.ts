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
import apiRoutes from "./api/index.api";
import { onboard } from "./utils/onboarding.util";
import { UserI18n } from "./utils/i18n.util";

const { Client } = require("whatsapp-web.js");
const path = require("path");
const client = new Client(ClientConfig);
const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use("/public", express.static("public"));

const port = EnvConfig.PORT || 3000;
let qrData = {
    qrCodeData: "",
    qrScanned: false
};

const userI18nCache = new Map<string, UserI18n>();

client.on('ready', () => {
    qrData.qrScanned = true;
    const asciiArt = readAsciiArt();
    logger.info(asciiArt || "Ready!");
    // scheduleCrons();
});

client.on('qr', (qr: any) => {
    console.log('QR RECEIVED', qr);
    qrData.qrCodeData = qr;
    qrData.qrScanned = false;
});

const prefix = AppConfig.instance.getBotPrefix();

client.on('message_create', async (message: Message) => {
    let chat = null;
    let userI18n: UserI18n;

    const content = message.body.trim();

    if (AppConfig.instance.getSupportedMessageTypes().indexOf(message.type) === -1) {
        return;
    }

    let user = await message.getContact();
    logger.info(`Message received from @${user.pushname} (${user.number}) : ${content}`);

    if (userI18nCache.has(user.number)) {
        userI18n = userI18nCache.get(user.number)!;
    } else {
        userI18n = new UserI18n(user.number);
        userI18nCache.set(user.number, userI18n);
        logger.info(`User ${user.number} detected as ${userI18n.getLanguage()} speaker from ${userI18n.getCountry()?.name || 'Unknown country'}`);
    }

    const args = content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    chat = await message.getChat();

    try {

        if (message.from === client.info.wid._serialized) return;
        if (message.isStatus) return;

        await onboard(message, userI18n);

        if (message.type === MessageTypes.VOICE) {
            await commands[AppConfig.instance.getDefaultAudioAiCommand()].run(message, args, userI18n);
            return;
        } else if (message.type === MessageTypes.TEXT) {
            const url = content.trim().split(/ +/)[0];
            const socialNetwork = identifySocialNetwork(url);

            if (url && isUrl(url) && socialNetwork) {
                await commands["get"].run(message, null, url, socialNetwork, userI18n);
                return;
            } else {
                if (!content.startsWith(prefix)) return;

                if (command && command in commands) {
                    await chat.sendStateTyping();
                    await commands[command].run(message, args, userI18n);
                } else {
                    const errorMessage = userI18n.t('unknownCommand', {
                        command: command || '',
                        prefix: prefix
                    });
                    chat.sendMessage(`> 🤖 ${errorMessage}`);
                }
            }
        }
    } catch (error) {
        if (chat) {
            const errorMessage = userI18n.t('errorOccurred');
            chat.sendMessage(`> 🤖 ${errorMessage}`);
        }
        logger.error(error);
    } finally {
        if (chat) await chat.clearState();
    }
});

try {
    client.initialize();
} catch (error) {
    logger.error(`Error when initializing client: ${error}`);
}

client.on('disconnected', (reason: any) => {
    logger.info(`Client was logged out with ${reason}`);
    setTimeout(() => {
        client.initialize();
    }, 5000);
});

app.use("/", apiRoutes(client, qrData));
app.listen(port, () => {
    logger.info(`Server is running on port ${port}, awaiting for client to be ready. Get started: http://localhost:${port}/`);
});
