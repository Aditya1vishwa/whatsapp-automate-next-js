import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import UserModel from "../db/mongodb/models/user.model.js";
import WorkspaceModel from "../db/mongodb/models/Workspace.model.js";
import authHelpers from "../helpers/Auth.js";
import emailHelper from "../helpers/email.helper.js";
import { passwordRegex } from "../constant/others.js";

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
};

const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, "Email and password are required");
    }
    const user = await UserModel.findOne({ email }).select("+password");
    if (!user) {
        throw new ApiError(401, "Invalid email or password");
    }

    const isPasswordValid = await authHelpers.comparePassword(password, user.password);
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid email or password");
    }


    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const refreshToken = authHelpers.generateRefreshToken({ _id: user._id });

    // Save refresh token
    user.refreshToken = refreshToken;
    await user.save();

    const safeUser = {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profile: user.profile,
        role: user.role,
        userType: user.userType,
        isEmailVerified: user.isEmailVerified,
        status: user.status,
        lastLogin: user.lastLogin,
        isProfileCompleted: user.isProfileCompleted,
    };

    let workspaces = [];
    let currentWorkspace = null;

    if (user.role !== "admin") {
        workspaces = await WorkspaceModel.find({ userId: user._id })
            .populate("userId", "name email")
            .populate("members.userId", "name email");
        currentWorkspace = workspaces.find((w) => w.isDefault) || null;
    }

    const accessTokenPayload = { _id: user._id, email: user.email };
    if (user.role !== "admin" && currentWorkspace?._id) {
        accessTokenPayload.currentWorkspaceId = currentWorkspace._id;
    }

    const accessToken = authHelpers.generateAccessToken(accessTokenPayload);


    res
        .status(200)
        .cookie("accessToken", accessToken, cookieOptions)
        .cookie("refreshToken", refreshToken, { ...cookieOptions, path: "/api/v1/auth/refresh-token" })
        .json(
            new ApiResponse(
                200,
                { user: safeUser, currentWorkspace, workspaces },
                "Login successful"
            )
        );
});

const signup = asyncHandler(async (req, res) => {
    const { name, email, password, phone, userType } = req.body;

    if (!name || !email || !password) {
        throw new ApiError(400, "Name, email, and password are required");
    }

    if (!passwordRegex.test(password)) {
        throw new ApiError(400, "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.");
    }

    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
        throw new ApiError(409, "User with this email already exists");
    }

    const hashedPassword = await authHelpers.hashPassword(password);
    const otp = generateOtp();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    const user = new UserModel({
        name,
        email,
        password: hashedPassword,
        phone,
        userType: userType || "job-seeker",
        emailVerificationToken: otp,
        emailVerificationTokenExpiry: expiry
    });

    await user.save();

    // Create default workspace
    const workspace = new WorkspaceModel({
        name: "Default Workspace",
        description: "Default workspace created on signup",
        userId: user._id,
        members: [],
        isDefault: true,
    });
    await workspace.save();

    const safeUser = {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        userType: user.userType,
        isEmailVerified: user.isEmailVerified,
        status: user.status,
        isProfileCompleted: user.isProfileCompleted,
    };

    emailHelper.sendMail({
        to: email,
        subject: "Verify your PrepNinja account",
        templateName: "email-verification",
        data: { name, otp }
    }).catch(err => console.error("Email failed:", err));

    res.status(201).json(
        new ApiResponse(201, { user: safeUser, requiresVerification: true }, "User registered successfully. Please verify your email.")
    );
});

const verifyEmail = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) throw new ApiError(400, "Email and OTP are required");

    const user = await UserModel.findOne({ email }).select("+emailVerificationToken +emailVerificationTokenExpiry");
    if (!user) throw new ApiError(404, "User not found");

    if (user.isEmailVerified) {
        return res.status(200).json(new ApiResponse(200, {}, "Email is already verified"));
    }

    if (user.emailVerificationToken !== otp) {
        throw new ApiError(401, "Invalid OTP");
    }

    if (user.emailVerificationTokenExpiry < new Date()) {
        throw new ApiError(401, "OTP has expired. Please request a new one.");
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationTokenExpiry = undefined;
    await user.save();

    res.status(200).json(new ApiResponse(200, {}, "Email verified successfully"));
});

