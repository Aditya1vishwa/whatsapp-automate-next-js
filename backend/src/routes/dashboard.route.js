import { Router } from "express";
import { getDashboardPage, getDashboardApi } from "../controllers/dashboard.controller.js";
import { isAuthenticated } from "../middlewares/session.auth.middleware.js";

const router = Router();

// Dashboard EJS view
router.get("/dashboard", isAuthenticated, getDashboardPage);

// Dashboard JSON API (for AJAX refresh)
router.get("/api/dashboard", isAuthenticated, getDashboardApi);

export default router;
