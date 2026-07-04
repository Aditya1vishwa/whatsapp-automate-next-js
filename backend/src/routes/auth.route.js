import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import authController from "../controllers/auth.controller.js";

const authRouter = Router();

authRouter.post("/signup", authController.post.signup);
authRouter.post("/verify-email", authController.post.verifyEmail);
authRouter.post("/resend-otp", authController.post.resendOtp);
authRouter.post("/login", authController.post.login);
authRouter.post("/forgot-password", authController.post.forgotPassword);
authRouter.post("/reset-password", authController.post.resetPassword);
authRouter.post("/refresh-token", authController.post.refreshAccessToken);
authRouter.post("/seed-user", authController.post.seedDummyUser);

authRouter.get("/me", verifyJWT, authController.get.getMe);
authRouter.patch("/me", verifyJWT, authController.patch.updateMe);
authRouter.get("/logout", verifyJWT, authController.post.logout);
authRouter.post("/back-to-admin", verifyJWT, authController.post.backToAdmin);
authRouter.post("/change-password", verifyJWT, authController.post.changePassword);

export default authRouter;
