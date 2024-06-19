import { LocalAuth } from "whatsapp-web.js";
import EnvConfig from "./env.config";

export const ClientConfig = {
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: EnvConfig.CHROME_PATH
    },
    webVersionCache: {
        remotePath: "https://raw.githubusercontent.com/guigo613/alternative-wa-version/main/html/2.2412.54v2.html",
        // remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        type: 'remote'
    }
}