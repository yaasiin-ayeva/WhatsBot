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

const app = express();
const port = EnvConfig.PORT || 3000;
let qrCodeData = "";
let qrScanned = false;

client.on('ready', () => {
    qrScanned = true;
    const asciiArt = readAsciiArt();
    logger.info(asciiArt || "Ready!");
});

client.on('qr', (qr: any) => {
    qrCodeData = qr;
    qrScanned = false;
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

        // ignore messages from myself
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

app.get("/", (req, res) => {
    logger.info("GET /");
    res.send(`
        <div align="center">
            <h3>🤖 WhatsBot Ready !</h3>
            <p>
                <img src="https://github.com/yaasiin-ayeva/WhatsBot/blob/main/public/botavatar.gif?raw=true" alt="logo" width="300" height="300" />
            </p>
            <p>Get started: <a target="_blank" href="https://github.com/yaasiin-ayeva/WhatsBot?tab=readme-ov-file#features">https://github.com/yaasiin-ayeva/WhatsBot?tab=readme-ov-file#features</a></p>
            <div id="health">
                <table border="1" cellspacing="0" cellpadding="5" align="center" width="50%">
                    <thead><tr><th>Status</th><th>Value</th></tr></thead>
                    <tbody>
                        <tr align="center"><td>App state</td><td><span id="status">Loading...</span></td></tr>
                        <tr align="center"><td>QR Scanned</td><td><span id="qrScanned">Loading...</span></td></tr>
                        <tr align="center"><td>Bot Contact</td><td><span id="botContact">Loading...</span></td></tr>
                        <tr align="center"><td>Bot Push Name</td><td><span id="botPushName">Loading...</span></td></tr>
                        <tr align="center"><td>Bot Platform</td><td><span id="botPlatform">Loading...</span></td></tr>
                        <tr align="center"><td>Uptime</td><td><span id="uptime">Loading...</span></td></tr>
                        <tr align="center"><td>Version</td><td><span id="version">Loading...</span></td></tr>
                    </tbody>
                </table>
            </div>
            <script>
                setInterval(() => {
                    fetch('/health')
                        .then(response => response.json())
                        .then(data => {
                            if (!data.qrScanned) {
                                window.location.href = '/qr';
                            }

                            document.getElementById('qrScanned').innerHTML = data.qrScanned;
                            document.getElementById('botContact').innerHTML = data.botContact;
                            document.getElementById('botPushName').innerHTML = data.botPushName;
                            document.getElementById('botPlatform').innerHTML = data.botPlatform;
                            document.getElementById('status').innerHTML = data.status;

                            if (data.status === 'healthy') {
                                document.getElementById('status').style.color = 'green';
                            } else {
                                document.getElementById('status').style.color = 'red';
                            }

                            document.getElementById('uptime').innerHTML = data.uptime;
                            document.getElementById('version').innerHTML = data.version;
                        });
                }, 1500);
            </script>
        </div>
    `);
});

app.get("/qr", (req, res) => {
    logger.info("GET /qr");

    if (qrScanned) {
        return res.redirect("/");
    }

    const qrCodeImage = qrCodeData
        ? `<img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrCodeData)}&size=300x300" alt="QR Code" />`
        : '<img src="/public/loader.svg" alt="Loader" width="100" height="100" /><p>Hold on a sec while the QR code is being generated.</p>';
    const htmlContent = `
        <div align="center">
            <div id="qrCodeData">
                <h3>🤖 WhatsBot : Scan the QR Code to Continue! </h3>
                ${qrCodeImage}
            </div>
            <script>
                const checkQrStatus = () => {
                    fetch('/qr-status')
                        .then(response => response.json())
                        .then(data => {
                            if (!data.qrScanned) {
                                location.reload();
                            } else {
                                window.location.href = '/';
                            } 
                        });
                };
                setInterval(checkQrStatus, 10000);
            </script>
        </div>
    `;

    res.send(htmlContent);
});

app.get("/qr-status", (req, res) => {
    res.json({ qrScanned, qrCodeData });
});


app.get("/health", async (_req, res) => {
    try {
        const isClientReady = client && client.info ? true : false;

        const healthStatus = {
            status: isClientReady ? "healthy" : "unhealthy",
            clientReady: isClientReady,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            qrScanned: qrScanned,
            botContact: client && client.info ? `<a target="_blank" href="https://wa.me/${client.info.wid.user}">wa.me/${client.info.wid.user}</a>` : null,
            botPushName: client && client.info ? client.info.pushname : null,
            botPlatform: client && client.info ? client.info.platform : null,
            version: process.version,
        };

        logger.info("GET /health");
        res.status(200).json(healthStatus);
    } catch (error) {
        logger.error("Health check failed", error);
        res.status(500).json({ status: "unhealthy", error: "Internal Server Error" });
    }
});

app.use("/public", express.static("public"));

app.listen(port, () => {
    logger.info(`Server is running on port ${port}, awaiting for client to be ready. Get started: http://localhost:${port}/`);
});
