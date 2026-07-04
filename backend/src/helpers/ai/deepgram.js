// deepgram.js — Deepgram STT helper (live + batch).
//
// The live socket streams RAW LINEAR16 PCM @ 16 kHz mono (see interviewSttSocket.js),
// so the live connection MUST declare encoding/sample_rate/channels — Deepgram cannot
// auto-detect headerless PCM. The returned DeepgramStreamWrapper exposes the exact same
// interface the socket already drove for Google (on/send/getReadyState/keepAlive/
// finalize/finish + a "transcript"/"speech_started" event shape), so swapping providers
// is a one-line import change in the socket — no handler rewrites.

import { logAiUsage } from "./usageLogger.js";

let dgClient = null;
let LiveEvents = null;

const getClient = async () => {
    if (!dgClient) {
        if (!process.env.DEEPGRAM_API_KEY) {
            throw new Error("DEEPGRAM_API_KEY not found in environment");
        }

        // v3 SDK: use the createClient factory, not `new DeepgramClient(key)`
        // (the latter expects an options object, not the bare key string).
        const { createClient, LiveTranscriptionEvents } = await import("@deepgram/sdk");

        dgClient = createClient(process.env.DEEPGRAM_API_KEY);
        LiveEvents = LiveTranscriptionEvents;
    }
    return dgClient;
};

// =======================
// 🎤 Speech-to-Text (STT)
// =======================
export const transcribeAudio = async (buffer, mimetype = "audio/webm") => {
    const deepgram = await getClient();

    try {
        const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
            buffer,
            {
                model: process.env.DEEPGRAM_STT_MODEL || "nova-3",
                smart_format: true,
                mimetype,
                language: "multi",  // multilingual
            }
        );

        if (error) throw error;

        const transcript =
            result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

        const seconds = result?.metadata?.duration || 0;
        if (seconds > 0) {
            logAiUsage({
                provider: "deepgram_stt",
                operation: "transcribeAudio",
                totalTokens: seconds,
            });
        }

        return transcript;
    } catch (err) {
        console.error("❌ Deepgram STT Error:", err?.message || err);
        throw new Error("Failed to transcribe audio");
    }
};

/**
 * Adapter around Deepgram's live connection that presents the same surface the
 * interview socket already drove for Google. Deepgram's native message names
 * ("Results"/"SpeechStarted") are remapped to "transcript"/"speech_started", and
 * Deepgram's Results payload already matches the shape the socket reads
 * (`data.channel.alternatives[0].transcript` + `data.is_final`).
 */
class DeepgramStreamWrapper {
    constructor(connection, events) {
        this.connection = connection;
        this.events = events;
        this._totalBytes = 0;

        // Emit our normalized usage log once the connection closes.
        this.connection.on(events.Close, () => {
            const seconds = this._totalBytes / 32000; // LINEAR16 @ 16 kHz mono
            if (seconds > 0) {
                logAiUsage({
                    provider: "deepgram_stt",
                    operation: "liveTranscription",
                    totalTokens: seconds,
                });
            }
        });
    }

    on(event, handler) {
        const ev = this.events;
        if (event === "open") {
            this.connection.on(ev.Open, () => handler());
        } else if (event === "transcript") {
            // Deepgram "Results" payload already carries channel.alternatives[].transcript
            // and is_final, so it is forwarded verbatim.
            this.connection.on(ev.Transcript, (data) => handler(data));
        } else if (event === "speech_started") {
            this.connection.on(ev.SpeechStarted, () => handler());
        } else if (event === "error") {
            this.connection.on(ev.Error, (err) => handler(err));
        } else if (event === "close") {
            this.connection.on(ev.Close, () => handler());
        }
    }

    send(buffer) {
        if (this.connection.getReadyState() === 1) {
            this._totalBytes += buffer.length;
            this.connection.send(buffer);
        }
    }

    // Deepgram closes idle sockets after ~10s of no audio; a periodic KeepAlive
    // keeps the stream warm while questions/TTS play with the mic gated off.
    keepAlive() { this.connection.keepAlive(); }

    // Flush whatever the server is still buffering as a final transcript.
    finalize() { this.connection.finalize(); }

    // Ask the server to close the stream cleanly.
    finish() { this.connection.requestClose(); }

    // 0 = connecting, 1 = open, 2 = closing, 3 = closed (mirrors WS readyState).
    getReadyState() { return this.connection.getReadyState(); }
}

/**
 * Live streaming transcription — mirrors googleHelper.createLiveTranscriptionConnection.
 * @param {string[]} [roleSpecificPhrases=[]] Domain terms (interview topics). Accepted for
 *   interface parity; nova-3 MULTILINGUAL does not support keyword/keyterm boosting, so they
 *   are intentionally not forwarded. Domain-term accuracy (e.g. "AIML" being heard as
 *   "milliliter") is instead fixed downstream by an AI transcript-correction pass in
 *   submitAnswer — which works in EVERY language, unlike English-only keyterm prompting.
 * @param {object}   [options={}]             Extra Deepgram LiveSchema overrides.
 */
export const createLiveTranscriptionConnection = async (roleSpecificPhrases = [], options = {}) => {
    await getClient();

    const connection = dgClient.listen.live({
        model: process.env.DEEPGRAM_STT_MODEL || "nova-3",
        language: "multi",  // multilingual — required; do not hardcode to a single language
        // Raw, headerless PCM coming from the browser mic — must be declared explicitly,
        // Deepgram cannot infer it the way it does for container formats (webm/wav).
        encoding: "linear16",
        sample_rate: 16000,
        channels: 1,
        punctuate: true,
        smart_format: true,
        interim_results: true,
        vad_events: true,
        endpointing: 300,
        ...options,
    });

    return new DeepgramStreamWrapper(connection, LiveEvents);
};


export const generateTTS = async (text) => {
    const deepgram = await getClient();

    try {
        const response = await deepgram.speak.request(
            { text },
            {
                model: process.env.DEEPGRAM_TTS_MODEL || "aura-asteria-en",
                encoding: "mp3", // ✅ Important for stability
            }
        );

        const stream = await response.getStream();

        if (!stream) {
            throw new Error("No stream returned from Deepgram TTS");
        }

        return stream; // Return the fast stream directly
    } catch (err) {
        console.error("❌ Deepgram TTS Error:", err);
        throw new Error("Failed to generate speech");
    }
};

/**
 * Generates TTS audio and returns a raw Buffer (for server-side bundling).
 * Used by the interview controller to attach audio directly to the
 * submitAnswer response, eliminating a separate client TTS round-trip.
 */
export const generateTTSBuffer = async (text) => {
    const deepgram = await getClient();

    try {
        const response = await deepgram.speak.request(
            { text },
            {
                model: process.env.DEEPGRAM_TTS_MODEL || "aura-asteria-en",
                encoding: "mp3",
            }
        );

        const stream = await response.getStream();
        if (!stream) throw new Error("No stream returned from Deepgram TTS");

        // Collect all chunks into a single Buffer
        const chunks = [];
        const reader = stream.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        return Buffer.concat(chunks.map((c) => Buffer.from(c)));
    } catch (err) {
        console.error("❌ Deepgram TTS Buffer Error:", err);
        throw new Error("Failed to generate speech buffer");
    }
};

// =======================
// 📦 Export Helper
// =======================
const deepgramHelper = {
    transcribeAudio,
    createLiveTranscriptionConnection,
    generateTTS,
    generateTTSBuffer,
};

export default deepgramHelper;
