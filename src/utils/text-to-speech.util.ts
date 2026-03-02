import { detect } from 'langdetect';
import { AppConfig } from "../configs/app.config";
import logger from "../configs/logger.config";

const path = require('path');
const sherpaOnnx = require('sherpa-onnx-node');
const ttsInstances = new Map<string, any>();

export async function textToSpeech(text: string, fileName: string): Promise<string> {
    const detectedLanguage = detectLanguageLocale(text);
    const locale = detectedLanguage.locale;
    const lang = detectedLanguage.lang;

    logger.info(`Detected language for sherpa-onnx TTS: ${locale}`);

    try {
        const tts = getTts(locale, lang);
        const filePath = path.resolve(AppConfig.instance.getDownloadDir(), fileName);
        const audio = await tts.generateAsync({
            text,
            sid: parseInt(resolveLocaleEnv('SHERPA_ONNX_TTS_SPEAKER_ID', locale, lang) || "0", 10),
            speed: parseFloat(resolveLocaleEnv('SHERPA_ONNX_TTS_SPEED', locale, lang) || "1.0")
        });

        sherpaOnnx.writeWave(filePath, audio);

        return filePath;
    } catch (error) {
        logger.error(error);
        throw new Error('Failed to convert text to speech locally with sherpa-onnx.');
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

function resolveLocaleEnv(baseKey: string, locale: string, lang: string): string {
    const localeKey = `${baseKey}_${locale.replace(/-/g, '_').toUpperCase()}`;
    const langKey = `${baseKey}_${lang.toUpperCase()}`;
    return process.env[localeKey] || process.env[langKey] || process.env[baseKey] || '';
}

function getTts(locale: string, lang: string) {
    const model = resolveLocaleEnv('SHERPA_ONNX_TTS_MODEL_PATH', locale, lang);
    const tokens = resolveLocaleEnv('SHERPA_ONNX_TTS_TOKENS_PATH', locale, lang);
    const lexicon = resolveLocaleEnv('SHERPA_ONNX_TTS_LEXICON_PATH', locale, lang);
    const dataDir = resolveLocaleEnv('SHERPA_ONNX_TTS_DATA_DIR', locale, lang);

    if (!model || !tokens) {
        throw new Error("sherpa-onnx TTS models not available. Ensure the bot has started and models have been downloaded.");
    }

    const cacheKey = [model, tokens, lexicon || '', dataDir || '', process.env.SHERPA_ONNX_PROVIDER || 'cpu', process.env.SHERPA_ONNX_NUM_THREADS || '1'].join('|');
    if (ttsInstances.has(cacheKey)) {
        return ttsInstances.get(cacheKey);
    }

    const instance = new sherpaOnnx.OfflineTts({
        model: {
            vits: {
                model,
                tokens,
                lexicon: lexicon || undefined,
                dataDir: dataDir || undefined
            }
        },
        numThreads: parseInt(process.env.SHERPA_ONNX_NUM_THREADS || "1", 10),
        provider: process.env.SHERPA_ONNX_PROVIDER || "cpu"
    });

    ttsInstances.set(cacheKey, instance);
    return instance;
}
