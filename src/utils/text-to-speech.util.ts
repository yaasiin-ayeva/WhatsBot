import { detect } from 'langdetect';
import { AppConfig } from "../configs/app.config";
import EnvConfig from "../configs/env.config";
import logger from "../configs/logger.config";

const axios = require('axios');
const fs = require('fs');
const path = require('path');

export async function textToSpeech(text: string, fileName: string): Promise<string> {

    const detectedLanguage = detectLanguageLocale(text);
    const locale = detectedLanguage.locale;

    console.log(`Detected language: ${locale}`);

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
            language: locale,
            model: 'simba-multilingual',
            voice_id: 'elijah',
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

const languageToCountryMap: { [key: string]: string } = {
    'en': 'US',
    'fr': 'FR',
    'es': 'ES',
};

function detectLanguageLocale(text: string) {

    const result = detect(text);
    const langISO6391 = result[0]?.lang;

    if (langISO6391) {
        const countryCode = languageToCountryMap[langISO6391];
        return {
            lang: langISO6391,
            country: countryCode,
            locale: countryCode ? `${langISO6391}-${countryCode}` : 'en-US'
        }
    }

    return {
        lang: 'en',
        country: 'US',
        locale: 'en-US'
    };
}
