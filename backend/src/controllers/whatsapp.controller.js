import WhatsappModel from "../db/mongodb/models/Whatsapp.model.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import logger from "../utils/logger.js";
import { isClientReady, getCurrentQR } from "../services/whatsapp.service.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const QRCode = require("qrcode");

/**
 * WhatsApp Controller
 * Handles WhatsApp message listing, deletion, QR display, and EJS view rendering.
 */

/**
 * GET /whatsapp — Render WhatsApp messages EJS view
 */
export const getWhatsappPage = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const filter = buildWhatsappFilter(req.query);

    const [messages, total] = await Promise.all([
        WhatsappModel.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("matchedEmailId", "sender subject utr amount")
            .lean(),
        WhatsappModel.countDocuments(filter),
    ]);

    res.render("whatsapp", {
        title: "WhatsApp Messages",
        user: req.sessionUser,
        activePage: "whatsapp",
        messages,
        clientReady: isClientReady(),
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
 * GET /api/whatsapp — JSON paginated WhatsApp message list
 */
export const getWhatsappMessages = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = buildWhatsappFilter(req.query);

    const [messages, total] = await Promise.all([
        WhatsappModel.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("matchedEmailId", "sender subject utr amount")
            .lean(),
        WhatsappModel.countDocuments(filter),
    ]);

    res.json(new ApiResponse(200, { messages, total, page, limit }, "WhatsApp messages fetched"));
});

/**
 * DELETE /api/whatsapp/:id — Delete a WhatsApp record
 */
export const deleteWhatsapp = asyncHandler(async (req, res) => {
    const msg = await WhatsappModel.findByIdAndDelete(req.params.id);
    if (!msg) throw new ApiError(404, "WhatsApp record not found");

    logger.info(`[WhatsApp] Record deleted: ${req.params.id}`);
    res.json(new ApiResponse(200, null, "WhatsApp record deleted"));
});

/**
 * GET /admin/whatsapp-qr — Show QR code as web page
 */
export const getWhatsappQR = asyncHandler(async (req, res) => {
    const qrData = getCurrentQR();
    let qrImageUrl = null;

    if (qrData) {
        try {
            qrImageUrl = await QRCode.toDataURL(qrData, { width: 300, margin: 2 });
        } catch {
            qrImageUrl = null;
        }
    }

    res.render("whatsapp-qr", {
        title: "WhatsApp QR Code",
        user: req.sessionUser,
        activePage: "whatsapp",
        clientReady: isClientReady(),
        qrImageUrl,
        hasQR: !!qrData,
    });
});

/**
 * GET /api/whatsapp/status — Client status JSON
 */
export const getWhatsappStatus = asyncHandler(async (req, res) => {
    const qrData = getCurrentQR();
    let qrImageUrl = null;
    if (qrData) {
        try {
            qrImageUrl = await QRCode.toDataURL(qrData, { width: 300, margin: 2 });
        } catch {
            qrImageUrl = null;
        }
    }
    res.json(
        new ApiResponse(200, {
            ready: isClientReady(),
            hasQR: !!qrData,
            qrImageUrl,
        }, "WhatsApp status")
    );
});

/**
 * GET /api/whatsapp/groups — Get list of all WhatsApp groups
 */
export const getWhatsappGroups = asyncHandler(async (req, res) => {
    if (!isClientReady()) {
        throw new ApiError(400, "WhatsApp client is not ready. Please scan the QR code first.");
    }
    
    const client = require("../services/whatsapp.service.js").getClient();
    if (!client) throw new ApiError(500, "WhatsApp client instance not found.");

    const chats = await client.getChats();
    const groups = chats
        .filter(chat => chat.isGroup)
        .map(group => ({
            id: group.id._serialized,
            name: group.name,
            participants: group.participants.length
        }));

    res.json(new ApiResponse(200, { groups }, "WhatsApp groups fetched successfully"));
});

/**
 * Build MongoDB filter from query params.
 * @param {object} query
 * @returns {object}
 */
function buildWhatsappFilter(query) {
    const filter = {};

    if (query.status) filter.status = query.status.toUpperCase();
    if (query.utr) filter.utr = { $regex: query.utr, $options: "i" };
    if (query.group) filter.groupName = { $regex: query.group, $options: "i" };
    if (query.sender) filter.senderName = { $regex: query.sender, $options: "i" };
    if (query.phone) filter.senderNumber = { $regex: query.phone, $options: "i" };
    if (query.amount) filter.amount = parseFloat(query.amount);

    if (query.from || query.to) {
        filter.createdAt = {};
        if (query.from) filter.createdAt.$gte = new Date(query.from);
        if (query.to) filter.createdAt.$lte = new Date(query.to);
    }

    return filter;
}

export default {
    getWhatsappPage,
    getWhatsappMessages,
    deleteWhatsapp,
    getWhatsappQR,
    getWhatsappStatus,
    getWhatsappGroups,
};
