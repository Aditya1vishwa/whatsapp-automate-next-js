import { createRequire } from "module";
const require = createRequire(import.meta.url);

// whatsapp-web.js is a CommonJS module
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import logger from "../utils/logger.js";
import { extractTextFromImage } from "./ocr.service.js";
import { extractUTR, extractAmount } from "../utils/utr.util.js";
import WhatsappModel from "../db/mongodb/models/Whatsapp.model.js";
import { getSettings } from "../db/mongodb/models/Settings.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Singleton client instance
let whatsappClient = null;
let clientReady = false;
let currentQR = null; // Store last QR for web display

/**
 * Get the upload directory for WhatsApp images.
 * @returns {string}
 */
function getImageDir() {
    const uploadDir = path.join(__dirname, "..", "..", "uploads", "whatsapp");
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    return uploadDir;
}

/**
 * Initialize the WhatsApp Web client.
 * Emits QR code to console and triggers message processing on receipt.
 */
export function initWhatsApp() {
    if (whatsappClient) {
        logger.info("[WhatsApp] Client already initialized");
        return whatsappClient;
    }

    logger.info("[WhatsApp] Initializing WhatsApp Web client...");

    whatsappClient = new Client({
        authStrategy: new LocalAuth({
            dataPath: path.join(__dirname, "..", "..", ".wwebjs_auth"),
        }),
        puppeteer: {
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--no-zygote",
                "--single-process",
                "--disable-gpu",
            ],
        },
    });

    // QR Code event — print to terminal and store for web display
    whatsappClient.on("qr", (qr) => {
        currentQR = qr;
        logger.info("[WhatsApp] QR Code received. Scan with your phone:");
        qrcode.generate(qr, { small: true });
        logger.info("[WhatsApp] Or visit /admin/whatsapp-qr to scan via browser");
    });

    // Ready event
    whatsappClient.on("ready", () => {
        clientReady = true;
        currentQR = null;
        logger.info("[WhatsApp] Client is ready!");
    });

    // Auth failure
    whatsappClient.on("auth_failure", (msg) => {
        clientReady = false;
        logger.error(`[WhatsApp] Authentication failed: ${msg}`);
    });

    // Disconnected
    whatsappClient.on("disconnected", (reason) => {
        clientReady = false;
        logger.warn(`[WhatsApp] Client disconnected: ${reason}`);
    });

    // Message event — only process messages with images
    whatsappClient.on("message", async (message) => {
        try {
            await handleIncomingMessage(message);
        } catch (err) {
            logger.error(`[WhatsApp] Error handling message: ${err.message}`);
        }
    });

    whatsappClient.initialize().catch(err => {
        logger.error(`[WhatsApp] Fatal error during initialization: ${err.stack || err.message}`);
    });
    return whatsappClient;
}

/**
 * Handle an incoming WhatsApp message.
 * Downloads image, runs OCR, extracts UTR, saves to MongoDB.
 * @param {object} message - whatsapp-web.js message object
 */
