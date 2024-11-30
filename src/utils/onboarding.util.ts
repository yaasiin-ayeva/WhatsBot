import { Chat, Message, MessageMedia } from "whatsapp-web.js"
import { AppConfig } from "../configs/app.config";

const isUserOnboarded = async (chat: Chat) => {
    const messages: Message[] = await chat.fetchMessages({
        fromMe: true,
        limit: 2
    });
    return messages.length != 0;
}

export const onboard = async (message: Message, autoOnboard: boolean = true, filePath = AppConfig.instance.getOnboardingVideoPath()) => {
    const chat = await message.getChat();

    if (autoOnboard && await isUserOnboarded(chat)) {
        return;
    }

    await chat.sendStateTyping();
    const media = MessageMedia.fromFilePath(filePath);
    await message.reply(media, null, {
        caption: `🤖 Welcome to WhatsBot! \n\n Please watch this video to get started quickly \n\nPlease send "${AppConfig.instance.getBotPrefix()}${AppConfig.instance.getHelpCommand()}" to see available commands.`,
    });
}