import OpenAI from "openai";
import EnvConfig from "../configs/env.config";

export type GptModel = "text-davinci-003" | "gpt-3.5-turbo" | "gpt-3.5-turbo-0125" | "gpt-4" | "gpt-4-0314" | "gpt-4-32k" | "gpt-4-32k-0314";

const openai = new OpenAI({
    apiKey: EnvConfig.CHAT_GPT_API_KEY,
    organization: EnvConfig.CHAT_GPT_ORG_ID,
    project: EnvConfig.CHAT_GPT_PROJECT_ID,
});

export const chatGptCompletion = async (query: string, model: GptModel = "gpt-3.5-turbo") => {
    const response = await openai.chat.completions.create({
        model: model,
        messages: [{ role: "user", content: query }],
    });
    return response;
}