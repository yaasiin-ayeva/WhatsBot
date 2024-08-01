import { AppConfig } from "../configs/app.config";
import EnvConfig from "../configs/env.config";
import logger from "../configs/logger.config";

const axios = require('axios');
const fs = require('fs');
const path = require('path');

export async function textToSpeech(text: string, fileName: string) : Promise<string> {

    const url = AppConfig.instance.getSpeechifyBaseUrl();
    const options = {
        method: 'POST',
        headers: {
            accept: '*/*',
            'content-type': 'application/json',
            Authorization: EnvConfig.SPEECHIFY_API_KEY,
        },
        data: {
            input: text,
            audio_format: 'ogg',
            language: 'en-US',
            model: 'simba-english',
            voice_id: 'henry'
        }
    };

    try {
        
        const response = await axios(url, options);
        const audioData = response.data.audio_data;
        const audioBuffer = Buffer.from(audioData, 'base64');
        const filePath = path.resolve(AppConfig.instance.getDownloadDir(), fileName);

        fs.writeFileSync(filePath, audioBuffer);

        return filePath;
    } catch (error) {
        logger.error(error);
        throw new Error('Failed to convert text to speech.');
    }
}