const resendOtp = asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) throw new ApiError(400, "Email is required");

    const user = await UserModel.findOne({ email });
    if (!user) throw new ApiError(404, "User not found");

    if (user.isEmailVerified) {
        return res.status(200).json(new ApiResponse(200, {}, "Email is already verified"));
    }

    const otp = generateOtp();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    user.emailVerificationToken = otp;
    user.emailVerificationTokenExpiry = expiry;
    await user.save();

    emailHelper.sendMail({
        to: email,
        subject: "Verify your PrepNinja account",
        templateName: "email-verification",
        data: { name: user.name, otp }
    }).catch(err => console.error("Email failed:", err));

    res.status(200).json(new ApiResponse(200, {}, "OTP sent successfully"));
});

const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) {
        throw new ApiError(400, "Email is required");
    }
    const user = await UserModel.findOne({ email });
    if (!user) {
        throw new ApiError(404, "User not found");
    }
    // Generate forget token
    const forgetToken = authHelpers.generateAccessToken({ _id: user._id, email: user.email });
    user.forgetToken = forgetToken;
    user.forgetTokenCreateAt = new Date();
    await user.save();


    // Send email with reset link
    const frontendBase = (process.env.FRONTEND_URLS || "http://localhost:5173").split(",")[0];
    // Frontend route for reset page is '/reset'
    const resetPath = `/reset?token=${forgetToken}`;
    const resetLink = `${frontendBase.replace(/\/$/, "")}${resetPath}`;

    // Progressive request throttling: if user requested recently, schedule next send instead of immediate
    const SCHEDULE = [1, 5, 30, 120]; // minutes
    const now = new Date();
    if (user.forgetEmailNextAttempt && user.forgetEmailNextAttempt > now) {
        // user is requesting too soon; don't overwrite stored schedule.
        const msRemaining = user.forgetEmailNextAttempt - now;
        const minutes = Math.ceil(msRemaining / (60 * 1000));
        let message;
        if (minutes < 60) message = `Please try again after ${minutes} minute(s).`;
        else {
            const hours = Math.ceil(minutes / 60);
            message = `Please try again after ${hours} hour(s).`;
        }

        // Inform the caller of remaining wait time but do not modify the stored schedule.
        return res.json(new ApiResponse(200, {}, message));
    }

    // Otherwise attempt immediate send
    try {
        const sent = await emailHelper.sendMail({
            to: email,
            subject: "Reset your PrepNinja password",
            templateName: "forgot-password",
            data: { name: user.name || "", resetLink }
        });

        if (sent) {
            // clear any previous retry metadata
            user.forgetEmailRetryStep = undefined;
            user.forgetEmailNextAttempt = undefined;
            await user.save();
        } else {
            // schedule first retry after 1 minute
            user.forgetEmailRetryStep = 0;
            user.forgetEmailNextAttempt = new Date(Date.now() + SCHEDULE[0] * 60 * 1000);
            await user.save();
        }
    } catch (err) {
        console.error("Email failed:", err);
        user.forgetEmailRetryStep = 0;
        user.forgetEmailNextAttempt = new Date(Date.now() + SCHEDULE[0] * 60 * 1000);
        await user.save();
    }

    const respData = {};
    if (process.env.NODE_ENV !== 'production') {
        respData.resetToken = forgetToken;
    }
    res.json(new ApiResponse(200, respData, "Password reset link sent to your email"));
});

