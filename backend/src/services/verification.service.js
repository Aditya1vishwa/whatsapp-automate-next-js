import EmailModel from "../db/mongodb/models/Email.model.js";
import WhatsappModel from "../db/mongodb/models/Whatsapp.model.js";
import VerificationModel from "../db/mongodb/models/Verification.model.js";
import logger from "../utils/logger.js";
import { utrMatch, normalizeUTR } from "../utils/utr.util.js";
import { getSettings } from "../db/mongodb/models/Settings.model.js";
import { replyToMessage } from "./whatsapp.service.js";

/**
 * Verification Service
 * Core payment matching engine.
 * Compares WhatsApp UTRs with Gmail UTRs using a multi-factor confidence algorithm.
 */

// ─── Confidence Weights ────────────────────────────────────────────────────────
const CONFIDENCE_WEIGHTS = {
    utr: 70,      // Exact UTR match = 70 points
    amount: 15,   // Amount match = 15 points
    date: 10,     // Date within window = 10 points
    sender: 5,    // Sender match = 5 points
};

/**
 * Compare dates within a configurable time window.
 * @param {Date} date1
 * @param {Date} date2
 * @param {number} windowMinutes
 * @returns {boolean}
 */
function withinDateWindow(date1, date2, windowMinutes = 15) {
    if (!date1 || !date2) return false;
    const diff = Math.abs(new Date(date1) - new Date(date2));
    return diff <= windowMinutes * 60 * 1000;
}

/**
 * Calculate confidence score between a WhatsApp record and an Email record.
 * @param {object} wa - WhatsApp document
 * @param {object} email - Email document
 * @param {number} timeWindowMinutes - Configurable time window
 * @returns {{ confidence: number, matchedFields: string[] }}
 */
export function calculateConfidence(wa, email, timeWindowMinutes = 15) {
    let confidence = 0;
    const matchedFields = [];

    // Priority 1: Exact UTR match (highest weight)
    if (wa.utr && email.utr && utrMatch(wa.utr, email.utr)) {
        confidence += CONFIDENCE_WEIGHTS.utr;
        matchedFields.push("utr");
    }

    // Priority 2: Amount match
    if (wa.amount && email.amount && Math.abs(wa.amount - email.amount) < 0.01) {
        confidence += CONFIDENCE_WEIGHTS.amount;
        matchedFields.push("amount");
    }

    // Priority 3: Date within configurable window
    const waDate = wa.receivedAt || wa.createdAt;
    const emailDate = email.receivedAt;
    if (withinDateWindow(waDate, emailDate, timeWindowMinutes)) {
        confidence += CONFIDENCE_WEIGHTS.date;
        matchedFields.push("date");
    }

    // Priority 4: Sender phone/email match (loose)
    if (wa.senderNumber && email.senderEmail) {
        const phone = wa.senderNumber.replace(/\D/g, "");
        if (email.senderEmail.includes(phone) || email.body?.includes(phone)) {
            confidence += CONFIDENCE_WEIGHTS.sender;
            matchedFields.push("sender");
        }
    }

    return { confidence: Math.min(confidence, 100), matchedFields };
}

/**
 * Try to match a single WhatsApp record against all unmatched emails.
 * @param {string} whatsappId
 * @returns {Promise<object|null>} Verification document or null
 */
export async function matchSingleWhatsapp(whatsappId) {
    logger.info(`[Verification] Matching WhatsApp record: ${whatsappId}`);

    const wa = await WhatsappModel.findById(whatsappId).lean();
    if (!wa) {
        logger.warn(`[Verification] WhatsApp record not found: ${whatsappId}`);
        return null;
    }

    if (!wa.utr) {
        logger.info(`[Verification] No UTR in WhatsApp record ${whatsappId} — skipping match`);
        return null;
    }

    const settings = await getSettings();
    const timeWindow = settings.timeWindowMinutes || 15;

    // Find all unmatched emails with a UTR
    const emails = await EmailModel.find({
        utr: { $exists: true, $ne: null },
        matchedWhatsappId: null,
        status: { $ne: "VERIFIED" },
    }).lean();

    logger.info(`[Verification] Comparing against ${emails.length} unmatched emails`);

    let bestMatch = null;
    let bestConfidence = 0;
    let bestMatchedFields = [];

    for (const email of emails) {
        const { confidence, matchedFields } = calculateConfidence(wa, email, timeWindow);
        if (confidence > bestConfidence) {
            bestConfidence = confidence;
            bestMatch = email;
            bestMatchedFields = matchedFields;
        }
    }

    // Threshold: only auto-verify with confidence >= 70 (UTR must match)
    const threshold = settings.autoVerify ? 70 : 101; // 101 = never auto-verify

    if (!bestMatch || bestConfidence < 70) {
        logger.info(`[Verification] No match for WhatsApp ${whatsappId}. Best confidence: ${bestConfidence}%`);

        // Check if verification record already exists
        const existing = await VerificationModel.findOne({ whatsappId });
        if (!existing) {
            await VerificationModel.create({
                whatsappId,
                emailId: null,
                status: "PENDING",
                confidence: bestConfidence,
                matchedFields: bestMatchedFields,
                timeline: [{ action: "AUTO_MATCH_FAILED", at: new Date(), note: `Best confidence: ${bestConfidence}%` }],
            });
        }
        return null;
    }

    // We have a good match — create or update verification
    const status = bestConfidence >= threshold ? "VERIFIED" : "PENDING";
    const action = status === "VERIFIED" ? "AUTO_VERIFIED" : "AUTO_MATCHED";

    logger.info(`[Verification] ${action}! WhatsApp ${whatsappId} ↔ Email ${bestMatch._id}. Confidence: ${bestConfidence}%`);

    // Upsert verification record
    const verification = await VerificationModel.findOneAndUpdate(
        { whatsappId },
        {
            $set: {
                whatsappId,
                emailId: bestMatch._id,
                status,
                confidence: bestConfidence,
                matchedFields: bestMatchedFields,
                ...(status === "VERIFIED" ? { verifiedAt: new Date(), verifiedBy: "AUTO" } : {}),
            },
            $push: {
                timeline: {
                    action,
                    at: new Date(),
                    note: `Confidence: ${bestConfidence}%. Fields: ${bestMatchedFields.join(", ")}`,
                },
            },
        },
        { upsert: true, new: true }
    );

    // Update WhatsApp record
    await WhatsappModel.findByIdAndUpdate(whatsappId, {
        status,
        matchedEmailId: bestMatch._id,
    });

    // Update Email record
    await EmailModel.findByIdAndUpdate(bestMatch._id, {
        status,
        matchedWhatsappId: whatsappId,
        isProcessed: true,
    });

    // If auto-verified, send reply to WhatsApp
    if (status === "VERIFIED" && wa.groupId) {
        const amt = bestMatch.amount || wa.amount;
        const msg = `✅ *Payment Verified*\n\nUTR: ${wa.utr}\nAmount: ₹${amt ? amt.toLocaleString() : "Unknown"}\nMatched successfully.`;
        await replyToMessage(wa.groupId, wa.messageId, msg);
    }

    return verification;
}

