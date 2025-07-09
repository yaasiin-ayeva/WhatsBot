import express from "express";
import logger from "./configs/logger.config";
import EnvConfig from "./configs/env.config";
import apiRoutes from "./api/index.api";
import { readAsciiArt } from "./utils/ascii-art.util";
import path from "path";
import { BotManager } from "./bot.manager";

const app = express();
const port = EnvConfig.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use("/public", express.static("public"));

const botManager = BotManager.getInstance();

app.use("/", apiRoutes(botManager.client, botManager.qrData));

app.listen(port, () => {
    logger.info(readAsciiArt());
    logger.info(`Server running on port ${port}`);
    logger.info(`Access: http://localhost:${port}/`);
    botManager.initialize();
});