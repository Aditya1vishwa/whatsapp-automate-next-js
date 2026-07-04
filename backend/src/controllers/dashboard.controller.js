import EmailModel from "../db/mongodb/models/Email.model.js";
import WhatsappModel from "../db/mongodb/models/Whatsapp.model.js";
import VerificationModel from "../db/mongodb/models/Verification.model.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import logger from "../utils/logger.js";
import dayjs from "dayjs";

/**
 * Dashboard Controller
 * Computes stats and renders the main admin dashboard view.
 */

/**
 * Compute dashboard statistics.
 * @returns {Promise<object>}
 */
async function computeStats() {
    const today = dayjs().startOf("day").toDate();
    const thirtyDaysAgo = dayjs().subtract(30, "day").startOf("day").toDate();

    const [
        totalEmails,
        totalWhatsapp,
        verified,
        pending,
        unverified,
        todayEmails,
        todayWhatsapp,
        recentVerifications,
        last30DaysEmails,
        last30DaysWhatsapp,
    ] = await Promise.all([
        EmailModel.countDocuments(),
        WhatsappModel.countDocuments(),
        VerificationModel.countDocuments({ status: "VERIFIED" }),
        VerificationModel.countDocuments({ status: "PENDING" }),
        VerificationModel.countDocuments({ status: "UNVERIFIED" }),
        EmailModel.countDocuments({ receivedAt: { $gte: today } }),
        WhatsappModel.countDocuments({ createdAt: { $gte: today } }),
        VerificationModel.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .populate("whatsappId", "senderName groupName utr imagePath status receivedAt")
            .populate("emailId", "sender subject utr amount status receivedAt")
            .lean(),
        EmailModel.aggregate([
            { $match: { receivedAt: { $gte: thirtyDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$receivedAt" } },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]),
        WhatsappModel.aggregate([
            { $match: { createdAt: { $gte: thirtyDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]),
    ]);

    const totalVerifications = verified + pending + unverified;
    const successRate = totalVerifications > 0
        ? Math.round((verified / totalVerifications) * 100)
        : 0;

    // Build chart data for last 30 days
    const labels = [];
    const emailData = [];
    const waData = [];
    const emailMap = Object.fromEntries(last30DaysEmails.map((e) => [e._id, e.count]));
    const waMap = Object.fromEntries(last30DaysWhatsapp.map((e) => [e._id, e.count]));

    for (let i = 29; i >= 0; i--) {
        const dateKey = dayjs().subtract(i, "day").format("YYYY-MM-DD");
        labels.push(dayjs().subtract(i, "day").format("MMM DD"));
        emailData.push(emailMap[dateKey] || 0);
        waData.push(waMap[dateKey] || 0);
    }

    return {
        totalEmails,
        totalWhatsapp,
        verified,
        pending,
        unverified,
        todayEmails,
        todayWhatsapp,
        successRate,
        recentVerifications,
        chartData: { labels, emailData, waData },
    };
}

/**
 * GET /dashboard — Render dashboard EJS view
 */
export const getDashboardPage = asyncHandler(async (req, res) => {
    logger.info(`[Dashboard] Page requested by ${req.sessionUser?.email}`);
    const stats = await computeStats();
    res.render("dashboard", {
        title: "Dashboard",
        user: req.sessionUser,
        activePage: "dashboard",
        stats,
    });
});

/**
 * GET /api/dashboard — JSON stats for AJAX refresh
 */
export const getDashboardApi = asyncHandler(async (req, res) => {
    const stats = await computeStats();
    res.json(new ApiResponse(200, stats, "Dashboard stats fetched"));
});

export default { getDashboardPage, getDashboardApi };
