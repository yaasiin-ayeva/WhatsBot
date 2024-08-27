import { LocalAuth } from "whatsapp-web.js";
import EnvConfig from "./env.config";

export const ClientConfig = {
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: EnvConfig.CHROME_PATH,
        args: [
            '--no-sandbox',
            '--disable-client-side-phishing-detection',
            '--disable-setuid-sandbox',
            '--disable-component-update',
            '--disable-default-apps',
            '--disable-popup-blocking',
            '--disable-offer-store-unmasked-wallet-cards',
            '--disable-speech-api',
            '--hide-scrollbars',
            '--mute-audio',
            '--disable-extensions',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-default-browser-check',
            '--no-pings',
            '--password-store=basic',
            '--use-mock-keychain',
            '--no-zygote',
            // '--single-process',
            '--disable-gpu',
        ]
    },
}