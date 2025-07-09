import YTDlpWrap from 'yt-dlp-wrap';
import logger from "../configs/logger.config";
import fs from 'fs';
import path from 'path';
import axios from "axios";

export const YTDL_DIR = path.join(__dirname, '../../.bot');
export const YTDL_PATH = path.join(YTDL_DIR, 'yt-dlp');
export const YTDL_BINARY_PATH = path.join(YTDL_DIR, 'yt-dlp-bin');
export const MAX_STREAMING_FILE_SIZE = 85 * 1024 * 1024; // 95 MB
export const DOWNLOAD_DIR = path.join(__dirname, '../../public/downloads');

export type TSocialNetwork = "tiktok" | "instagram" | "twitter" | "facebook" | "linkedin" | "youtube" | "snapchat" | "pinterest";

export class YtDlpDownloader {
    private static instance: YtDlpDownloader;
    private ytDlp: YTDlpWrap | null = null;

    private constructor() { }

    public static getInstance(): YtDlpDownloader {
        if (!YtDlpDownloader.instance) {
            YtDlpDownloader.instance = new YtDlpDownloader();
        }
        return YtDlpDownloader.instance;
    }

    public async initialize(): Promise<void> {
        try {
            if (!fs.existsSync(YTDL_DIR)) {
                fs.mkdirSync(YTDL_DIR, { recursive: true });
            }

            if (!fs.existsSync(YTDL_BINARY_PATH)) {
                logger.info('Downloading yt-dlp binary...');
                await YTDlpWrap.downloadFromGithub(YTDL_BINARY_PATH);
            }

            this.ytDlp = new YTDlpWrap(YTDL_BINARY_PATH);
            logger.info('Downloader initialized successfully');
        } catch (error) {
            logger.error('Downloader initialization failed:', error);
            throw error;
        }
    }

    public async download(url: string, format = 'best'): Promise<string> {
        if (!this.ytDlp) {
            await this.initialize();
        }

        if (!fs.existsSync(DOWNLOAD_DIR)) {
            fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
        }

        const outputPath = path.join(DOWNLOAD_DIR, `${Date.now()}.%(ext)s`);

        return new Promise((resolve, reject) => {
            if (!this.ytDlp) {
                reject(new Error('Downloader not initialized'));
                return;
            }

            this.ytDlp
                .exec([url, '-f', format, '-o', outputPath, '--no-playlist'])
                .on('progress', (progress) => {
                    logger.debug(`Download progress: ${progress.percent}%`);
                })
                .on('error', (error) => {
                    logger.error('Downloader error:', error);
                    reject(error);
                })
                .on('close', () => {
                    const files = fs.readdirSync(DOWNLOAD_DIR)
                        .filter(file => file.startsWith(path.basename(outputPath).replace('%(ext)s', '')));

                    if (files.length === 0) {
                        reject(new Error('No file downloaded'));
                        return;
                    }
                    resolve(path.join(DOWNLOAD_DIR, files[0]));
                });
        });
    }
}

const socialNetworkPatterns: { [key in TSocialNetwork]: RegExp } = {
    tiktok: /^(?:https?:\/\/)?(?:www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com|t\.tiktok\.com)\/.+$/i,
    instagram: /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/.+$/i,
    twitter: /^(?:https?:\/\/)?(?:www\.)?(twitter\.com|x\.com)\/.+$/i,
    pinterest: /^(?:https?:\/\/)?(?:www\.)?pinterest\.com|pin\.it\/.+$/i,
    facebook: /^(?:https?:\/\/)?(?:www\.|m\.|web\.)?facebook\.com\/.+|fb\.watch\/.+$/i,
    linkedin: /^(?:https?:\/\/)?(?:www\.)?linkedin\.com\/.+$/i,
    youtube: /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/.+$/i,
    snapchat: /^(?:https?:\/\/)?(?:www\.)?snapchat\.com\/.+$/i
};

export const identifySocialNetwork = (url: string): TSocialNetwork | null => {
    for (const [socialNetwork, pattern] of Object.entries(socialNetworkPatterns)) {
        if (pattern.test(url)) {
            return socialNetwork as TSocialNetwork;
        }
    }
    return null;
};

const downloaders: { [key in TSocialNetwork]: (url: string) => Promise<string> } = {
    tiktok: (url) => YtDlpDownloader.getInstance().download(url),
    instagram: (url) => YtDlpDownloader.getInstance().download(url, 'bestvideo+bestaudio/best'),
    twitter: (url) => YtDlpDownloader.getInstance().download(url),
    facebook: (url) => YtDlpDownloader.getInstance().download(url),
    linkedin: (url) => YtDlpDownloader.getInstance().download(url),
    youtube: (url) => YtDlpDownloader.getInstance().download(url),
    snapchat: (url) => YtDlpDownloader.getInstance().download(url),
    pinterest: (url) => YtDlpDownloader.getInstance().download(url),
};

export const downloader = async (url: string, type: TSocialNetwork): Promise<string> => {
    try {
        return await downloaders[type](url);
    } catch (error) {
        logger.error(`Download failed for ${url}:`, error);
        throw new Error(`Failed to download from ${type}: ${error.message}`);
    }
};

export const downloadFile = async (url: string, filePath: string): Promise<string> => {
    const writer = fs.createWriteStream(filePath);

    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(filePath));
        writer.on('error', reject);
    });
};