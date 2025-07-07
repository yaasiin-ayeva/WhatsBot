import { Message, MessageMedia } from 'whatsapp-web.js';
import 'dotenv/config';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { format_localtime } from '../utils/common.util';
import logger from '../configs/logger.config';
import EnvConfig from '../configs/env.config';
import { AppConfig } from '../configs/app.config';
import { UserI18n } from '../utils/i18n.util';

export const run = async (message: Message, args: string[] = null, userI18n: UserI18n) => {

    const city = args.join(" ");

    if (!city) {
        message.reply(`> WhatsBot 🤖 Please specify a city, for example: ${AppConfig.instance.getBotPrefix()}meteo New York.`);
        return;
    }

    if (city) {
        try {
            const weatherInfo = await getWeather(city);
            const weatherImage = await getWeatherImage(weatherInfo.icon);
            const formattedLocaltime = format_localtime(weatherInfo.localtime);
            const formattedMessage = `${weatherInfo.city}, ${formattedLocaltime} - ${weatherInfo.description}.`;
            await message.reply(MessageMedia.fromFilePath(weatherImage), null, { caption: AppConfig.instance.printMessage(formattedMessage) });
        } catch (error) {
            logger.error(error);
            message.reply('> WhatsBot 🤖 The weather service is currently unavailable. Please try again later.');
        }
    }
};

async function getWeather(city: string): Promise<{ description: string, icon: string, city: string, localtime: string }> {

    const url = AppConfig.instance.getWeatherApiUrl(EnvConfig.OPENWEATHERMAP_API_KEY, city);
    const response = await axios.get(url);
    const data = response.data;

    if (response.status === 200) {
        const description = data.current.condition.text;
        const icon = `http:${data.current.condition.icon}`;
        const city = data.location.name;
        const localtime = data.location.localtime;
        return { description, icon, city, localtime };
    } else {
        throw new Error(`Error fetching weather data: ${data.error.message}`);
    }
}

async function getWeatherImage(iconUrl: string): Promise<string> {
    const response = await axios.get(iconUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    const fileName = path.basename(iconUrl);
    const filePath = path.resolve(`./public/${fileName}`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
}