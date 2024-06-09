import { LocalAuth } from "whatsapp-web.js";

export const ClientConfig = {
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
    webVersionCache: {
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        type: 'remote'
    }
}