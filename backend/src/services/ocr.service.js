import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import logger from "../utils/logger.js";
import { extractUTR, extractAmount } from "../utils/utr.util.js";
import { getSettings } from "../db/mongodb/models/Settings.model.js";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'DUMMY_KEY_REPLACE_ME' });

/**
 * OCR Service
 * Extracts text from payment screenshot images using Gemini Vision.
 * Falls back to regex extraction of UTR and amount from the raw OCR text.
 */

/**
 * Extract text from an image using Gemini Vision.
 * @param {string} imagePath - Absolute path to the image file
 * @returns {Promise<{text: string, utr: string|null, amount: number|null}>}
 */
export async function extractTextFromImage(imagePath) {
    logger.info(`[OCR] Starting OCR for: ${imagePath}`);

    try {
        // Read image as base64
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = imageBuffer.toString("base64");

        // Determine MIME type from extension
        const ext = path.extname(imagePath).toLowerCase();
        const mimeMap = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".gif": "image/gif",
        };
        const mimeType = mimeMap[ext] || "image/jpeg";

        const model = genAI.getGenerativeModel
            ? genAI.getGenerativeModel({ model: "gemini-2.5-flash" })
            : null;

        // Use the new @google/genai API
        const response = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            inlineData: {
                                mimeType,
                                data: base64Image,
                            },
                        },
                        {
                            text: `You are a payment receipt OCR system. Extract ALL text from this payment screenshot exactly as it appears.
Pay special attention to:
- UTR number / Reference number / Transaction ID (usually 12 digits or alphanumeric)
- Amount paid (in INR/₹)
- Transaction date and time
- Sender and receiver details
- Bank name

Return ONLY the raw extracted text, preserving the layout as closely as possible. Do not add any commentary.`,
                        },
                    ],
                },
            ],
        });

        const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";

        logger.info(`[OCR] Finished OCR. Text length: ${text.length}`);

        const utr = extractUTR(text);
        const amount = extractAmount(text);

        if (utr) {
            logger.info(`[OCR] UTR found: ${utr}`);
        } else {
            logger.warn(`[OCR] No UTR found in OCR text`);
        }

        return { text, utr, amount };
    } catch (err) {
        logger.error(`[OCR] Error during OCR: ${err.message}`, { stack: err.stack });
        throw err;
    }
}

/**
 * Get the active OCR provider from settings.
 * @returns {Promise<string>}
 */
export async function getOCRProvider() {
    const settings = await getSettings();
    return settings.ocrProvider || "gemini";
}

export default { extractTextFromImage, getOCRProvider };
