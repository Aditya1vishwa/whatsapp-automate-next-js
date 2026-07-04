import { Router } from "express";
import { getLoginPage, googleOAuth, googleCallback, logout } from "../controllers/auth.payment.controller.js";
import { redirectIfAuthenticated } from "../middlewares/session.auth.middleware.js";

const router = Router();

// Show login page (redirect to dashboard if already logged in)
router.get("/login", redirectIfAuthenticated, getLoginPage);

// Initiate Google OAuth flow
router.get("/auth/google", googleOAuth);

// Handle Google OAuth callback
router.get("/auth/google/callback", googleCallback);

// Logout
router.get("/logout", logout);

export default router;