const resetPassword = asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        throw new ApiError(400, "Token and new password are required");
    }

    if (!passwordRegex.test(newPassword)) {
        throw new ApiError(400, "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.");
    }

    let decoded;
    try {
        decoded = authHelpers.verifyToken(token, process.env.ACCESS_TOKEN_SECRET);
    } catch (error) {
        console.error('[Auth] resetPassword: jwt verify error:', error.name, error.message);
        throw new ApiError(401, "Invalid or expired token");
    }

    const user = await UserModel.findById(decoded._id).select('+forgetToken +forgetTokenCreateAt');
    if (!user) {
        throw new ApiError(401, "Invalid token");
    }
    if (!user.forgetToken || user.forgetToken !== token) {
        console.error('[Auth] resetPassword: token mismatch. user.forgetToken exists:', !!user.forgetToken);
        throw new ApiError(401, "Invalid token");
    }

    // Check if token is expired (e.g., 15 minutes)
    const tokenAge = (new Date() - user.forgetTokenCreateAt) / (1000 * 60);
    if (tokenAge > 15) {
        throw new ApiError(401, "Token expired");
    }

    const hashedPassword = await authHelpers.hashPassword(newPassword);
    user.password = hashedPassword;
    user.forgetToken = undefined;
    user.forgetTokenCreateAt = undefined;
    // clear any pending retry metadata since password was reset
    user.forgetEmailRetryStep = undefined;
    user.forgetEmailNextAttempt = undefined;
    await user.save();

    res.json(new ApiResponse(200, {}, "Password reset successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Refresh token is required");
    }

    let decoded;
    try {
        decoded = authHelpers.verifyToken(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
    } catch (error) {
        throw new ApiError(401, "Invalid refresh token");
    }

    const user = await UserModel.findById(decoded._id);
    if (!user || user.refreshToken !== incomingRefreshToken) {
        throw new ApiError(401, "Invalid refresh token");
    }

    const accessToken = authHelpers.generateAccessToken({ _id: user._id, email: user.email });
    const refreshToken = authHelpers.generateRefreshToken({ _id: user._id });

    user.refreshToken = refreshToken;
    await user.save();

    res
        .status(200)
        .cookie("accessToken", accessToken, cookieOptions)
        .cookie("refreshToken", refreshToken, { ...cookieOptions, path: "/api/v1/auth/refresh-token" })
        .json(
            new ApiResponse(200, { accessToken, refreshToken }, "Tokens refreshed successfully")
        );
});

const logout = asyncHandler(async (req, res) => {
    const user = req.user;

    user.refreshToken = undefined;
    await user.save();

    res
        .status(200)
        .clearCookie("accessToken", cookieOptions)
        .clearCookie("refreshToken", { ...cookieOptions, path: "/api/v1/auth/refresh-token" })
        .json(new ApiResponse(200, {}, "Logged out successfully"));
});

const backToAdmin = asyncHandler(async (req, res) => {
    const adminAccessToken = req.cookies?.adminAccessToken;
    if (!adminAccessToken) {
        throw new ApiError(400, "No active admin impersonation session");
    }

    let decoded;
    try {
        decoded = authHelpers.verifyToken(adminAccessToken, process.env.ACCESS_TOKEN_SECRET);
    } catch {
        throw new ApiError(401, "Invalid or expired admin session");
    }

    const admin = await UserModel.findById(decoded._id).select(
        "-password -refreshToken -forgetPasswordToken"
    );
    if (!admin || admin.role !== "admin" || admin.status !== "active") {
        throw new ApiError(403, "Admin account is not available");
    }

    const accessToken = authHelpers.generateAccessToken({ _id: admin._id, email: admin.email });

    const safeUser = {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        profile: admin.profile,
        role: admin.role,
        userType: admin.userType,
        isEmailVerified: admin.isEmailVerified,
        status: admin.status,
        lastLogin: admin.lastLogin,
        isProfileCompleted: admin.isProfileCompleted,
    };

    res
        .status(200)
        .cookie("accessToken", accessToken, cookieOptions)
        .clearCookie("adminAccessToken", cookieOptions)
        .clearCookie("isLoggedInAsAdmin", { ...cookieOptions, httpOnly: false })
        .json(new ApiResponse(200, { user: safeUser, currentWorkspace: null, workspaces: [] }, "Returned to admin account"));
});

