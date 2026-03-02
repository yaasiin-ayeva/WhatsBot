import axios from "axios";
import EnvConfig from "../configs/env.config";

export type ClaudeModel = "claude-sonnet-4-20250514" | "claude-opus-4-1-20250805";

export async function claudeCompletion(
    query: string,
    systemPrompt?: string,
    model: ClaudeModel = "claude-sonnet-4-20250514"
) {
    const apiKey = process.env.ANTHROPIC_API_KEY || EnvConfig.ANTHROPIC_API_KEY;

    if (!apiKey) {
        throw new Error("Environment variable ANTHROPIC_API_KEY is missing.");
    }

    const response = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
            model,
            max_tokens: 512,
            ...(systemPrompt ? { system: systemPrompt } : {}),
            messages: [{ role: "user", content: query }]
        },
        {
            headers: {
                "content-type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01"
            },
            timeout: 30000
        }
    );

    return response.data;
}
