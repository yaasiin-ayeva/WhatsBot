import logger from "../configs/logger.config";

const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const { execFile } = require("child_process");
const { promisify } = require("util");
const sherpaOnnx = require("sherpa-onnx-node");

const execFileAsync = promisify(execFile);
let recognizerInstance: any = null;

export async function speechToText(file: string) {
    try {
        const recognizer = getRecognizer();
        const normalizedPath = file.replace(/\.[^.]+$/, "") + ".stt.wav";

        await execFileAsync(ffmpegPath, [
            "-y",
            "-i", file,
            "-ar", "16000",
            "-ac", "1",
            normalizedPath
        ]);

        const wave = sherpaOnnx.readWave(normalizedPath);
        const stream = recognizer.createStream();
        stream.acceptWaveform(wave);
        await recognizer.decodeAsync(stream);

        return recognizer.getResult(stream);
    } catch (error) {
        logger.error("sherpa-onnx transcription failed:", error);
        throw new Error("Failed to transcribe audio locally with sherpa-onnx.");
    } finally {
        // Keep cleanup silent; the caller also deletes the original upload.
        try {
            const fs = require("fs");
            const normalizedPath = file.replace(/\.[^.]+$/, "") + ".stt.wav";
            if (fs.existsSync(normalizedPath)) {
                fs.unlinkSync(normalizedPath);
            }
        } catch (_) { /* ignore cleanup errors */ }
    }
}

function getRecognizer() {
    if (recognizerInstance) {
        return recognizerInstance;
    }

    const encoder = process.env.SHERPA_ONNX_ASR_ENCODER_PATH;
    const decoder = process.env.SHERPA_ONNX_ASR_DECODER_PATH;

    if (!encoder || !decoder) {
        throw new Error("sherpa-onnx ASR models not available. Ensure the bot has started and models have been downloaded.");
    }

    const whisperConfig: any = {
        encoder,
        decoder,
        task: process.env.SHERPA_ONNX_ASR_TASK || "transcribe"
    };

    if (process.env.SHERPA_ONNX_ASR_LANGUAGE) {
        whisperConfig.language = process.env.SHERPA_ONNX_ASR_LANGUAGE;
    }

    recognizerInstance = new sherpaOnnx.OfflineRecognizer({
        modelConfig: {
            whisper: whisperConfig,
            numThreads: parseInt(process.env.SHERPA_ONNX_NUM_THREADS || "1", 10),
            provider: process.env.SHERPA_ONNX_PROVIDER || "cpu"
        }
    });

    return recognizerInstance;
}
