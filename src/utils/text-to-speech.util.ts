import EnvConfig from "../configs/env.config";
import logger from "../configs/logger.config";

const axios = require('axios');
const fs = require('fs');
const path = require('path');

export async function textToSpeech(text: string, outputFile: string) {

    const url = 'https://api.sws.speechify.com/v1/audio/speech';
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

        fs.writeFileSync(path.resolve(outputFile), audioBuffer);
    } catch (error) {
        logger.error(error);
        throw new Error('Failed to convert text to speech.');
    }
}

// textToSpeech('Hello, World!', 'public/downloads/sample.wav');
