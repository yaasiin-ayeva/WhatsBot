import { config } from "dotenv";
config();

export const EnvConfig = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    CHAT_GPT_PROJECT_ID: process.env.CHAT_GPT_PROJECT_ID,
    CHAT_GPT_ORG_ID: process.env.CHAT_GPT_ORG_ID,
    CHAT_GPT_API_KEY: process.env.CHAT_GPT_API_KEY
};

const initialize = () => {
    if (!EnvConfig.GEMINI_API_KEY) throw new Error("Please provide a valid Gemini API key.");
    if (!EnvConfig.CHAT_GPT_PROJECT_ID) throw new Error("Please provide a valid ChatGPT Project ID.");
    if (!EnvConfig.CHAT_GPT_ORG_ID) throw new Error("Please provide a valid ChatGPT Organization ID.");
    if (!EnvConfig.CHAT_GPT_API_KEY) throw new Error("Please provide a valid ChatGPT API key.");
};

initialize();