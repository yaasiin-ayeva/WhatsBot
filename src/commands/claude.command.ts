import { Message, MessageMedia, MessageTypes } from "whatsapp-web.js";
import { claudeCompletion } from "../utils/claude.util";
import logger from "../configs/logger.config";
import { AppConfig } from "../configs/app.config";
import { speechToText } from "../utils/speech-to-text.util";
import { textToSpeech } from "../utils/text-to-speech.util";
import { del_file } from "../utils/common.util";
import { UserI18n } from "../utils/i18n.util";

const fs = require('fs');
const path = require('path');

export const run = async (message: Message, args: string[], userI18n: UserI18n) => {
    let query = args.join(" ");
    const chat = await message.getChat();

    if (!query && message.type !== MessageTypes.VOICE) {
        message.reply(`> WhatsBot 🤖 Please provide a message for Claude.`);
        return;
    }

    if (message.type === MessageTypes.VOICE) {
        const media = await message.downloadMedia();
        const mime = media.mimetype?.split(';')[0] || 'audio/ogg';
        const extension = mime.split('/')[1] || 'ogg';
        const audioPath = `${AppConfig.instance.getDownloadDir()}/${message.id.id}.${extension}`;

        const fileBuffer = Buffer.from(media.data, 'base64');
        const dir = path.dirname(audioPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(audioPath, fileBuffer);
        logger.info(`File saved successfully to ${audioPath}`);

        const transcript = await speechToText(audioPath);
        del_file(audioPath);
        query = transcript.text;

        if (!query || !query.length) {
            await message.reply(
                MessageMedia.fromFilePath(AppConfig.instance.getBotAvatar("confused")),
                null,
                { sendVideoAsGif: true, caption: AppConfig.instance.printMessage("Something went wrong. Please try again later.") },
            );
            return;
        }
    }

    try {
        const result = await claudeCompletion(query);
        const chatReply = result?.content?.find((item: any) => item.type === "text")?.text || "No reply";

        if (message.type === MessageTypes.VOICE) {
            if (chat) await chat.sendStateRecording();

            try {
                const filePath = await textToSpeech(chatReply, `${message.id.id}.wav`);
                const voice = await MessageMedia.fromFilePath(filePath);
                await message.reply(voice, null, { sendAudioAsVoice: true });
                del_file(filePath);
                return;
            } catch (error) {
                logger.error(error);
                if (chat) chat.clearState().then(() => {
                    setTimeout(() => {
                        chat.sendStateTyping();
                    }, 1500);
                });
                if (chat) await chat.sendStateTyping();
                message.reply(AppConfig.instance.printMessage(`${chatReply}\n\n_Sorry btw but i was unable to send this as voice._`));
                return;
            }
        }

        message.reply(AppConfig.instance.printMessage(chatReply));
    } catch (err) {
        logger.error(err);
        message.reply('> WhatsBot 🤖 Error communicating with Claude.');
    }
};
