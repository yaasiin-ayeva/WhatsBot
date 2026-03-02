import { config } from "dotenv";
import logger from "./logger.config";

const fs = require('fs');

config();

class EnvConfig {

    static GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    static CHAT_GPT_PROJECT_ID = process.env.CHAT_GPT_PROJECT_ID;
    static CHAT_GPT_ORG_ID = process.env.CHAT_GPT_ORG_ID;
    static CHAT_GPT_API_KEY = process.env.CHAT_GPT_API_KEY;
    static ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    static PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;
    static OPENWEATHERMAP_API_KEY = process.env.OPENWEATHERMAP_API_KEY;
    static ENV = process.env.ENV;
    static PORT = process.env.PORT;
    static MONGODB_URI = process.env.MONGODB_URI;
    static JWT_SECRET = process.env.JWT_SECRET;

    static validate() {

        if (!fs.existsSync(".env")) {
            throw new Error(".env file is missing. Please create a .env file at the root directory out of the .env.example file.");
        }

        if (!this.PUPPETEER_EXECUTABLE_PATH) {
            throw new Error("Environment variable PUPPETEER_EXECUTABLE_PATH is missing. Please provide a valid Chrome path.");
        }
        if (!this.ENV) {
            throw new Error("Environment variable ENV is missing. Please provide a valid ENV.");
        }
        if (!this.PORT) {
            throw new Error("Environment variable PORT is missing. Please provide a valid PORT.");
        }
        if (!this.MONGODB_URI) {
            throw new Error("Environment variable MONGODB_URI is missing. Please provide a valid MONGODB_URI.");
        }
        if (!this.JWT_SECRET) {
            throw new Error("Environment variable JWT_SECRET is missing. Please provide a valid JWT_SECRET.");
        }
    }
}

try {
    EnvConfig.validate();
} catch (error) {
    logger.error(error);
    process.exit(1);
}

export default EnvConfig;
