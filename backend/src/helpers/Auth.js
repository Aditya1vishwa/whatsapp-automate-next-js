import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const SALT_ROUNDS = 10;

const authHelpers = {
    hashPassword: async (plainPassword) => {
        if (!plainPassword) {
            throw new Error("Password is required");
        }
        return bcrypt.hash(plainPassword, SALT_ROUNDS);
    },

    comparePassword: async (plainPassword, hashedPassword) => {
        if (!plainPassword || !hashedPassword) {
            return false;
        }
        return bcrypt.compare(plainPassword, hashedPassword);
    },

    generateAccessToken: (payload) => {
        return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "1d",
        });
    },

    generateRefreshToken: (payload) => {
        return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d",
        });
    },

    verifyToken: (token, secret) => {
        return jwt.verify(token, secret);
    },
};

export default authHelpers;