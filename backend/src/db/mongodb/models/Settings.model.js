import mongoose from "mongoose";

/**
 * Settings Model
 * Single-document configuration store for the payment verification system.
 * Uses a singleton pattern (findOne + upsert).
 */
const settingsSchema = new mongoose.Schema(
    {
        // WhatsApp group IDs to monitor (empty = monitor all groups)
        targetGroups: [{ type: String }],

        // How often to poll Gmail (in minutes)
        pollingInterval: { type: Number, default: 5, min: 1 },

        // Gmail search query string
        gmailQuery: {
            type: String,
            default: "subject:payment OR subject:UTR OR subject:transfer OR subject:credited",
        },

        // OCR provider: "gemini" | "tesseract"
        ocrProvider: {
            type: String,
            enum: ["gemini", "tesseract"],
            default: "gemini",
        },

        // Auto-verify on UTR match
        autoVerify: { type: Boolean, default: true },

        // Local path for saving WhatsApp images
        imagePath: { type: String, default: "uploads/whatsapp" },

        // Days to keep old images before cleanup
        retentionDays: { type: Number, default: 30, min: 1 },

        // Time window for date-based matching (±minutes)
        timeWindowMinutes: { type: Number, default: 15, min: 1 },
    },
    { timestamps: true }
);

const SettingsModel = mongoose.model("Settings", settingsSchema);

/**
 * Helper: get or create the singleton settings document
 */
export async function getSettings() {
    let settings = await SettingsModel.findOne().lean();
    if (!settings) {
        settings = await SettingsModel.create({});
        return settings.toObject ? settings.toObject() : settings;
    }
    return settings;
}

export default SettingsModel;
