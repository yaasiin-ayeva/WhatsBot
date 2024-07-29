import axios from "axios";
import { Message, MessageMedia } from "whatsapp-web.js";
import { AppConfig } from "../configs/app.config";

export const run = async (message: Message, args: string[] = null) => {

    const meme = await axios(AppConfig.instance.getMemeApiUrl()).then((res) => res.data);
    if (!meme || !meme.url) {
        message.reply("> WhatsBot 🤖 : No meme found");
    }

    message.reply(
        await MessageMedia.fromUrl(meme.url),
        null,
        { caption: AppConfig.instance.printMessage("Here's your meme buddy!") },
    );
};
