import SettingsModel, { getSettings } from "../db/mongodb/models/Settings.model.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import logger from "../utils/logger.js";

/**
 * Settings Controller
 * Manage system configuration: groups, polling interval, Gmail query, OCR, etc.
 */

/**
 * GET /settings — Render settings EJS view
 */
export const getSettingsPage = asyncHandler(async (req, res) => {
    const settings = await getSettings();
    res.render("settings", {
        title: "Settings",
        user: req.sessionUser,
        activePage: "settings",
        settings,
        saved: req.query.saved === "1",
    });
});

/**
 * GET /api/settings — JSON settings
 */
export const getSettingsApi = asyncHandler(async (req, res) => {
    const settings = await getSettings();
    res.json(new ApiResponse(200, settings, "Settings fetched"));
});

/**
 * POST /api/settings — Update settings
 */
export const updateSettings = asyncHandler(async (req, res) => {
    const {
        targetGroups,
        pollingInterval,
        gmailQuery,
        ocrProvider,
        autoVerify,
        imagePath,
        retentionDays,
        timeWindowMinutes,
    } = req.body;

    // Parse targetGroups from comma-separated string or array
    let parsedGroups = [];
    if (typeof targetGroups === "string") {
        parsedGroups = targetGroups
            .split(",")
            .map((g) => g.trim())
            .filter(Boolean);
    } else if (Array.isArray(targetGroups)) {
        parsedGroups = targetGroups.filter(Boolean);
    }

    const updateData = {
        ...(parsedGroups !== undefined && { targetGroups: parsedGroups }),
        ...(pollingInterval && { pollingInterval: parseInt(pollingInterval) }),
        ...(gmailQuery && { gmailQuery }),
        ...(ocrProvider && { ocrProvider }),
        ...(autoVerify !== undefined && { autoVerify: autoVerify === "true" || autoVerify === true }),
        ...(imagePath && { imagePath }),
        ...(retentionDays && { retentionDays: parseInt(retentionDays) }),
        ...(timeWindowMinutes && { timeWindowMinutes: parseInt(timeWindowMinutes) }),
    };

    let settings = await SettingsModel.findOne();
    if (settings) {
        Object.assign(settings, updateData);
        await settings.save();
    } else {
        settings = await SettingsModel.create(updateData);
    }

    logger.info(`[Settings] Updated by ${req.sessionUser?.email}`);

    // If called from form, redirect back with success param
    const acceptJson = req.headers.accept?.includes("application/json");
    if (acceptJson) {
        res.json(new ApiResponse(200, settings, "Settings updated"));
    } else {
        res.redirect("/settings?saved=1");
    }
});

export default { getSettingsPage, getSettingsApi, updateSettings };
