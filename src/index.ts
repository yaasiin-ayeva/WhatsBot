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