async function handleIncomingMessage(message) {
    // Only process messages with media (images)
    if (!message.hasMedia) {
        logger.debug(`[WhatsApp] Skipping non-media message from ${message.from}`);
        return;
    }

    // Check media type
    const mediaType = message.type;
    if (!["image", "sticker"].includes(mediaType)) {
        logger.debug(`[WhatsApp] Skipping non-image media type: ${mediaType}`);
        return;
    }

    const settings = await getSettings();

    // Check if group is in the target list (if configured)
    let groupName = "Direct";
    let groupId = message.from;

    if (message.from.endsWith("@g.us")) {
        // It's a group message
        try {
            const chat = await message.getChat();
            groupName = chat.name;
            groupId = message.from;
        } catch {
            groupName = "Unknown Group";
        }

    // Filter: ONLY process messages if their groupId is explicitly in the targetGroups list.
    if (!settings.targetGroups || settings.targetGroups.length === 0) {
        logger.debug(`[WhatsApp] Skipping message because no target groups are configured in settings.`);
        return;
    }

    if (!settings.targetGroups.includes(groupId)) {
        logger.debug(`[WhatsApp] Skipping message from non-target group/chat: ${groupId}`);
        return;
    }
    }

    logger.info(`[WhatsApp] Processing image from ${groupName} (${message.from})`);

    // Get sender info
    let senderName = "Unknown";
    let senderNumber = message.author || message.from;

    try {
        const contact = await message.getContact();
        senderName = contact.pushname || contact.name || senderNumber;
        senderNumber = contact.number || senderNumber;
    } catch {
        // Keep defaults
    }

    // Download media
    let imagePath = null;
    let ocrText = null;
    let utr = null;
    let amount = null;

    try {
        const media = await message.downloadMedia();
        if (!media) {
            logger.warn("[WhatsApp] Failed to download media");
            return;
        }

        // Save image to disk
        const imageDir = getImageDir();
        const ext = media.mimetype.split("/")[1]?.split(";")[0] || "jpg";
        const filename = `wa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
        imagePath = path.join(imageDir, filename);

        const buffer = Buffer.from(media.data, "base64");
        fs.writeFileSync(imagePath, buffer);

        logger.info(`[WhatsApp] Image saved: ${imagePath}`);

        // Run OCR
        logger.info(`[WhatsApp] Running OCR on: ${filename}`);
        const ocrResult = await extractTextFromImage(imagePath);
        ocrText = ocrResult.text;
        utr = ocrResult.utr;
        amount = ocrResult.amount;

        logger.info(`[WhatsApp] OCR done. UTR: ${utr || "not found"}, Amount: ${amount || "not found"}`);
    } catch (mediaErr) {
        logger.error(`[WhatsApp] Media processing error: ${mediaErr.message}`);
    }

    // Save to MongoDB
    try {
        const imageUrl = imagePath
            ? `${process.env.UPLOAD_BASE_URL || ""}/whatsapp/${path.basename(imagePath)}`
            : null;

        // Check for duplicate (same messageId)
        const messageId = message.id?._serialized || message.id?.id || null;
        if (messageId) {
            const existing = await WhatsappModel.findOne({ messageId });
            if (existing) {
                logger.debug(`[WhatsApp] Duplicate message skipped: ${messageId}`);
                return;
            }
        }

        const record = await WhatsappModel.create({
            groupName,
            groupId,
            senderName,
            senderNumber,
            caption: message.body || "",
            messageId,
            imagePath,
            imageUrl,
            ocrText,
            utr,
            amount,
            status: "PENDING",
            receivedAt: new Date(),
        });

        logger.info(`[WhatsApp] Saved record: ${record._id} | UTR: ${utr || "none"}`);

        // Trigger auto-matching if UTR was found
        if (utr && settings.autoVerify) {
            // Lazy import to avoid circular dependency
            const { matchSingleWhatsapp } = await import("./verification.service.js");
            await matchSingleWhatsapp(record._id.toString());
        }
    } catch (dbErr) {
        logger.error(`[WhatsApp] DB save error: ${dbErr.message}`);
    }
}

/**
 * Check if the WhatsApp client is ready.
 * @returns {boolean}
 */
export function isClientReady() {
    return clientReady;
}

/**
 * Get the current QR code string (for web display).
 * @returns {string|null}
 */
export function getCurrentQR() {
    return currentQR;
}

/**
 * Get the WhatsApp client instance.
 * @returns {object|null}
 */
export function getClient() {
    return whatsappClient;
}

/**
 * Send a text reply to a specific WhatsApp message.
 * @param {string} chatId - The ID of the chat/group (e.g. from WhatsappModel.groupId)
 * @param {string} quotedMessageId - The _serialized ID of the message to reply to (WhatsappModel.messageId)
 * @param {string} text - The text to send
 */
export async function replyToMessage(chatId, quotedMessageId, text) {
    if (!whatsappClient) {
        logger.warn("[WhatsApp] Client not initialized. Cannot send reply.");
        return false;
    }
    
    try {
        const options = quotedMessageId ? { quotedMessageId } : {};
        await whatsappClient.sendMessage(chatId, text, options);
        logger.info(`[WhatsApp] Sent reply to ${chatId}`);
        return true;
    } catch (err) {
        logger.error(`[WhatsApp] Error sending reply: ${err.message}`);
        return false;
    }
}

export default {
    initialize: initWhatsApp,
    getClient,
    isClientReady,
    getCurrentQR,
    replyToMessage,
};
