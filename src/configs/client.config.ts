import { LocalAuth } from "whatsapp-web.js";
import EnvConfig from "./env.config";

export const ClientConfig = {
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: EnvConfig.CHROME_PATH
    },
}