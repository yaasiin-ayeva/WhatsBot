import express from "express";
import bodyParser from 'body-parser';
import logger from "./configs/logger.config";
import EnvConfig from "./configs/env.config";
import apiRoutes from "./api/index.api";
import { readAsciiArt } from "./utils/ascii-art.util";
import path from "path";
import { BotManager } from "./bot.manager";
import { connectDB } from "./configs/db.config";
import { initCrons } from "./crons/index.cron";

// Global error handlers to prevent crashes (Log but don't exit - let the app continue running)
process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:', error);
    logger.error('Stack:', error.stack);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Rejection at:', promise);
    logger.error('Reason:', reason);
});

const gracefulShutdown = (signal: string) => {
    logger.info(`${signal} received. Starting graceful shutdown...`);

    // Give ongoing operations 10 seconds to complete
    setTimeout(() => {
        logger.info('Forcing shutdown after timeout');
        process.exit(0);
    }, 10000);

    // Attempt graceful cleanup
    try {
        const botManager = BotManager.getInstance();
        if (botManager.client) {
            botManager.client.destroy().catch((err: Error) =>
                logger.error('Error destroying WhatsApp client:', err)
            );
        }
    } catch (err) {
        logger.error('Error during shutdown:', err);
    }

    logger.info('Graceful shutdown initiated');
    setTimeout(() => process.exit(0), 2000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const app = express();
const port = EnvConfig.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use("/public", express.static("public"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/admin', (req, res) => {
    res.render('admin');
});

app.get('/admin/login', (req, res) => {
    res.render('admin-login');
});

const botManager = BotManager.getInstance();

connectDB();
initCrons(botManager);

app.use("/", apiRoutes(botManager));

app.listen(port, () => {
    logger.info(readAsciiArt());
    logger.info(`Server running on port ${port}`);
    logger.info(`Access: http://localhost:${port}/`);
    botManager.initialize();
});