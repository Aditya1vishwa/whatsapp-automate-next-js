import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        password: {
            type: String,
            required: true,
            select: false,
        },
        phone: {
            type: String,
            trim: true,
        },
        profile: {
            type: String,
        },
        role: {
            type: String,
            enum: ["user", "admin"],
            default: "user",
        },
        userType: {
            type: String,
            default: "job-seeker",
        },
        isEmailVerified: {
            type: Boolean,
            default: false,
        },
        status: {
            type: String,
            enum: ["active", "inactive", "suspended"],
            default: "active",
        },
        lastLogin: {
            type: Date,
        },
        isProfileCompleted: {
            type: Boolean,
            default: false,
        },
        refreshToken: {
            type: String,
            select: false,
        },
        emailVerificationToken: {
            type: String,
            select: false,
        },
        emailVerificationTokenExpiry: {
            type: Date,
            select: false,
        },
        forgetToken: {
            type: String,
            select: false,
        },
        forgetTokenCreateAt: {
            type: Date,
            select: false,
        },
        forgetEmailRetryStep: {
            type: Number,
        },
        forgetEmailNextAttempt: {
            type: Date,
        }
    },
    {
        timestamps: true,
    }
);

const UserModel = mongoose.models.User || mongoose.model("User", userSchema);

export default UserModel;
