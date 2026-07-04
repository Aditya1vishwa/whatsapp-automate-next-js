// google.js — Google Cloud STT + TTS helper

import speech from "@google-cloud/speech";
import textToSpeech from "@google-cloud/text-to-speech";
import { logAiUsage } from "./usageLogger.js";

// ── STT Client ────────────────────────────────────────────────────────────────
let sttClient = null;

const getSttClient = () => {
    if (!sttClient) {
        if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_PRIVATE_KEY) {
            console.warn("⚠️ Google credentials not set, using default credentials if available.");
        }
        sttClient = new speech.SpeechClient();
    }
    return sttClient;
};

// ── TTS Client ────────────────────────────────────────────────────────────────
let ttsClient = null;

const getTtsClient = () => {
    if (!ttsClient) ttsClient = new textToSpeech.TextToSpeechClient();
    return ttsClient;
};


// =======================
// 🎤 Speech-to-Text (STT)
// =======================

/**
 * Batch transcription — mirrors deepgramHelper.transcribeAudio
 */
export const transcribeAudio = async (buffer, mimetype = "audio/webm") => {
    const client = getSttClient();
    const encoding = mimetype.includes("mp4") ? "MP4_AUDIO" : "WEBM_OPUS";

    const request = {
        audio: { content: buffer.toString("base64") },
        config: {
            encoding,
            sampleRateHertz: 16000,
            languageCode: "en-US",
            alternativeLanguageCodes: ["en-IN"],
            enableAutomaticPunctuation: true,
            model: "latest_short",
            useEnhanced: true,
        },
    };

    try {
        const [response] = await client.recognize(request);
        
        const billedTime = response.totalBilledTime || {};
        const seconds = parseInt(billedTime.seconds || 0) + (billedTime.nanos || 0) / 1e9;
        if (seconds > 0) {
            logAiUsage({
                provider: "google_stt",
                operation: "transcribeAudio",
                totalTokens: seconds
            });
        }

        return response.results
            .map((r) => r.alternatives[0].transcript)
            .join("\n");
    } catch (err) {
        console.error("❌ Google STT Error:", err);
        throw new Error("Failed to transcribe audio via Google Cloud STT");
    }
};

// Universal phrases that benefit from STT boosting across all interview roles.
const UNIVERSAL_INTERVIEW_PHRASES = [
    "KPI", "ROI", "SLA", "OKR", "B2B", "B2C", "P&L", "EBITDA",
    "stakeholders", "deliverables", "milestones", "onboarding",
    "cross-functional", "bandwidth", "scalable", "synergy",
    "CEO", "COO", "CFO", "CTO", "HR", "CRM", "ERP",
    "Agile", "Scrum", "Kanban", "Lean", "Six Sigma",
    "forecasting", "budgeting", "variance", "reconciliation",
    "dashboard", "analytics", "metrics",
    "funnel", "conversion rate", "churn", "NPS", "GTM", "USP",
    "campaign", "SEO", "SEM",
    "patient outcomes", "clinical", "EMR", "HIPAA", "triage",
    "GDPR", "compliance", "due diligence", "liability",
    "curriculum", "pedagogy", "assessment", "accreditation",
    "procurement", "logistics", "inventory", "vendor management",
];

/**
 * Streaming wrapper — compatible with the Deepgram live connection interface
 * so socket handlers work with either provider without changes.
 */
