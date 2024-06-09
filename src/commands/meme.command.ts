import axios from "axios";
import { Message, MessageMedia } from "whatsapp-web.js";

export const run = async (message: Message, args: string[] = null, prefix: string = "/") => {

    const meme = await axios("https://meme-api.com/gimme").then((res) => res.data);
    if (!meme || !meme.url) {
        message.reply("> WhatsBot 🤖 : No meme found");
    }

    message.reply(
        await MessageMedia.fromUrl(meme.url),
        null,
        { caption: "> WhatsBot 🤖 : Here's your meme buddy!" },
    );
};
