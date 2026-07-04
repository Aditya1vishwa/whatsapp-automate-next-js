import { Router } from "express";
import { getEmailsPage, getEmails, deleteEmail, triggerFetch } from "../controllers/gmail.controller.js";
import { isAuthenticated } from "../middlewares/session.auth.middleware.js";

const router = Router();

// EJS view
router.get("/emails", isAuthenticated, getEmailsPage);

// JSON API
router.get("/api/emails", isAuthenticated, getEmails);
router.delete("/api/email/:id", isAuthenticated, deleteEmail);
router.post("/api/emails/fetch", isAuthenticated, triggerFetch);

export default router;
