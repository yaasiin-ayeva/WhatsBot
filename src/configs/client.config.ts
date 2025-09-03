import { LocalAuth } from "whatsapp-web.js";
import EnvConfig from "./env.config";

export const ClientConfig = {
    authStrategy: new LocalAuth({
        clientId: "client-one",
        rmMaxRetries: 5
    }),
    puppeteer: {
        headless: true,
        executablePath: EnvConfig.PUPPETEER_EXECUTABLE_PATH,
        args: [
            '--aggressive-cache-discard',
            '--disable-accelerated-2d-canvas',
            '--disable-application-cache',
            '--disable-background-networking',
            '--disable-cache',
            '--disable-client-side-phishing-detection',
            '--disable-component-update',
            '--disable-default-apps',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            '--disable-gpu',
            '--disable-offer-store-unmasked-wallet-cards',
            '--disable-offline-load-stale-cache',
            '--disable-popup-blocking',
            '--disable-setuid-sandbox',
            '--disable-speech-api',
            '--disable-sync',
            '--disable-translate',
            '--disable-web-security',
            '--disk-cache-size=0',
            '--hide-scrollbars',
            '--ignore-certificate-errors',
            '--ignore-ssl-errors',
            '--metrics-recording-only',
            '--mute-audio',
            '--no-default-browser-check',
            '--no-first-run',
            '--no-pings',
            '--no-sandbox',
            '--no-zygote',
            '--password-store=basic',
            '--safebrowsing-disable-auto-update',
            // '--single-process',
            '--use-mock-keychain',
        ]
    },
}