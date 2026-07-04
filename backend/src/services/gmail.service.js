import { google } from "googleapis";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import EmailModel from "../db/mongodb/models/Email.model.js";
import logger from "../utils/logger.js";
import { extractUTR, extractAmount } from "../utils/utr.util.js";
import { getSettings } from "../db/mongodb/models/Settings.model.js";

/**
 * Gmail Service
 * Fetches unread payment emails via Gmail API (OAuth2),
 * extracts UTR/amount, and persists into MongoDB.
 */

/**
 * Build an authorized Gmail API client using stored OAuth tokens.
 * @param {{ accessToken: string, refreshToken: string }} tokens
 * @returns {import('googleapis').gmail_v1.Gmail}
 */
export function getGmailClient(tokens) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENt_KEY,
        process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_SECRET_KEY,
        process.env.GMAIL_REDIRECT_URI || `http://localhost:${process.env.PORT || 8002}/auth/google/callback`
    );

    oauth2Client.setCredentials({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
    });

    return google.gmail({ version: "v1", auth: oauth2Client });
}

/**
 * Build Gmail client using env-stored refresh token (for cron jobs).
 * @returns {import('googleapis').gmail_v1.Gmail|null}
 */
export function getGmailClientFromEnv() {
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
    if (!refreshToken) {
        logger.warn("[Gmail] GMAIL_REFRESH_TOKEN not set — Gmail polling disabled");
        return null;
    }
    return getGmailClient({
        accessToken: process.env.GMAIL_ACCESS_TOKEN || "",
        refreshToken,
    });
}

/**
 * Decode base64url encoded string (Gmail uses base64url).
 * @param {string} encoded
 * @returns {string}
 */
function decodeBase64(encoded) {
    if (!encoded) return "";
    return Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

/**
 * Recursively find the text/plain or text/html part of an email.
 * @param {object} payload
 * @param {string} mimeType
 * @returns {string}
 */
function extractBody(payload, mimeType = "text/plain") {
    if (!payload) return "";

    if (payload.mimeType === mimeType && payload.body?.data) {
        return decodeBase64(payload.body.data);
    }

    if (payload.parts) {
        for (const part of payload.parts) {
            const result = extractBody(part, mimeType);
            if (result) return result;
        }
    }
    return "";
}

/**
 * Parse a Gmail message object into a structured payment record.
 * @param {object} message - Full Gmail message
 * @returns {object}
 */
function parseGmailMessage(message) {
    const headers = message.payload?.headers || [];
    const getHeader = (name) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

    const subject = getHeader("Subject");
    const from = getHeader("From");
    const dateStr = getHeader("Date");

    // Parse sender name and email
    const senderMatch = from.match(/^(.*?)\s*<(.+?)>$/);
    const senderName = senderMatch ? senderMatch[1].trim().replace(/^"/, "").replace(/"$/, "") : from;
    const senderEmail = senderMatch ? senderMatch[2].trim() : from.trim();

    // Extract body text
    let body = extractBody(message.payload, "text/plain");
    if (!body) {
        body = extractBody(message.payload, "text/html");
        // Strip HTML tags for UTR extraction
        body = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }

    const snippet = message.snippet || "";
    const combinedText = `${subject} ${body} ${snippet}`;

    const utr = extractUTR(combinedText);
    const amount = extractAmount(combinedText);

    return {
        gmailMessageId: message.id,
        sender: senderName,
        senderEmail,
        subject,
        body: body.substring(0, 10000), // Cap at 10KB
        snippet: snippet.substring(0, 500),
        labels: message.labelIds || [],
        utr,
        amount,
        receivedAt: dateStr ? new Date(dateStr) : new Date(),
        isProcessed: false,
        status: "PENDING",
    };
}

/**
 * Fetch unread payment emails from Gmail and save to MongoDB.
 * @param {{ accessToken: string, refreshToken: string }|null} tokens - Pass null to use env tokens
 * @returns {Promise<{ fetched: number, saved: number, errors: number }>}
 */
export async function fetchUnreadPaymentEmails(tokens = null) {
    logger.info("[Gmail] Starting email fetch");

    const gmail = tokens ? getGmailClient(tokens) : getGmailClientFromEnv();
    if (!gmail) {
        logger.warn("[Gmail] No Gmail client available — skipping fetch");
        return { fetched: 0, saved: 0, errors: 0 };
    }

    const settings = await getSettings();
    const query = `is:unread (${settings.gmailQuery || "subject:payment OR subject:UTR"})`;

    let fetched = 0, saved = 0, errors = 0;

    try {
        // List matching messages
        const listRes = await gmail.users.messages.list({
            userId: "me",
            q: query,
            maxResults: 50,
        });

        const messages = listRes.data.messages || [];
        fetched = messages.length;
        logger.info(`[Gmail] Found ${fetched} unread payment emails`);

        for (const msg of messages) {
            try {
                // Check if already in DB
                const exists = await EmailModel.exists({ gmailMessageId: msg.id });
                if (exists) {
                    logger.debug(`[Gmail] Skipping already-stored message: ${msg.id}`);
                    continue;
                }

                // Fetch full message
                const fullMsg = await gmail.users.messages.get({
                    userId: "me",
                    id: msg.id,
                    format: "full",
                });

                const parsed = parseGmailMessage(fullMsg.data);

                await EmailModel.create(parsed);
                saved++;

                // Mark as read in Gmail
                await gmail.users.messages.modify({
                    userId: "me",
                    id: msg.id,
                    requestBody: { removeLabelIds: ["UNREAD"] },
                });

                logger.info(`[Gmail] Saved email: ${parsed.subject} | UTR: ${parsed.utr || "none"}`);
            } catch (innerErr) {
                errors++;
                logger.error(`[Gmail] Error processing message ${msg.id}: ${innerErr.message}`);
            }
        }
    } catch (err) {
        logger.error(`[Gmail] Fatal error during fetch: ${err.message}`, { stack: err.stack });
        throw err;
    }

    logger.info(`[Gmail] Fetch complete. Fetched: ${fetched}, Saved: ${saved}, Errors: ${errors}`);
    return { fetched, saved, errors };
}

/**
 * Get the Gmail OAuth2 authorization URL for initial setup.
 * @returns {string}
 */
export function getGmailAuthUrl() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENt_KEY,
        process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_SECRET_KEY,
        process.env.GMAIL_REDIRECT_URI || `http://localhost:${process.env.PORT || 8002}/auth/google/callback`
    );

    return oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: [
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/userinfo.email",
        ],
        prompt: "consent",
    });
}

/**
 * Exchange authorization code for tokens.
 * @param {string} code
 * @returns {Promise<object>} tokens
 */
export async function exchangeCodeForTokens(code) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENt_KEY,
        process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_SECRET_KEY,
        process.env.GMAIL_REDIRECT_URI || `http://localhost:${process.env.PORT || 8002}/auth/google/callback`
    );

    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
}

/**
 * Get user info from Google using an access token.
 * @param {string} accessToken
 * @returns {Promise<object>}
 */
export async function getGoogleUserInfo(accessToken) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    return data;
}

export default {
    getGmailClient,
    getGmailClientFromEnv,
    fetchUnreadPaymentEmails,
    getGmailAuthUrl,
    exchangeCodeForTokens,
    getGoogleUserInfo,
};
