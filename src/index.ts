import express from "express";
import logger from "./configs/logger.config";
import { ClientConfig } from "./configs/client.config";
import { Message } from "whatsapp-web.js";
import { readAsciiArt } from "./utils/ascii-art.util";
import EnvConfig from "./configs/env.config";
import apiRoutes from "./api/index.api";
// import { scheduleCrons } from "./crons/index.cron";
import { addMessageToQueue, checkRedisConnection, initializeQueue } from "./queue";

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

const initializeWhatsAppClient = () => {
    client.on('ready', () => {
        qrData.qrScanned = true;
        const asciiArt = readAsciiArt();
        logger.info(asciiArt || "Ready!");
        initializeQueue(client);
        // scheduleCrons();
    });

    client.on('qr', (qr: any) => {
        qrData.qrCodeData = qr;
        qrData.qrScanned = false;
    });

    client.on('message_create', async (message: Message) => {

        // ignore status updates and messages sent by the bot
        if ((message.isStatus) || (message.from === client.info.wid._serialized)) return;

        let user = await message.getContact();
        logger.info(`Captured message from @${user.pushname} (${user.number}) : ${message.body}`);

        await addMessageToQueue(message);
    });

    client.on('disconnected', (reason: any) => {
        logger.info(`Client was logged out with ${reason}`);
        setTimeout(() => {
            client.initialize();
        }, 5000);
    });

    client.initialize();
};

const startServer = () => {
    app.use("/", apiRoutes(client, qrData));
    app.listen(port, () => {
        logger.info(`Server is running on port ${port}, awaiting for client to be ready. Get started: http://localhost:${port}/`);
    });
};

const bootstrap = async () => {
    try {
        await checkRedisConnection();
        logger.info("Redis connection successful");

        initializeWhatsAppClient();
        startServer();
    } catch (error) {
        logger.error(`Failed to start the application: ${error}`);
        process.exit(1);
    }
};

bootstrap();