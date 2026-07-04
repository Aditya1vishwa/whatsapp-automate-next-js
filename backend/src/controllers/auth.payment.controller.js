import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";
import {
    getGmailAuthUrl,
    exchangeCodeForTokens,
    getGoogleUserInfo,
} from "../services/gmail.service.js";
import fs from "fs";
import path from "path";

/**
 * Payment Auth Controller
 * Handles Google OAuth2 login/logout for the admin dashboard.
 * Stores session data independently from the existing JWT auth system.
 */

/**
 * GET /login — Render login EJS view
 */
export const getLoginPage = asyncHandler(async (req, res) => {
    // If already authenticated, redirect to dashboard
    if (req.session?.user) {
        return res.redirect("/dashboard");
    }

    const error = req.query.error || null;
    res.render("login", {
        title: "Admin Login",
        error,
        user: null,
    });
});

/**
 * GET /auth/google — Redirect to Google OAuth
 */
export const googleOAuth = asyncHandler(async (req, res) => {
    logger.info("[Auth] Google OAuth initiated");
    const authUrl = getGmailAuthUrl();
    res.redirect(authUrl);
});

/**
 * GET /auth/google/callback — Handle Google OAuth callback
 * Exchanges code for tokens, fetches user info, creates session.
 */
export const googleCallback = asyncHandler(async (req, res) => {
    const { code, error } = req.query;

    if (error) {
        logger.error(`[Auth] Google OAuth error: ${error}`);
        return res.redirect(`/login?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
        return res.redirect("/login?error=No+authorization+code+received");
    }

    try {
        logger.info("[Auth] Exchanging code for tokens...");
        const tokens = await exchangeCodeForTokens(code);

        logger.info("[Auth] Fetching Google user info...");
        const userInfo = await getGoogleUserInfo(tokens.access_token);

        // Store user and tokens in session
        req.session.user = {
            id: userInfo.id,
            name: userInfo.name,
            email: userInfo.email,
            picture: userInfo.picture,
        };

        const finalRefreshToken = tokens.refresh_token || process.env.GMAIL_REFRESH_TOKEN || "";
        req.session.gmailTokens = {
            accessToken: tokens.access_token,
            refreshToken: finalRefreshToken,
        };

        // Automatically update .env with the new refresh token for cron jobs
        if (tokens.refresh_token) {
            process.env.GMAIL_REFRESH_TOKEN = tokens.refresh_token;
            try {
                const envPath = path.join(process.cwd(), ".env");
                if (fs.existsSync(envPath)) {
                    let envContent = fs.readFileSync(envPath, "utf-8");
                    if (envContent.includes("GMAIL_REFRESH_TOKEN=")) {
                        envContent = envContent.replace(/GMAIL_REFRESH_TOKEN=.*/g, `GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
                    } else {
                        envContent += `\nGMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`;
                    }
                    fs.writeFileSync(envPath, envContent);
                    logger.info("[Auth] Successfully saved GMAIL_REFRESH_TOKEN to .env");
                }
            } catch(e) {
                logger.error("[Auth] Failed to write refresh token to .env: " + e.message);
            }
        }

        logger.info(`[Auth] Login successful: ${userInfo.email}`);

        // Redirect to original URL or dashboard
        const returnTo = req.session.returnTo || "/dashboard";
        delete req.session.returnTo;

        return res.redirect(returnTo);
    } catch (err) {
        logger.error(`[Auth] OAuth callback error: ${err.message}`);
        return res.redirect(`/login?error=${encodeURIComponent("Authentication failed. Please try again.")}`);
    }
});

/**
 * GET /logout — Destroy session and redirect to login
 */
export const logout = asyncHandler(async (req, res) => {
    const email = req.session?.user?.email;
    req.session.destroy((err) => {
        if (err) {
            logger.error(`[Auth] Session destroy error: ${err.message}`);
        } else {
            logger.info(`[Auth] Logout: ${email}`);
        }
    });
    res.clearCookie("connect.sid");
    res.redirect("/login");
});

export default { getLoginPage, googleOAuth, googleCallback, logout };
