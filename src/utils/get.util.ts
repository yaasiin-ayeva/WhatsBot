import YTDlpWrap from 'yt-dlp-wrap';
import { ttdl, igdl, twitter as twitterDL, fbdown, youtube as youtubeDL } from 'btch-downloader';
import axios from "axios";
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import logger from "../configs/logger.config";

axios.defaults.timeout = 30000;
axios.defaults.headers.common['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const YTDL_DIR = path.join(__dirname, '../../.bot');
export const YTDL_PATH = path.join(YTDL_DIR, 'yt-dlp');
export const YTDL_BINARY_PATH = path.join(YTDL_DIR, 'yt-dlp-bin');
export const MAX_STREAMING_FILE_SIZE = 150 * 1024 * 1024; // 150 MB
export const DOWNLOAD_DIR = path.join(__dirname, '../../public/downloads');

export type TSocialNetwork = "tiktok" | "instagram" | "twitter" | "facebook" | "pinterest" | "youtube" | "snapchat" | "linkedin" | "reddit" | "twitch" | "vimeo" | "dailymotion" | "threads" | "rumble" | "bilibili";
export type TDownloadMethod = "btch" | "ytdlp";

export interface ILinkedInVideo {
    url: string;
    quality: string | null;
}

export interface ITikTokResult {
    title: string;
    title_audio: string;
    thumbnail: string;
    video: string[];
    audio: string[];
    creator: string;
}

export interface IInstagramResult {
    wm?: string;
    url: string;
    thumbnail?: string;
}

export interface ITwitterResult {
    title: string;
    url: {
        hd?: string;
        sd?: string;
    }[];
}

export interface IFacebookResult {
    Normal_video: string;
    HD: string;
    audio: string;
}

export interface IPinterestResult {
    video: string;
}

export interface IYoutubeResult {
    id: string | null;
    mp4: string;
    mp3: string;
}

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

    public async getMetadata(url: string): Promise<any> {
        if (!this.ytDlp) {
            await this.initialize();
        }
        return this.ytDlp!.getVideoInfo(url);
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
            this.ytDlp!
                .exec([
                    url,
                    '-f', format,
                    '-o', outputPath,
                    '--no-playlist',
                    '--merge-output-format', 'mp4',
                    '--concurrent-fragments', '1',
                    "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/237.84.2.178 Safari/537.36"
                ])
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

class LinkedIn {
    url: string;

    constructor(url: string) {
        this.url = url;
    }

    private async fetchHtml(): Promise<any> {
        try {
            const response = await axios.get(this.url);
            const html = cheerio.load(response.data);

            if (!html) {
                throw new Error("Invalid Content");
            }
            return html;
        } catch (error) {
            logger.error(`Error fetching LinkedIn HTML: ${error.message}`);
            throw new Error(`Unable to fetch content from LinkedIn`);
        }
    }

    private getMetadata(url: string): { quality: string | null } {
        const pattern = /\/(\w*?)-(\w*?)-(\w*?)-/;
        const matches = url.match(pattern);
        return {
            quality: matches ? matches[2] : null,
        };
    }

    public async extractVideos(): Promise<ILinkedInVideo[]> {
        const html = await this.fetchHtml();
        const videoElements = html("video[data-sources]");
        const result: ILinkedInVideo[] = [];

        videoElements.each((_, element) => {
            const ve = html(element).attr("data-sources");
            if (ve) {
                const parsedVideos = JSON.parse(ve);
                parsedVideos.forEach((videoObj: { src: string }) => {
                    result.push({
                        url: videoObj.src,
                        quality: this.getMetadata(videoObj.src).quality,
                    });
                });
            }
        });

        return result;
    }
}

const socialNetworkPatterns: { [key in TSocialNetwork]: RegExp } = {
    tiktok: /^(?:https?:\/\/)?(?:www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com|t\.tiktok\.com|m\.tiktok\.com)\/.+$/i,
    instagram: /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/.+$/i,
    twitter: /^(?:https?:\/\/)?(?:www\.)?(twitter\.com|x\.com)\/.+$/i,
    facebook: /^(?:https?:\/\/)?(?:www\.|m\.|web\.)?facebook\.com\/.+|fb\.watch\/.+$/i,
    pinterest: /^(?:https?:\/\/)?(?:www\.)?pinterest\.com|pin\.it\/.+$/i,
    youtube: /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/|youtu\.be\/).+$/i,
    snapchat: /^(?:https?:\/\/)?(?:www\.)?(snapchat\.com|t\.snapchat\.com)\/.+$/i,
    linkedin: /^(?:https?:\/\/)?(?:www\.)?linkedin\.com\/.+$/i,
    reddit: /^(?:https?:\/\/)?(?:www\.)?(reddit\.com|v\.redd\.it)\/.+$/i,
    twitch: /^(?:https?:\/\/)?(?:www\.)?(twitch\.tv|clips\.twitch\.tv)\/.+$/i,
    vimeo: /^(?:https?:\/\/)?(?:www\.)?vimeo\.com\/.+$/i,
    dailymotion: /^(?:https?:\/\/)?(?:www\.)?(dailymotion\.com|dai\.ly)\/.+$/i,
    threads: /^(?:https?:\/\/)?(?:www\.)?threads\.net\/.+$/i,
    rumble: /^(?:https?:\/\/)?(?:www\.)?rumble\.com\/.+$/i,
    bilibili: /^(?:https?:\/\/)?(?:www\.)?(bilibili\.com|b23\.tv)\/.+$/i,
};

export const identifySocialNetwork = (url: string): TSocialNetwork | null => {
    for (const [socialNetwork, pattern] of Object.entries(socialNetworkPatterns)) {
        if (pattern.test(url)) {
            return socialNetwork as TSocialNetwork;
        }
    }
    return null;
};

const btchDownloaders: { [key in TSocialNetwork]: (url: string) => Promise<string> } = {
    tiktok: async (url: string) => {
        const result = await ttdl(url) as unknown as ITikTokResult;
        return result.video.length > 0 ? result.video[0] : '';
    },
    instagram: async (url: string) => {
        const result = await igdl(url) as unknown as IInstagramResult[];
        return result.length > 0 && result[0].url ? result[0].url : '';
    },
    twitter: async (url: string) => {
        const result = await twitterDL(url) as unknown as ITwitterResult;
        return result.url?.[0]?.hd ?? result.url?.[0]?.sd ?? '';
    },
    facebook: async (url: string) => {
        const result = await fbdown(url) as unknown as IFacebookResult;
        return result.HD ?? result.Normal_video ?? result.audio ?? '';
    },
    pinterest: async (url: string) => {
        try {
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);

            const video = $('video[src]').attr('src');
            if (!video) {
                return '';
            }

            const videoUrl = video.replace("/hls/", "/720p/").replace(".m3u8", ".mp4");
            return videoUrl ? videoUrl : '';
        } catch (error) {
            return '';
        }
    },
    youtube: async (url: string) => {
        const result = await youtubeDL(url) as unknown as IYoutubeResult;
        return result && result.mp4 ? result.mp4 : '';
    },
    linkedin: async (url: string) => {
        const linkedIn = new LinkedIn(url);
        const videos = await linkedIn.extractVideos();
        return videos.length > 0 ? videos[0].url : '';
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
    },
    // New platforms — no btch support, yt-dlp fallback handles these
    reddit: async () => '',
    twitch: async () => '',
    vimeo: async () => '',
    dailymotion: async () => '',
    threads: async () => '',
    rumble: async () => '',
    bilibili: async () => '',
};

