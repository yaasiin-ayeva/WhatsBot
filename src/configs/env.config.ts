import { config } from "dotenv";
import logger from "./logger.config";

config();

class EnvConfig {

    static GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    static CHAT_GPT_PROJECT_ID = process.env.CHAT_GPT_PROJECT_ID;
    static CHAT_GPT_ORG_ID = process.env.CHAT_GPT_ORG_ID;
    static CHAT_GPT_API_KEY = process.env.CHAT_GPT_API_KEY;
    static CHROME_PATH = process.env.CHROME_PATH;
    static OPENWEATHERMAP_API_KEY = process.env.OPENWEATHERMAP_API_KEY;

    static validate() {
        if (!this.GEMINI_API_KEY) {
            throw new Error("Environment variable GEMINI_API_KEY is missing. Please provide a valid Gemini API key.");
        }
        if (!this.CHAT_GPT_PROJECT_ID) {
            throw new Error("Environment variable CHAT_GPT_PROJECT_ID is missing. Please provide a valid ChatGPT Project ID.");
        }
        if (!this.CHAT_GPT_ORG_ID) {
            throw new Error("Environment variable CHAT_GPT_ORG_ID is missing. Please provide a valid ChatGPT Organization ID.");
        }
        if (!this.CHAT_GPT_API_KEY) {
            throw new Error("Environment variable CHAT_GPT_API_KEY is missing. Please provide a valid ChatGPT API key.");
        }
        if (!this.CHROME_PATH) {
            throw new Error("Environment variable CHROME_PATH is missing. Please provide a valid Chrome path.");
        }
        if (!this.OPENWEATHERMAP_API_KEY) {
            throw new Error("Environment variable OPENWEATHERMAP_API_KEY is missing. Please provide a valid OpenWeatherMap API key.");
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