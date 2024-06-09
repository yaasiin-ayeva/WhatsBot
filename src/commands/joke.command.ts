import axios from "axios";
import { Message, MessageMedia } from "whatsapp-web.js";

export const run = async (message: Message, _args: string[] = null, _prefix: string = "/") => {

    const jokeData = await axios("https://v2.jokeapi.dev/joke/Any?safe-mode").then((res) => res.data);

    if (!jokeData) {
        message.reply("> WhatsBot 🤖 : No joke found");
        return;
    }

    const media = MessageMedia.fromFilePath('public/favicon.png');

    if (jokeData.type === "twopart") {

        const setupJoke = await message.reply(
            media,
            null,
            { caption: `> WhatsBot 🤖 : ${jokeData.setup}\n\n...` },
        );

        if (jokeData.delivery) {
            setTimeout(async () => {
                await setupJoke.reply(`> WhatsBot 🤖 : ${jokeData.delivery} \n\n😂😂🤣`);
            }, 5000);
        }

    } else if (jokeData.type === "single") {
        await message.reply(
            media,
            null,
            { caption: `> WhatsBot 🤖 : ${jokeData.joke} \n\n😂😂🤣` },
        );
    } else {
        message.reply("> WhatsBot 🤖 : No joke found");
        return;
    }
};
