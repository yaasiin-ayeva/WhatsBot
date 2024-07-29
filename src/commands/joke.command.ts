import axios from "axios";
import { Message, MessageMedia } from "whatsapp-web.js";
import { AppConfig } from "../configs/app.config";

export const run = async (message: Message, _args: string[] = null) => {

    const jokeData = await axios(AppConfig.instance.getJokeApiUrl()).then((res) => res.data);

    if (!jokeData) {
        message.reply("> WhatsBot 🤖 : No joke found");
        return;
    }

    const media = MessageMedia.fromFilePath(AppConfig.instance.getBotAvatar());

    if (jokeData.type === "twopart") {

        const setupJoke = await message.reply(
            media,
            null,
            { caption: `> WhatsBot 🤖 : ${jokeData.setup}\n\n...` },
        );

        if (jokeData.delivery) {
            setTimeout(async () => {
                await setupJoke.reply(AppConfig.instance.printMessage(`${jokeData.delivery}\n😂😂🤣`));
            }, 5000);
        }

    } else if (jokeData.type === "single") {
        await message.reply(
            media,
            null,
            { caption: AppConfig.instance.printMessage(`${jokeData.joke} \n😂😂🤣`) },
        );
    } else {
        message.reply("> WhatsBot 🤖 : No joke found");
        return;
    }
};
