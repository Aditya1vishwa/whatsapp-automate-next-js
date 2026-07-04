import VerificationModel from "../db/mongodb/models/Verification.model.js";
import WhatsappModel from "../db/mongodb/models/Whatsapp.model.js";
import EmailModel from "../db/mongodb/models/Email.model.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import logger from "../utils/logger.js";
import { matchPayments } from "../services/verification.service.js";
import {
    verifyTransaction,
    unverifyTransaction,
} from "../services/verification.service.js";

/**
 * Verification Controller
 * Handles the main verification table, detail pages, and manual verify/unverify actions.
 */

/**
 * GET /verification — Render verification table EJS view
 */
export const getVerificationPage = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const filter = buildVerificationFilter(req.query);

    const [verifications, total, unmatched] = await Promise.all([
        VerificationModel.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("whatsappId", "senderName senderNumber groupName utr imagePath imageUrl amount status receivedAt caption")
            .populate("emailId", "sender senderEmail subject utr amount status receivedAt body")
            .lean(),
        VerificationModel.countDocuments(filter),
        // Unmatched WhatsApp records (no verification record yet)
        WhatsappModel.countDocuments({ status: "PENDING", matchedEmailId: null }),
    ]);

    // Available emails for manual linking (unmatched)
    const availableEmails = await EmailModel.find({
        matchedWhatsappId: null,
        status: { $ne: "VERIFIED" },
    })
        .select("_id sender subject utr amount receivedAt")
        .sort({ receivedAt: -1 })
        .limit(100)
        .lean();

    res.render("verification", {
        title: "Verifications",
        user: req.sessionUser,
        activePage: "verification",
        verifications,
        availableEmails,
        unmatched,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
        filters: req.query,
    });
});

/**
 * GET /verification/:id — Render verification detail EJS view
 */
export const getVerificationDetailsPage = asyncHandler(async (req, res) => {
    const verification = await VerificationModel.findById(req.params.id)
        .populate("whatsappId")
        .populate("emailId")
        .lean();

    if (!verification) throw new ApiError(404, "Verification record not found");

    res.render("verification-details", {
        title: "Verification Details",
        user: req.sessionUser,
        activePage: "verification",
        verification,
    });
});

/**
 * GET /api/verifications — JSON paginated verification list
 */
export const getVerifications = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = buildVerificationFilter(req.query);

    const [verifications, total] = await Promise.all([
        VerificationModel.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("whatsappId", "senderName groupName utr imagePath status")
            .populate("emailId", "sender subject utr amount status")
            .lean(),
        VerificationModel.countDocuments(filter),
    ]);

    res.json(new ApiResponse(200, { verifications, total, page, limit }, "Verifications fetched"));
});

/**
 * POST /api/verify/:id — Manually verify a verification record
 */
export const verify = asyncHandler(async (req, res) => {
    const { emailId, notes } = req.body;
    const adminName = req.sessionUser?.name || req.sessionUser?.email || "Admin";

    logger.info(`[Verification] Manual verify: ${req.params.id} by ${adminName}`);

    const verification = await verifyTransaction(req.params.id, adminName, emailId || null);

    if (notes) {
        verification.notes = notes;
        await verification.save?.();
    }

    res.json(new ApiResponse(200, verification, "Transaction verified successfully"));
});

/**
 * POST /api/unverify/:id — Mark a verification as unverified
 */
export const unverify = asyncHandler(async (req, res) => {
    const adminName = req.sessionUser?.name || req.sessionUser?.email || "Admin";

    logger.info(`[Verification] Manual unverify: ${req.params.id} by ${adminName}`);

    const verification = await unverifyTransaction(req.params.id, adminName);

    res.json(new ApiResponse(200, verification, "Transaction marked as unverified"));
});

/**
 * DELETE /api/verification/:id — Delete verification record
 */
export const deleteVerification = asyncHandler(async (req, res) => {
    const verification = await VerificationModel.findByIdAndDelete(req.params.id);
    if (!verification) throw new ApiError(404, "Verification record not found");

    logger.info(`[Verification] Record deleted: ${req.params.id}`);
    res.json(new ApiResponse(200, null, "Verification deleted"));
});

/**
 * POST /api/verification/match — Manually trigger the matching engine
 */
export const triggerMatch = asyncHandler(async (req, res) => {
    logger.info("[Verification] Manual matching triggered");
    const result = await matchPayments();
    res.json(new ApiResponse(200, result, "Matching engine completed"));
});

/**
 * Build MongoDB filter from query params.
 * @param {object} query
 * @returns {object}
 */
function buildVerificationFilter(query) {
    const filter = {};

    if (query.status) filter.status = query.status.toUpperCase();
    if (query.from || query.to) {
        filter.createdAt = {};
        if (query.from) filter.createdAt.$gte = new Date(query.from);
        if (query.to) filter.createdAt.$lte = new Date(query.to);
    }

    return filter;
}

export default {
    getVerificationPage,
    getVerificationDetailsPage,
    getVerifications,
    verify,
    unverify,
    deleteVerification,
    triggerMatch,
};
