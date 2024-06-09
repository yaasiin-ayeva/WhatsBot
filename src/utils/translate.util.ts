import logger from "../configs/logger.config";

const translate = require('@iamtraction/google-translate');
export const languages = ['en', 'ko', 'ja', 'es', 'fr', 'de', 'zh', 'ru', 'pt', 'it', 'nl', 'pl', 'sv', 'tr', 'cs', 'hu', 'ro', 'fi', 'da', 'no', 'vi', 'el', 'bg', 'th', 'id', 'hi', 'ar', 'he', 'ur', 'fa', 'ps', 'fil', 'tl', 'ms', 'bn', 'pa', 'gu', 'ta', 'te', 'kn', 'ml', 'si', 'am', 'ne', 'mr', 'sa', 'mn', 'my', 'km', 'lo', 'bo', 'cy', 'jv', 'su', 'gl', 'ka', 'az', 'eu', 'is', 'mk', 'af', 'sq', 'hy', 'be', 'bs', 'hr', 'sr', 'mt', 'ga', 'yi', 'sw', 'kk', 'ky', 'tg', 'tk', 'uz', 'tt', 'bn', 'ka', 'hy', 'az', 'eu', 'is', 'mk', 'af', 'sq', 'hy', 'be', 'bs', 'hr', 'sr', 'mt', 'ga', 'yi', 'sw', 'kk', 'ky', 'tg', 'tk'];

export const translateText = async (text: string, lang: string) => {
    if (!languages.includes(lang)) throw new Error(`Invalid language code. Please use a valid language code.`);

    if (!text) throw new Error(`Please provide text to translate.`);

    translate(text, { to: lang }).then((res: any) => {
        return res.text;
    }).catch((err: any) => {
        logger.error(err);
        throw new Error("Translation error.");
    });
}