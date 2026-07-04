import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import UserModel from "../db/mongodb/models/user.model.js";
import WorkspaceModel from "../db/mongodb/models/Workspace.model.js";


// ─── Verify JWT (access token) ────────────────────────────────────────────────

export const verifyJWT = asyncHandler(async (req, _res, next) => {
    const token =
        req.cookies?.accessToken ||
        req.header("Authorization")?.replace("Bearer ", "");
    if (!token) {
        throw new ApiError(401, "Unauthorized request");
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    } catch {
        throw new ApiError(401, "Invalid or expired access token");
    }
    const user = await UserModel.findById(decoded._id).select(
        "-password -refreshToken -forgetPasswordToken"
    );
    if (!user) {
        throw new ApiError(401, "User not found");
    }
    if (user.status !== "active") {
        throw new ApiError(403, "Your account is inactive or suspended");
    }
    req.user = user;
    if (user.role === "admin") return next();
    const currentWorkspace = await WorkspaceModel.findById(decoded.currentWorkspaceId)?.select("_id").lean()
    if (currentWorkspace) {
        req.currentWorkspace = currentWorkspace;
    }
    next();
});

export const verifyJWTOptional = asyncHandler(async (req, _res, next) => {
    const token =
        req.cookies?.accessToken ||
        req.header("Authorization")?.replace("Bearer ", "");
    if (!token) {
        // For optional JWT, just continue without setting req.user
        return next();
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    } catch {
        // Invalid token, but since it's optional, continue without user
        return next();
    }
    const user = await UserModel.findById(decoded._id).select(
        "-password -refreshToken -forgetPasswordToken"
    );
    if (!user || user.status !== "active") {
        // User not found or inactive, but since it's optional, continue without user
        return next();
    }
    req.user = user;
    if (user.role === "admin") return next();
    const currentWorkspace = await WorkspaceModel.findById(decoded.currentWorkspaceId)?.select("_id").lean()
    if (currentWorkspace) {
        req.currentWorkspace = currentWorkspace;
    }
    next();
});

// ─── Verify Admin ────────────────────────────────────────────────────────────

export const verifyAdmin = asyncHandler(async (req, _res, next) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }
    if (req.user.role !== "admin") {
        throw new ApiError(403, "Access denied. Admin privileges required.");
    }
    next();
});

// ─── Verify Recruiter ─────────────────────────────────────────────────────────

export const verifyRecruiter = asyncHandler(async (req, _res, next) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request");
    }
    if (req.user.userType !== "recruiter" && req.user.role !== "admin") {
        throw new ApiError(403, "Access denied. Recruiter privileges required.");
    }
    next();
});

// ─── Optional JWT (for public routes that benefit from auth if present) ───────

export const optionalJWT = asyncHandler(async (req, _res, next) => {
    const token =
        req.cookies?.accessToken ||
        req.header("Authorization")?.replace("Bearer ", "");
    if (!token) return next();
    try {
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const user = await UserModel.findById(decoded._id).select(
            "-password -refreshToken -forgetPasswordToken"
        );
        if (user && user.status === "active") {
            req.user = user;
        }
    } catch {
        // Silently ignore invalid tokens
    }
    next();
});