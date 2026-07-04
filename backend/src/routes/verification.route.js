import { Router } from "express";
import {
    getVerificationPage,
    getVerificationDetailsPage,
    getVerifications,
    verify,
    unverify,
    deleteVerification,
    triggerMatch,
} from "../controllers/verification.controller.js";
import { isAuthenticated } from "../middlewares/session.auth.middleware.js";

const router = Router();

// EJS views
router.get("/verification", isAuthenticated, getVerificationPage);
router.get("/verification/:id", isAuthenticated, getVerificationDetailsPage);

// JSON API
router.get("/api/verifications", isAuthenticated, getVerifications);
router.post("/api/verify/:id", isAuthenticated, verify);
router.post("/api/unverify/:id", isAuthenticated, unverify);
router.delete("/api/verification/:id", isAuthenticated, deleteVerification);
router.post("/api/verification/match", isAuthenticated, triggerMatch);

export default router;
