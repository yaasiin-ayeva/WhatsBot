import { Message, MessageMedia, MessageTypes } from "whatsapp-web.js";
import { geminiCompletion } from "../utils/gemini.util";
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
        chat.sendMessage(AppConfig.instance.printMessage("Please provide a message for Gemini AI."));
        return;
    }

    if (message.type === MessageTypes.VOICE) {

        const audioPath = `${AppConfig.instance.getDownloadDir()}/${message.id.id}.wav`;
        const media = await message.downloadMedia();

        const base64 = media.data;
        const fileBuffer = Buffer.from(base64, 'base64');

        const dir = path.dirname(audioPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFile(audioPath, fileBuffer, (err) => {
            if (err) {
                logger.error(`Error saving file: ${err}`);
            } else {
                logger.info(`File saved successfully to ${audioPath}`);
            }
        });

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
        const result = await geminiCompletion(query);
        const chatReply = result.response.text() || 'No reply';

        if (message.type === MessageTypes.VOICE) {
            await chat.sendStateRecording();

            try {
                const filePath = await textToSpeech(chatReply, `${message.id.id}.wav`);
                const voice = await MessageMedia.fromFilePath(filePath);
                await message.reply(voice, null, { sendAudioAsVoice: true });
                del_file(filePath);
                return;
            } catch (error) {
                logger.error(error);
                chat.clearState().then(() => {
                    // wait for 1.5 seconds before sending typing to avoid ban :)
                    setTimeout(() => {
                        chat.sendStateTyping();
                    }, 1500);
                });
                await chat.sendStateTyping();
                message.reply(AppConfig.instance.printMessage(`${chatReply}\n\n_Sorry btw but i was unable to send this as voice._`));
                return;
            }
        }

        const media = MessageMedia.fromFilePath(AppConfig.instance.getBotAvatar());
        await message.reply(
            media,
            null,
            { sendVideoAsGif: true, caption: AppConfig.instance.printMessage(chatReply) },
        );

    } catch (err) {
        logger.error(err);
        await message.reply(
            MessageMedia.fromFilePath(AppConfig.instance.getBotAvatar("confused")),
            null,
            { sendVideoAsGif: true, caption: AppConfig.instance.printMessage("Error communicating with Gemini AI.") },
        );
        return;
    }
};
