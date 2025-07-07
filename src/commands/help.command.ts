import { Message } from "whatsapp-web.js";
import { AppConfig } from "../configs/app.config";
import { UserI18n } from "../utils/i18n.util";

export const run = (message: Message, args: string[] = null, userI18n: UserI18n) => {

    const prefix = AppConfig.instance.getBotPrefix();
    const query = args.join(" ").trim();

    const commandKeys = [
        'onboard', 'help', 'ping', 'langlist', 'translate',
        'chat', 'meme', 'joke', 'get', 'meteo'
    ];

    let content = "";

    if (query && query.length > 0) {
        const foundCommand = commandKeys.find(cmd => cmd === query);
        if (foundCommand) {
            const commandInfo = userI18n.t(`commands.${foundCommand}.description`);
            const commandExample = userI18n.t(`commands.${foundCommand}.example`);
            content = `*${prefix}${foundCommand}* - ${commandInfo}.\n${userI18n.isFrench() ? 'Exemple' : 'Example'}:\n> ${prefix}${commandExample}`;
        }
    } else {
        const headerText = userI18n.t('helpHeader');
        const footerText = userI18n.t('helpFooter', { prefix });

        content = `${headerText} \n _${footerText}_`;

        commandKeys.forEach((commandKey) => {
            const commandInfo = userI18n.t(`commands.${commandKey}.description`);
            const commandExample = userI18n.t(`commands.${commandKey}.example`);
            const exampleLabel = userI18n.isFrench() ? 'Exemple' : 'Example';
            content += `\n\n*${prefix}${commandKey}* - ${commandInfo}. \n${exampleLabel}:\n> ${prefix}${commandExample}`;
        });
    }

    if (content) {
        message.reply(`> WhatsBot 🤖 ${content}`);
        return;
    }
};