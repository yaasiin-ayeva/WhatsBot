import express from "express";
import logger from "../configs/logger.config";
import { BotManager } from "../bot.manager";
import crmRouter from "../crm/api/crm.api";

const router = express.Router();

export default function (botManager: BotManager) {

    const client = botManager.client;
    const qrData = botManager.qrData;
    
    router.get("/", (_req, res) => {
        logger.info("GET /");
        res.render("index", {
            qrScanned: qrData.qrScanned,
            qrCodeData: qrData.qrCodeData,
        });
    });

    router.get("/qr", (_req, res) => {
        logger.info("GET /qr");

        if (qrData.qrScanned) {
            return res.redirect("/");
        }

        res.render("qr", {
            qrCodeData: qrData.qrCodeData,
        });
    });

    router.get("/qr-status", (_req, res) => {
        res.json({ qrScanned: qrData.qrScanned, qrCodeData: qrData.qrCodeData });
    });

    router.get("/health", async (_req, res) => {
        try {
            const isClientReady = client && client.info ? true : false;

            const healthStatus = {
                status: isClientReady ? "healthy" : "unhealthy",
                clientReady: isClientReady,
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                qrScanned: qrData.qrScanned,
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

    router.use("/crm", crmRouter(botManager));

    return router;
}
