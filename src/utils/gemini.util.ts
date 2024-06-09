import { GoogleGenerativeAI } from "@google/generative-ai";
import { EnvConfig } from "../configs/env.config";

export type GeminiModel = "gemini-1.5-flash-latest";
const genAI = new GoogleGenerativeAI(EnvConfig.GEMINI_API_KEY);

export const geminiCompletion = async (query: string, modelName: GeminiModel = "gemini-1.5-flash-latest") => {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent([query]);
    return result;
};