import { createRequire } from "module";
const require = createRequire(import.meta.url);
const cron = require("node-cron");

import logger from "../utils/logger.js";
import { fetchUnreadPaymentEmails } from "../services/gmail.service.js";
import { matchPayments } from "../services/verification.service.js";
import { getSettings } from "../db/mongodb/models/Settings.model.js";
import WhatsappModel from "../db/mongodb/models/Whatsapp.model.js";
import fs from "fs";
import path from "path";
import dayjs from "dayjs";

/**
 * Payment Cron Jobs
 * Registers all scheduled tasks for the payment verification system.
 */

let gmailCronJob = null;
let matchingCronJob = null;

/**
 * Start all payment cron jobs.
 * Call once after DB connection is established.
 */
export function startPaymentCronJobs() {
    logger.info("[Cron] Starting payment cron jobs...");

    // ─── Gmail Polling Cron ────────────────────────────────────────────────────
    // Runs every N minutes (configurable, default 5)
    // Schedule is dynamic — restarts when settings change
    scheduleGmailPolling();

    // ─── Payment Matching Cron ─────────────────────────────────────────────────
    // Run matching engine every 10 minutes (slightly offset from email fetch)
    const runMatching = async () => {
        logger.info("[Cron] Running payment matching engine...");
        try {
            const result = await matchPayments();
            logger.info(`[Cron] Matching done: ${JSON.stringify(result)}`);
        } catch (err) {
            logger.error(`[Cron] Matching error: ${err.message}`);
        }
    };

    matchingCronJob = cron.schedule("*/10 * * * *", runMatching);
    
    // Run immediately on boot
    setTimeout(runMatching, 5000); // 5 second delay to let Gmail fetch finish first

    // ─── Old Image Cleanup Cron ────────────────────────────────────────────────
    // Runs daily at midnight
    cron.schedule("0 0 * * *", async () => {
        logger.info("[Cron] Running old image cleanup...");
        try {
            await cleanupOldImages();
        } catch (err) {
            logger.error(`[Cron] Cleanup error: ${err.message}`);
        }
    });

    // ─── Retry Pending Verifications ──────────────────────────────────────────
    // Runs every 30 minutes — retries WhatsApp records that still have no UTR match
    cron.schedule("*/30 * * * *", async () => {
        logger.info("[Cron] Retrying pending verifications...");
        try {
            const result = await matchPayments();
            logger.info(`[Cron] Retry complete: ${JSON.stringify(result)}`);
        } catch (err) {
            logger.error(`[Cron] Retry error: ${err.message}`);
        }
    });

    logger.info("[Cron] All payment cron jobs registered");
}

/**
 * Schedule Gmail polling with the interval from settings.
 */
async function scheduleGmailPolling() {
    try {
        const settings = await getSettings();
        const intervalMinutes = Math.max(1, settings.pollingInterval || 5);

        // Stop existing job if running
        if (gmailCronJob) {
            gmailCronJob.stop();
        }

        // Cron expression: every N minutes
        const cronExpr = `*/${intervalMinutes} * * * *`;
        logger.info(`[Cron] Gmail polling every ${intervalMinutes} minutes (${cronExpr})`);

        const runGmailFetch = async () => {
            logger.info("[Cron] Gmail polling tick...");
            try {
                const result = await fetchUnreadPaymentEmails(null);
                logger.info(`[Cron] Gmail fetch done: ${JSON.stringify(result)}`);
            } catch (err) {
                logger.error(`[Cron] Gmail fetch error: ${err.message}`);
            }
        };

        gmailCronJob = cron.schedule(cronExpr, runGmailFetch);

        // Run immediately on boot
        runGmailFetch();
    } catch (err) {
        logger.error(`[Cron] Failed to schedule Gmail polling: ${err.message}`);
    }
}

/**
 * Delete old WhatsApp images based on retention setting.
 */
async function cleanupOldImages() {
    const settings = await getSettings();
    const retentionDays = settings.retentionDays || 30;
    const cutoffDate = dayjs().subtract(retentionDays, "day").toDate();

    // Find old records with images
    const oldRecords = await WhatsappModel.find({
        createdAt: { $lt: cutoffDate },
        imagePath: { $exists: true, $ne: null },
    }).lean();

    let deleted = 0;
    let errors = 0;

    for (const record of oldRecords) {
        try {
            if (record.imagePath && fs.existsSync(record.imagePath)) {
                fs.unlinkSync(record.imagePath);
                deleted++;
                logger.debug(`[Cron] Deleted old image: ${record.imagePath}`);
            }
            // Clear the imagePath in DB
            await WhatsappModel.findByIdAndUpdate(record._id, {
                imagePath: null,
                imageUrl: null,
            });
        } catch (err) {
            errors++;
            logger.error(`[Cron] Failed to delete image ${record.imagePath}: ${err.message}`);
        }
    }

    logger.info(`[Cron] Image cleanup: ${deleted} deleted, ${errors} errors (cutoff: ${cutoffDate.toISOString()})`);
}

/**
 * Restart Gmail polling cron with updated interval (call when settings change).
 */
export async function restartGmailPolling() {
    await scheduleGmailPolling();
}

export default { startPaymentCronJobs, restartGmailPolling };