/**
 * Run the full matching engine — processes all pending WhatsApp records.
 * Called by cron job.
 * @returns {Promise<{ processed: number, verified: number, failed: number }>}
 */
export async function matchPayments() {
    logger.info("[Verification] Running batch payment matching...");

    const pendingWA = await WhatsappModel.find({
        status: "PENDING",
        utr: { $exists: true, $ne: null },
        matchedEmailId: null,
    }).lean();

    logger.info(`[Verification] Found ${pendingWA.length} pending WhatsApp records to match`);

    let verified = 0, failed = 0;

    for (const wa of pendingWA) {
        try {
            const result = await matchSingleWhatsapp(wa._id.toString());
            if (result?.status === "VERIFIED") verified++;
            else failed++;
        } catch (err) {
            failed++;
            logger.error(`[Verification] Error matching ${wa._id}: ${err.message}`);
        }
    }

    logger.info(`[Verification] Batch complete. Verified: ${verified}, Unmatched: ${failed}`);
    return { processed: pendingWA.length, verified, failed };
}

/**
 * Manually verify a verification record (admin action).
 * @param {string} verificationId
 * @param {string} adminName - Name of admin performing the action
 * @param {string|null} emailId - Email to link if not already linked
 * @returns {Promise<object>}
 */
export async function verifyTransaction(verificationId, adminName = "Admin", emailId = null) {
    logger.info(`[Verification] Manual verify: ${verificationId} by ${adminName}`);

    const verification = await VerificationModel.findById(verificationId);
    if (!verification) throw new Error("Verification record not found");

    const updateData = {
        status: "VERIFIED",
        verifiedBy: adminName,
        verifiedAt: new Date(),
    };

    if (emailId && !verification.emailId) {
        updateData.emailId = emailId;
    }

    verification.set(updateData);
    verification.timeline.push({
        action: "MANUALLY_VERIFIED",
        by: adminName,
        at: new Date(),
        note: "Manually verified by admin",
    });
    await verification.save();

    // Update related documents
    await WhatsappModel.findByIdAndUpdate(verification.whatsappId, {
        status: "VERIFIED",
        matchedEmailId: verification.emailId,
    });

    if (verification.emailId) {
        await EmailModel.findByIdAndUpdate(verification.emailId, {
            status: "VERIFIED",
            matchedWhatsappId: verification.whatsappId,
            isProcessed: true,
        });
    }

    // Send WhatsApp reply for manual verification
    const wa = await WhatsappModel.findById(verification.whatsappId);
    if (wa && wa.groupId) {
        const msg = `✅ *Payment Verified*\n\nYour payment has been manually verified by ${adminName}.\nUTR: ${wa.utr || "N/A"}`;
        await replyToMessage(wa.groupId, wa.messageId, msg);
    }

    return verification;
}

/**
 * Manually unverify a verification record.
 * @param {string} verificationId
 * @param {string} adminName
 * @returns {Promise<object>}
 */
export async function unverifyTransaction(verificationId, adminName = "Admin") {
    logger.info(`[Verification] Manual unverify: ${verificationId} by ${adminName}`);

    const verification = await VerificationModel.findById(verificationId);
    if (!verification) throw new Error("Verification record not found");

    verification.set({ status: "UNVERIFIED" });
    verification.timeline.push({
        action: "MANUALLY_UNVERIFIED",
        by: adminName,
        at: new Date(),
        note: "Marked as unverified by admin",
    });
    await verification.save();

    // Update WhatsApp status
    await WhatsappModel.findByIdAndUpdate(verification.whatsappId, {
        status: "UNVERIFIED",
    });

    // Update Email status if linked
    if (verification.emailId) {
        await EmailModel.findByIdAndUpdate(verification.emailId, {
            status: "UNVERIFIED",
        });
    }

    return verification;
}

export default {
    matchSingleWhatsapp,
    matchPayments,
    verifyTransaction,
    unverifyTransaction,
    calculateConfidence,
};
