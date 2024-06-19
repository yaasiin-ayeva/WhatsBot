const { ttdl } = require('btch-downloader');
import axios from "axios";
const fs = require("fs");

export type TSocialNetwork = "tiktok";

export interface ITikTokResult {
    title: string;
    title_audio: string;
    thumbnail: string;
    video: string[];
    audio: string[];
    creator: string;
}

const downloaders: { [key in TSocialNetwork]: (url: string) => Promise<string> } = {
    tiktok: async (url: string) => {
        const result = await ttdl(url) as ITikTokResult;
        return result.video.length > 0 ? result.video[0] : '';
    },
};

const socialNetworkPatterns: { [key in TSocialNetwork]: RegExp } = {
    tiktok: /^(?:https?:\/\/)?(?:www\.)?(tiktok\.com|vm\.tiktok\.com)\/.+$/i,
    // instagram: /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/.+$/i,
    // facebook: /^(?:https?:\/\/)?(?:www\.)?facebook\.com|m\.facebook|fb.watch\/.+$/i,
    // twitter: /^(?:https?:\/\/)?(?:www\.)?(twitter\.com|x\.com)\/.+$/i,
    // youtube: /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/|youtu\.be\/).+$/i,
};

export const identifySocialNetwork = (url: string): TSocialNetwork | null => {
    for (const [socialNetwork, pattern] of Object.entries(socialNetworkPatterns)) {
        if (pattern.test(url)) {
            return socialNetwork as TSocialNetwork
        }
    }
    return null;
};

export const downloader = async (url: string, type: TSocialNetwork): Promise<string> => {
    const downloadFunction = downloaders[type];
    if (!downloadFunction) {
        throw new Error(`Unsupported social network type: ${type}`);
    }

    try {
        const result = await downloadFunction(url);
        return result;
    } catch (error) {
        throw new Error(`Error downloading from ${type}: ${error.message}`);
    }
};

export const downloadFile = async (url: string, filePath: string): Promise<string> => {
    try {
        const response = await axios.get(url, { responseType: 'stream' });
        const fileStream = fs.createWriteStream(filePath);
        return new Promise((resolve, reject) => {
            response.data.pipe(fileStream);
            fileStream.on('finish', () => resolve(filePath));
            fileStream.on('error', (err: Error) => {
                reject(err);
            });
        });
    } catch (error) {
        throw error;
    }
};