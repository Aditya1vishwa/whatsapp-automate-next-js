import { Router } from "express";
import { getSettingsPage, getSettingsApi, updateSettings } from "../controllers/settings.controller.js";
import { isAuthenticated } from "../middlewares/session.auth.middleware.js";

const router = Router();

// EJS view
router.get("/settings", isAuthenticated, getSettingsPage);

// JSON API
router.get("/api/settings", isAuthenticated, getSettingsApi);
router.post("/api/settings", isAuthenticated, updateSettings);

export default router;
