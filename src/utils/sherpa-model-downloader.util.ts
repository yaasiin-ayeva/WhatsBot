import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import logger from '../configs/logger.config';
import { SettingsModel } from '../crm/models/settings.model';

const execFileAsync = promisify(execFile);

// Stored under .bot/sherpa — same location as yt-dlp binary, already in .gitignore
const SHERPA_MODELS_DIR = path.join(__dirname, '../../.bot/sherpa');
const ASR_DIR           = path.join(SHERPA_MODELS_DIR, 'asr');
const TTS_DIR           = path.join(SHERPA_MODELS_DIR, 'tts');

const ASR_MODEL_NAME = 'sherpa-onnx-whisper-tiny.en';
const TTS_MODEL_NAME = 'vits-piper-en_US-lessac-medium';

const ASR_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${ASR_MODEL_NAME}.tar.bz2`;
const TTS_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${TTS_MODEL_NAME}.tar.bz2`;

const ASR_MODEL_DIR = path.join(ASR_DIR, ASR_MODEL_NAME);
const TTS_MODEL_DIR = path.join(TTS_DIR, TTS_MODEL_NAME);

/**
 * Initializes sherpa-onnx models at startup, downloading them if not present.
 * Follows the same pattern as YtDlpDownloader.
 * Sets process.env vars so speech-to-text.util and text-to-speech.util pick them up automatically.
 */
export async function initializeSherpaModels(): Promise<void> {
    try {
        await ensureAsr();
        await ensureTts();
    } catch (err: any) {
        logger.warn('sherpa-onnx model initialization failed — STT/TTS unavailable:', err.message);
    }
}

async function ensureAsr(): Promise<void> {
    const encoderPath = path.join(ASR_MODEL_DIR, 'tiny.en-encoder.int8.onnx');
    const decoderPath = path.join(ASR_MODEL_DIR, 'tiny.en-decoder.int8.onnx');
    const tokensPath  = path.join(ASR_MODEL_DIR, 'tiny.en-tokens.txt');

    // If user supplied env vars manually, trust them
    if (
        process.env.SHERPA_ONNX_ASR_ENCODER_PATH &&
        process.env.SHERPA_ONNX_ASR_DECODER_PATH &&
        process.env.SHERPA_ONNX_ASR_TOKENS_PATH &&
        fs.existsSync(process.env.SHERPA_ONNX_ASR_ENCODER_PATH) &&
        fs.existsSync(process.env.SHERPA_ONNX_ASR_DECODER_PATH) &&
        fs.existsSync(process.env.SHERPA_ONNX_ASR_TOKENS_PATH)
    ) {
        await persistSherpaPaths({
            SHERPA_ONNX_ASR_ENCODER_PATH: process.env.SHERPA_ONNX_ASR_ENCODER_PATH,
            SHERPA_ONNX_ASR_DECODER_PATH: process.env.SHERPA_ONNX_ASR_DECODER_PATH,
            SHERPA_ONNX_ASR_TOKENS_PATH: process.env.SHERPA_ONNX_ASR_TOKENS_PATH,
        });
        logger.info('sherpa-onnx ASR: using env-configured models');
        return;
    }

    if (fs.existsSync(encoderPath) && fs.existsSync(decoderPath) && fs.existsSync(tokensPath)) {
        setAsrEnv(encoderPath, decoderPath, tokensPath);
        await persistSherpaPaths({
            SHERPA_ONNX_ASR_ENCODER_PATH: encoderPath,
            SHERPA_ONNX_ASR_DECODER_PATH: decoderPath,
            SHERPA_ONNX_ASR_TOKENS_PATH: tokensPath,
        });
        logger.info('sherpa-onnx ASR models already present');
        return;
    }

    logger.info('Downloading sherpa-onnx ASR model (whisper-tiny.en) — this may take a moment…');
    if (!fs.existsSync(ASR_DIR)) fs.mkdirSync(ASR_DIR, { recursive: true });

    const archive = path.join(ASR_DIR, `${ASR_MODEL_NAME}.tar.bz2`);
    try {
        await downloadFile(ASR_URL, archive);
        await extractTarBz2(archive, ASR_DIR);
        fs.unlinkSync(archive);
        setAsrEnv(encoderPath, decoderPath, tokensPath);
        await persistSherpaPaths({
            SHERPA_ONNX_ASR_ENCODER_PATH: encoderPath,
            SHERPA_ONNX_ASR_DECODER_PATH: decoderPath,
            SHERPA_ONNX_ASR_TOKENS_PATH: tokensPath,
        });
        logger.info('sherpa-onnx ASR model ready');
    } catch (err) {
        if (fs.existsSync(archive)) fs.unlinkSync(archive);
        throw err;
    }
}