const ytdlpDownloaders: { [key in TSocialNetwork]: (url: string) => Promise<string> } = {
    tiktok: (url) => YtDlpDownloader.getInstance().download(url),
    // instagram: (url) => YtDlpDownloader.getInstance().download(url, 'bestvideo+bestaudio/best'),
    instagram: (url) => YtDlpDownloader.getInstance().download(url, 'best[ext=mp4]/best'),
    twitter: (url) => YtDlpDownloader.getInstance().download(url),
    facebook: (url) => YtDlpDownloader.getInstance().download(url),
    linkedin: (url) => YtDlpDownloader.getInstance().download(url),
    youtube: (url) => YtDlpDownloader.getInstance().download(url, 'best[ext=mp4]/best'),
    snapchat: (url) => YtDlpDownloader.getInstance().download(url),
    pinterest: (url) => YtDlpDownloader.getInstance().download(url),
    reddit: (url) => YtDlpDownloader.getInstance().download(url),
    twitch: (url) => YtDlpDownloader.getInstance().download(url),
    vimeo: (url) => YtDlpDownloader.getInstance().download(url),
    dailymotion: (url) => YtDlpDownloader.getInstance().download(url),
    threads: (url) => YtDlpDownloader.getInstance().download(url),
    rumble: (url) => YtDlpDownloader.getInstance().download(url),
    bilibili: (url) => YtDlpDownloader.getInstance().download(url),
};

