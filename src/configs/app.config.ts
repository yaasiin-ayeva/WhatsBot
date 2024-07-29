import EnvConfig from "./env.config";

const fs = require('fs');

export class AppConfig {

    private static _instance: AppConfig;

    private constructor() { }

    public static get instance(): AppConfig {
        if (!this._instance) {
            this._instance = new AppConfig();
        }
        return this._instance;
    }

    public getBotPrefix(): string {
        return EnvConfig.ENV === "production" ? "/" : "!";
    }

    public getBotName(): string {
        return "WhatsBot";
    }

    public getBotEmoji(): string {
        return "🤖";
    }

    public getBotAvatar(): string {
        return "public/favicon.png";
    }

    public getBotMessageSignature(italic: boolean = true, margin: number = 3): string {
        margin = Math.max(0, margin);
        const marginString = "\n".repeat(margin);
        const signatureContent = `${this.getBotName()} ${this.getBotEmoji()}`;
        return `${marginString}${italic ? `_${signatureContent}_` : signatureContent}`;
    }

    public printMessage(message: string): string {
        return `${message} ${this.getBotMessageSignature()}`;
    }

    public getBotDownloadPath(): string {
        const dir = "public/downloads";
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        return dir;
    }

    public getJokeApiUrl(safeMode: boolean = true): string {
        return `https://v2.jokeapi.dev/joke/Any${safeMode ? "?safe-mode" : ""}`;
    }

    public getMemeApiUrl(): string {
        return "https://meme-api.com/gimme";
    }

    public getWeatherApiUrl(api_key: string, city: string, lang: string = "en"): string {
        return `http://api.weatherapi.com/v1/current.json?key=${api_key}&q=${city}&lang=${lang}`;
    }

    public getSpeechifyBaseUrl(): string {
        return "https://api.sws.speechify.com/v1/audio/speech";
    }
}