async function ensureTts(): Promise<void> {
    const modelPath   = path.join(TTS_MODEL_DIR, 'en_US-lessac-medium.onnx');
    const tokensPath  = path.join(TTS_MODEL_DIR, 'tokens.txt');
    const dataDirPath = path.join(TTS_MODEL_DIR, 'espeak-ng-data');

    // If user supplied env vars manually, trust them
    if (
        process.env.SHERPA_ONNX_TTS_MODEL_PATH &&
        process.env.SHERPA_ONNX_TTS_TOKENS_PATH &&
        fs.existsSync(process.env.SHERPA_ONNX_TTS_MODEL_PATH) &&
        fs.existsSync(process.env.SHERPA_ONNX_TTS_TOKENS_PATH)
    ) {
        await persistSherpaPaths({
            SHERPA_ONNX_TTS_MODEL_PATH: process.env.SHERPA_ONNX_TTS_MODEL_PATH,
            SHERPA_ONNX_TTS_TOKENS_PATH: process.env.SHERPA_ONNX_TTS_TOKENS_PATH,
            ...(process.env.SHERPA_ONNX_TTS_DATA_DIR ? { SHERPA_ONNX_TTS_DATA_DIR: process.env.SHERPA_ONNX_TTS_DATA_DIR } : {}),
        });
        logger.info('sherpa-onnx TTS: using env-configured models');
        return;
    }

    if (fs.existsSync(modelPath) && fs.existsSync(tokensPath)) {
        setTtsEnv(modelPath, tokensPath, dataDirPath);
        await persistSherpaPaths({
            SHERPA_ONNX_TTS_MODEL_PATH: modelPath,
            SHERPA_ONNX_TTS_TOKENS_PATH: tokensPath,
            ...(fs.existsSync(dataDirPath) ? { SHERPA_ONNX_TTS_DATA_DIR: dataDirPath } : {}),
        });
        logger.info('sherpa-onnx TTS models already present');
        return;
    }

    logger.info('Downloading sherpa-onnx TTS model (vits-piper-en_US-lessac-medium) — this may take a moment…');
    if (!fs.existsSync(TTS_DIR)) fs.mkdirSync(TTS_DIR, { recursive: true });

    const archive = path.join(TTS_DIR, `${TTS_MODEL_NAME}.tar.bz2`);
    try {
        await downloadFile(TTS_URL, archive);
        await extractTarBz2(archive, TTS_DIR);
        fs.unlinkSync(archive);
        setTtsEnv(modelPath, tokensPath, dataDirPath);
        await persistSherpaPaths({
            SHERPA_ONNX_TTS_MODEL_PATH: modelPath,
            SHERPA_ONNX_TTS_TOKENS_PATH: tokensPath,
            ...(fs.existsSync(dataDirPath) ? { SHERPA_ONNX_TTS_DATA_DIR: dataDirPath } : {}),
        });
        logger.info('sherpa-onnx TTS model ready');
    } catch (err) {
        if (fs.existsSync(archive)) fs.unlinkSync(archive);
        throw err;
    }
}

async function downloadFile(url: string, dest: string): Promise<void> {
    const response = await axios.get(url, {
        responseType: 'stream',
        timeout: 600_000, // 10 minutes for large model files
        maxRedirects: 10
    });

    const writer = fs.createWriteStream(dest);
    await new Promise<void>((resolve, reject) => {
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
        response.data.on('error', reject);
    });
}

async function extractTarBz2(archive: string, destDir: string): Promise<void> {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    await execFileAsync('tar', ['-xjf', archive, '-C', destDir]);
}

function setAsrEnv(encoder: string, decoder: string, tokens: string): void {
    if (!process.env.SHERPA_ONNX_ASR_ENCODER_PATH) process.env.SHERPA_ONNX_ASR_ENCODER_PATH = encoder;
    if (!process.env.SHERPA_ONNX_ASR_DECODER_PATH)  process.env.SHERPA_ONNX_ASR_DECODER_PATH  = decoder;
    if (!process.env.SHERPA_ONNX_ASR_TOKENS_PATH)   process.env.SHERPA_ONNX_ASR_TOKENS_PATH   = tokens;
}

function setTtsEnv(model: string, tokens: string, dataDir: string): void {
    if (!process.env.SHERPA_ONNX_TTS_MODEL_PATH)  process.env.SHERPA_ONNX_TTS_MODEL_PATH  = model;
    if (!process.env.SHERPA_ONNX_TTS_TOKENS_PATH) process.env.SHERPA_ONNX_TTS_TOKENS_PATH = tokens;
    if (!process.env.SHERPA_ONNX_TTS_DATA_DIR && fs.existsSync(dataDir)) {
        process.env.SHERPA_ONNX_TTS_DATA_DIR = dataDir;
    }
}

async function persistSherpaPaths(paths: Record<string, string | undefined>): Promise<void> {
    try {
        const update: Record<string, string> = {};
        for (const [key, value] of Object.entries(paths)) {
            if (!value) continue;
            update[`apiKeys.${key}`] = value;
            process.env[key] = value;
        }

        if (Object.keys(update).length === 0) return;
        await SettingsModel.findOneAndUpdate({}, { $set: update }, { upsert: true });
    } catch (error) {
        logger.warn('Failed to persist sherpa model paths to settings:', error);
    }
}