export const downloader = async (
    url: string,
    type: TSocialNetwork | null,
    method: TDownloadMethod = null
): Promise<string> => {
    // Unknown platform → go straight to yt-dlp
    if (!type) {
        logger.info(`Unknown platform, attempting yt-dlp for: ${url}`);
        return YtDlpDownloader.getInstance().download(url);
    }

    const btchPrimary = ["instagram", "pinterest"];
    const useBtch = method ? method === "btch" : btchPrimary.includes(type);

    if (useBtch) {
        try {
            const result = await btchDownloaders[type](url);
            if (result) return result;
            logger.warn(`btch returned empty for ${type}, falling back to yt-dlp`);
        } catch (err) {
            logger.warn(`btch failed for ${type}, falling back to yt-dlp: ${err.message}`);
        }
        return YtDlpDownloader.getInstance().download(url);
    }

    try {
        return await ytdlpDownloaders[type](url);
    } catch (error) {
        logger.error(`yt-dlp failed for ${type} (${url}):`, error);
        throw new Error(`Failed to download from ${type}: ${error.message}`);
    }
};

export const downloadFile = async (
    url: string,
    filePath: string,
    maxSize: number = MAX_STREAMING_FILE_SIZE
): Promise<string> => {
    let fileStream: fs.WriteStream | null = null;
    let responseStream: any = null;

    try {
        const response = await axios.get(url, {
            responseType: 'stream',
            timeout: 60000, // 60s for file downloads (longer than default)
            maxRedirects: 5
        });
        responseStream = response.data;
        fileStream = fs.createWriteStream(filePath);

        let downloadedSize = 0;

        return new Promise((resolve, reject) => {
            const cleanup = () => {
                if (responseStream && !responseStream.destroyed) {
                    responseStream.destroy();
                }
                if (fileStream && !fileStream.destroyed) {
                    fileStream.destroy();
                }
                if (fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(filePath);
                    } catch (err) {
                        logger.error(`Failed to delete partial file ${filePath}:`, err);
                    }
                }
            };

            responseStream.on('data', (chunk: Buffer) => {
                downloadedSize += chunk.length;
                if (downloadedSize > maxSize) {
                    cleanup();
                    reject(new Error(`File size exceeds the maximum limit of ${maxSize / 1024 / 1024} MB`));
                }
            });

            responseStream.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream = null;
                resolve(filePath);
            });

            fileStream.on('error', (err: Error) => {
                cleanup();
                reject(err);
            });

            responseStream.on('error', (err: Error) => {
                cleanup();
                reject(err);
            });
        });
    } catch (error) {
        if (responseStream && !responseStream.destroyed) {
            responseStream.destroy();
        }
        if (fileStream && !fileStream.destroyed) {
            fileStream.destroy();
        }
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (err) {
                logger.error(`Failed to delete partial file ${filePath}:`, err);
            }
        }
        throw error;
    }
};