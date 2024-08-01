// import whisper from 'whisper-node';
// const transcript =  whisper("public/downloads/sample.wav");
// console.log(transcript); // output: [ {start,end,speech} ]

import EnvConfig from "../configs/env.config";
import { AssemblyAI } from 'assemblyai';

export async function speechToText(file: string) {
    const client = new AssemblyAI({ apiKey: EnvConfig.ASSEMBLYAI_API_KEY });
    let transcript = await client.transcripts.transcribe({ audio: file, language_detection: true });
    return transcript;
}