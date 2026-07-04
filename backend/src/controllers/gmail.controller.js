import EmailModel from "../db/mongodb/models/Email.model.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import logger from "../utils/logger.js";
import { fetchUnreadPaymentEmails } from "../services/gmail.service.js";

/**
 * Gmail Controller
 * Handles email listing, deletion, manual Gmail fetch, and EJS view rendering.
 */

/**
 * GET /emails — Render emails EJS view
 */
export const getEmailsPage = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const filter = buildEmailFilter(req.query);

    const [emails, total] = await Promise.all([
        EmailModel.find(filter)
            .sort({ receivedAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("matchedWhatsappId", "senderName groupName utr")
            .lean(),
        EmailModel.countDocuments(filter),
    ]);

    res.render("emails", {
        title: "Emails",
        user: req.sessionUser,
        activePage: "emails",
        emails,
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
 * GET /api/emails — JSON paginated email list
 */
export const getEmails = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = buildEmailFilter(req.query);

    const [emails, total] = await Promise.all([
        EmailModel.find(filter)
            .sort({ receivedAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("matchedWhatsappId", "senderName groupName utr")
            .lean(),
        EmailModel.countDocuments(filter),
    ]);

    res.json(
        new ApiResponse(200, { emails, total, page, limit }, "Emails fetched")
    );
});

/**
 * DELETE /api/email/:id — Delete an email record
 */
export const deleteEmail = asyncHandler(async (req, res) => {
    const email = await EmailModel.findByIdAndDelete(req.params.id);
    if (!email) throw new ApiError(404, "Email not found");

    logger.info(`[Gmail] Email deleted: ${req.params.id}`);
    res.json(new ApiResponse(200, null, "Email deleted"));
});

/**
 * POST /api/emails/fetch — Manually trigger Gmail fetch
 */
export const triggerFetch = asyncHandler(async (req, res) => {
    logger.info("[Gmail] Manual fetch triggered");

    // Use session tokens if available, otherwise fall back to env tokens
    const tokens = req.session?.gmailTokens || null;
    const result = await fetchUnreadPaymentEmails(tokens);

    res.json(new ApiResponse(200, result, "Gmail fetch complete"));
});

/**
 * Build MongoDB filter object from query params.
 * @param {object} query
 * @returns {object}
 */
function buildEmailFilter(query) {
    const filter = {};

    if (query.status) filter.status = query.status.toUpperCase();
    if (query.utr) filter.utr = { $regex: query.utr, $options: "i" };
    if (query.sender) filter.senderEmail = { $regex: query.sender, $options: "i" };
    if (query.subject) filter.subject = { $regex: query.subject, $options: "i" };
    if (query.amount) filter.amount = parseFloat(query.amount);

    if (query.from || query.to) {
        filter.receivedAt = {};
        if (query.from) filter.receivedAt.$gte = new Date(query.from);
        if (query.to) filter.receivedAt.$lte = new Date(query.to);
    }

    return filter;
}

export default { getEmailsPage, getEmails, deleteEmail, triggerFetch };
