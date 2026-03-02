import express from "express";
import logger from "../configs/logger.config";
import { BotManager } from "../bot.manager";
import crmRouter from "../crm/api/crm.api";

const router = express.Router();

function getSiteOrigin(req: express.Request) {
    const forwardedProto = req.get("x-forwarded-proto");
    const protocol = forwardedProto ? forwardedProto.split(",")[0] : req.protocol;
    return `${protocol}://${req.get("host")}`;
}

export default function (botManager: BotManager) {

    const client = botManager.client;
    const qrData = botManager.qrData;
    
    router.get("/", (req, res) => {
        logger.info("GET /");
        const siteOrigin = getSiteOrigin(req);
        res.render("landing", {
            siteOrigin,
            pageUrl: `${siteOrigin}/`,
            imageUrl: `${siteOrigin}/public/favicon.png`,
        });
    });

    router.get("/status", (req, res) => {
        logger.info("GET /status");
        const siteOrigin = getSiteOrigin(req);
        res.render("index", {
            qrScanned: qrData.qrScanned,
            qrCodeData: qrData.qrCodeData,
            pageUrl: `${siteOrigin}/status`,
            imageUrl: `${siteOrigin}/public/favicon.png`,
        });
    });

    router.get("/qr", (req, res) => {
        logger.info("GET /qr");

        if (qrData.qrScanned) {
            return res.redirect("/status");
        }

        res.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
        res.render("qr", {
            qrCodeData: qrData.qrCodeData,
        });
    });

    router.get("/robots.txt", (req, res) => {
        const siteOrigin = getSiteOrigin(req);
        res.type("text/plain");
        res.send([
            "User-agent: *",
            "Allow: /",
            "Allow: /status",
            "Disallow: /admin",
            "Disallow: /admin/login",
            "Disallow: /qr",
            "Disallow: /crm",
            `Sitemap: ${siteOrigin}/sitemap.xml`,
        ].join("\n"));
    });

    router.get("/sitemap.xml", (req, res) => {
        const siteOrigin = getSiteOrigin(req);
        const urls = [
            `${siteOrigin}/`,
            `${siteOrigin}/status`,
        ];
        const xml = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
            ...urls.map((url) => `  <url><loc>${url}</loc></url>`),
            '</urlset>',
        ].join("\n");
        res.type("application/xml");
        res.send(xml);
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
                botContact: client && client.info ? client.info.wid.user : null,
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
