import { GoogleGenerativeAI } from "@google/generative-ai";
import EnvConfig from "../configs/env.config";

export type GeminiModel = "gemini-1.5-flash-latest";

export const geminiCompletion = async (query: string, modelName: GeminiModel = "gemini-1.5-flash-latest") => {
    const apiKey = process.env.GEMINI_API_KEY || EnvConfig.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent([query]);
    return result;
};
