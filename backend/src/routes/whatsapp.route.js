import { Router } from "express";
import {
    getWhatsappPage,
    getWhatsappMessages,
    deleteWhatsapp,
    getWhatsappQR,
    getWhatsappStatus,
    getWhatsappGroups,
} from "../controllers/whatsapp.controller.js";
import { isAuthenticated } from "../middlewares/session.auth.middleware.js";

const router = Router();

// EJS view
router.get("/whatsapp", isAuthenticated, getWhatsappPage);
router.get("/admin/whatsapp-qr", isAuthenticated, getWhatsappQR);

// JSON API
router.get("/api/whatsapp", isAuthenticated, getWhatsappMessages);
router.get("/api/whatsapp/status", isAuthenticated, getWhatsappStatus);
router.get("/api/whatsapp/groups", isAuthenticated, getWhatsappGroups);
router.delete("/api/whatsapp/:id", isAuthenticated, deleteWhatsapp);

export default router;
