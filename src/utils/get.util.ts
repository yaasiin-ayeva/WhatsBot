const { igdl, fbdown } = require('btch-downloader');
import axios from "axios";
const fs = require("fs");
import * as cheerio from 'cheerio';
import logger from "../configs/logger.config";
import DlMate from 'dl-mate';

export type TSocialNetwork = "tiktok" | "instagram" | "twitter" | "facebook" | "pinterest" | "youtube" | "snapchat" | "linkedin";
export const MAX_STREAMING_FILE_SIZE = 80 * 1024 * 1024;    // 80 MB
const mate = new DlMate();

export interface IInstagramResult {
    wm?: string;
    url: string;
    thumbnail?: string;
}

export interface IFacebookResult {
    Normal_video: string;
    HD: string;
    audio: string;
}

const downloaders: { [key in TSocialNetwork]: (url: string) => Promise<string> } = {
    tiktok: async (url: string) => {
        const result = await mate.downloadTikTok(url);
        return result.video.length > 0 ? result.video[0] : '';
    },
    instagram: async (url: string) => {
        const result = await igdl(url) as IInstagramResult[];
        return result.length > 0 && result[0].url ? result[0].url : '';
    },
    twitter: async (url: string) => {
        const result = await mate.downloadX(url);
        return result.downloads.length > 0 ? result.downloads[0]?.url : '';
    },
    facebook: async (url: string) => {
        const result = await fbdown(url) as IFacebookResult;
        return result.HD ?? result.Normal_video ?? result.audio ?? '';
    },
    pinterest: async (url: string) => {
        const result = await mate.downloadPinterest(url);
        return result.video || '';
    },
    youtube: async (url: string) => {
        const result = await mate.downloadYouTube(url);
        return result && result.formats && result.formats.length > 0 ? result.formats[0]?.url : '';
    },
    linkedin: async (url: string) => {
        const result = await mate.downloadLinkedIn(url);
        return result.downloads.length > 0 ? result.downloads[0]?.url : '';
    },
    snapchat: async (url: string) => {
        try {
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);

            const videoUrl = $('link[rel="preload"][as="video"]').attr('href');
            logger.debug(videoUrl);

            if (!videoUrl) {
                return '';
            }

            return videoUrl ? videoUrl : '';
        } catch (error) {
            return '';
        }
    }
};

const socialNetworkPatterns: { [key in TSocialNetwork]: RegExp } = {
    tiktok: /^(?:https?:\/\/)?(?:www\.)?(tiktok\.com|vm\.tiktok\.com)\/.+$/i,
    instagram: /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/.+$/i,
    twitter: /^(?:https?:\/\/)?(?:www\.)?(twitter\.com|x\.com)\/.+$/i,
    facebook: /^(?:https?:\/\/)?(?:www\.)?facebook\.com|m\.facebook|fb.watch\/.+$/i,
    pinterest: /^(?:https?:\/\/)?(?:www\.)?pinterest\.com|pin\.it\/.+$/i,
    youtube: /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/|youtu\.be\/).+$/i,
    snapchat: /^(?:https?:\/\/)?(?:www\.)?snapchat\.com\/.+$/i,
    linkedin: /^(?:https?:\/\/)?(?:www\.)?linkedin\.com\/.+$/i
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

export const downloadFile = async (url: string, filePath: string, maxSize: number = MAX_STREAMING_FILE_SIZE): Promise<string> => {
    try {

        const response = await axios.get(url, { responseType: 'stream' });
        const fileStream = fs.createWriteStream(filePath);

        let downloadedSize = 0;

        return new Promise((resolve, reject) => {
            response.data.on('data', (chunk: Buffer) => {
                downloadedSize += chunk.length;
                if (downloadedSize > maxSize) {
                    response.data.destroy();
                    reject(new Error(`File size exceeds the maximum limit of ${maxSize / 1024 / 1024} MB`));
                }
            });

            response.data.pipe(fileStream);
            fileStream.on('finish', () => resolve(filePath));
            fileStream.on('error', (err: Error) => reject(err));
        });
    } catch (error) {
        throw error;
    }
};