const getMe = asyncHandler(async (req, res) => {
    const user = req.user;

    const safeUser = {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profile: user.profile,
        role: user.role,
        userType: user.userType,
        isEmailVerified: user.isEmailVerified,
        status: user.status,
        lastLogin: user.lastLogin,
        isProfileCompleted: user.isProfileCompleted,
    };

    let workspaces = [];
    let currentWorkspace = null;

    if (user.role !== "admin") {
        workspaces = await WorkspaceModel.find({
            $or: [
                { userId: user._id },
                { "members.userId": user._id, "members.status": "active" }
            ]
        })
            .populate("userId", "name email")
            .populate("members.userId", "name email");

        currentWorkspace = workspaces.find((w) => w.isDefault) || null;
    }

    res.json(new ApiResponse(200, { user: safeUser, currentWorkspace, workspaces }, "User data retrieved successfully"));
});

const updateMe = asyncHandler(async (req, res) => {
    const { name, phone, profile, email } = req.body;
    const user = req.user;

    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (profile) user.profile = profile;
    if (email && email !== user.email) {
        const existing = await UserModel.findOne({ email });
        if (existing) {
            throw new ApiError(409, "User with this email already exists");
        }
        user.email = email;
    }

    await user.save();

    const safeUser = {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profile: user.profile,
        role: user.role,
        userType: user.userType,
        isEmailVerified: user.isEmailVerified,
        status: user.status,
        isProfileCompleted: user.isProfileCompleted,
    };

    res.json(new ApiResponse(200, { user: safeUser }, "Profile updated successfully"));
});

const changePassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const user = req.user;
    if (!oldPassword || !newPassword) {
        throw new ApiError(400, "Old password and new password are required");
    }

    if (!passwordRegex.test(newPassword)) {
        throw new ApiError(400, "New password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.");
    }
    const userData = await UserModel.findById(user._id).select("+password");

    const isPasswordValid = await authHelpers.comparePassword(oldPassword, userData.password);
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid old password");
    }
    const hashedPassword = await authHelpers.hashPassword(newPassword);
    user.password = hashedPassword;
    await user.save();

    res.json(new ApiResponse(200, {}, "Password changed successfully"));
});

const changeWorkspace = asyncHandler(async (req, res) => {
    const { workspaceId } = req.body;
    const user = req.user;

    if (!workspaceId) {
        throw new ApiError(400, "Workspace ID is required");
    }

    // Find the workspace where user is member
    const workspace = await WorkspaceModel.findOne({
        _id: workspaceId,
        "members.userId": user._id,
        "members.status": "active"
    });

    if (!workspace) {
        throw new ApiError(404, "Workspace not found or access denied");
    }

    const accessToken = authHelpers.generateAccessToken({ _id: user._id, email: user.email, currentWorkspaceId: workspaceId });

    res
        .status(200)
        .cookie("accessToken", accessToken, cookieOptions)
        .json(new ApiResponse(200, { accessToken }, "Workspace changed successfully"));
});

const seedDummyUser = asyncHandler(async (req, res) => {
    // For development only
    const hashedPassword = await authHelpers.hashPassword("password123");

    const user = new UserModel({
        name: "Dummy User",
        email: "dummy@example.com",
        password: hashedPassword,
        userType: "job-seeker",
    });

    await user.save();

    res.json(new ApiResponse(201, { user }, "Dummy user created"));
});

const authController = {
    post: {
        login,
        signup,
        verifyEmail,
        resendOtp,
        forgotPassword,
        resetPassword,
        refreshAccessToken,
        seedDummyUser,
        logout,
        changePassword,
        changeWorkspace,
        backToAdmin
    },
    get: {
        getMe
    },
    patch: {
        updateMe
    }
};

export default authController;
