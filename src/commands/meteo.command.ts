import { Message, MessageMedia } from 'whatsapp-web.js';
import 'dotenv/config';
import axios from 'axios';
import moment from 'moment';
import 'moment/locale/fr';
import * as fs from 'fs';
import * as path from 'path';


export const run = async (message: Message, args: string[] = null, prefix: string = "/") => {
    if (message.body.startsWith('/meteo')) {
        const city = message.body.split(' ')[1];
        if (city) {
            try {
                const weatherInfo = await getWeather(city);
                const weatherImage = await getWeatherImage(weatherInfo.icon);
                const formattedLocaltime = moment(weatherInfo.localtime, 'YYYY-MM-DD HH:mm').format('LLL');
                const formattedMessage = `${weatherInfo.city}, ${formattedLocaltime} - ${weatherInfo.description}.`;
                await message.reply(MessageMedia.fromFilePath(weatherImage));
                await message.reply(formattedMessage);
            } catch (error) {
                console.error(error);
                message.reply('> WhatsBot 🤖 Le service météorologique est fermé et revient bientôt.');
            }
        } else {
            message.reply('> WhatsBot 🤖 You prick! Specify a city; learn: /meteo Niamtougou. Do I have to tell you ?');
        }
    }
};

async function getWeather(city: string): Promise<{ description: string, icon: string, city: string, localtime: string }> {
    const apiKey = process.env.OPENWEATHERMAP_API_KEY;
    if (!apiKey) {
        throw new Error('API key is missing. Please check your .env file.');
    }
    const url = `http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${city}&lang=fr`;
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
    const filePath = path.resolve(`./tmp/${fileName}`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
}