class GoogleStreamWrapper {
    constructor(stream) {
        this.stream = stream;
        this.handlers = {};
        this._isSpeaking = false;
        this._totalBytes = 0;

        process.nextTick(() => {
            this.handlers["open"]?.();
        });

        this.stream.on("data", (data) => {
            const results = data.results;
            if (!results || results.length === 0) return;

            const result = results[0];
            const transcript = result.alternatives?.[0]?.transcript || "";
            const isFinal = result.isFinal || false;

            if (transcript && !isFinal && !this._isSpeaking) {
                this._isSpeaking = true;
                this.handlers["speech_started"]?.();
            }
            if (isFinal) this._isSpeaking = false;
            if (!transcript) return;

            this.handlers["transcript"]?.({
                channel: { alternatives: [{ transcript }] },
                is_final: isFinal,
            });
        });

        this.stream.on("error", (err) => this.handlers["error"]?.(err));
        this.stream.on("end", () => {
            const seconds = this._totalBytes / 32000;
            if (seconds > 0) {
                logAiUsage({
                    provider: "google_stt",
                    operation: "liveTranscription",
                    totalTokens: seconds
                });
            }
            this.handlers["close"]?.();
        });
    }

    on(event, handler) { this.handlers[event] = handler; }

    send(buffer) {
        if (!this.stream.destroyed && this.stream.writable) {
            this._totalBytes += buffer.length;
            this.stream.write(buffer);
        }
    }

    keepAlive() { /* Google doesn't need ping */ }
    finalize() { if (!this.stream.destroyed && this.stream.writable) this.stream.end(); }
    finish() { this.finalize(); }
    getReadyState() { return this.stream.destroyed ? 3 : 1; }
}

/**
 * Live streaming transcription — mirrors deepgramHelper.createLiveTranscriptionConnection
 * @param {string[]} [roleSpecificPhrases=[]]
 * @param {object}   [options={}]
 */
export const createLiveTranscriptionConnection = async (roleSpecificPhrases = [], options = {}) => {
    const client = getSttClient();

    const allPhrases = [
        ...new Set([...UNIVERSAL_INTERVIEW_PHRASES, ...roleSpecificPhrases]),
    ];

    const request = {
        config: {
            encoding: "LINEAR16",
            sampleRateHertz: 16000,
            languageCode: "en-US",
            model: "default",
            useEnhanced: true,
            enableAutomaticPunctuation: true,
            // We only ever read alternatives[0]; asking for one keeps the recognizer
            // from spending time ranking extra hypotheses (lower latency).
            maxAlternatives: 1,
            speechContexts: [{ phrases: allPhrases, boost: 10 }],
            ...options,
        },
        // interimResults streams partial words as soon as they're recognized so the
        // live transcript and silence/auto-submit logic react with minimal delay.
        interimResults: true,
        singleUtterance: false,
    };

    const recognizeStream = client.streamingRecognize(request);
    return new GoogleStreamWrapper(recognizeStream);
};


// =======================
// 🔊 Text-to-Speech (TTS)
// =======================

/**
 * Generates TTS audio and returns a raw Buffer.
 * Used by the interview controller — mirrors deepgramHelper.generateTTSBuffer
 */
export const generateTTSBuffer = async (text) => {
    try {
        const [response] = await getTtsClient().synthesizeSpeech({
            input: { text },
            voice: {
                languageCode: "en-IN",
                name: "en-IN-Standard-A",
            },
            audioConfig: {
                audioEncoding: "MP3",
                speakingRate: 1.05,
                sampleRateHertz: 22050,
            },
        });

        if (text && text.length > 0) {
            logAiUsage({
                provider: "google_tts",
                operation: "generateTTSBuffer",
                totalTokens: text.length
            });
        }

        return Buffer.from(response.audioContent);
    } catch (err) {
        console.error("Google TTS Error:", err.message);
        return null;
    }
};

/**
 * Generates TTS audio and returns a web ReadableStream.
 * Used by services.controller — mirrors deepgramHelper.generateTTS
 */
export const generateTTS = async (text) => {
    const buf = await generateTTSBuffer(text);
    if (!buf) throw new Error("Failed to generate speech via Google TTS");
    return new ReadableStream({
        start(controller) {
            controller.enqueue(new Uint8Array(buf));
            controller.close();
        },
    });
};


// =======================
// 📦 Export Helper
// =======================
const googleHelper = {
    transcribeAudio,
    createLiveTranscriptionConnection,
    generateTTS,
    generateTTSBuffer,
};

export default googleHelper;
