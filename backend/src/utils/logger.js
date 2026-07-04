import { createRequire } from "module";
const require = createRequire(import.meta.url);
const winston = require("winston");
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directory exists
const logsDir = path.join(__dirname, "..", "..", "logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? `\n  ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}${metaStr}`;
});

const logger = winston.createLogger({
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    format: combine(
        errors({ stack: true }),
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        logFormat
    ),
    transports: [
        // Console (development)
        new winston.transports.Console({
            format: combine(
                colorize({ all: true }),
                errors({ stack: true }),
                timestamp({ format: "HH:mm:ss" }),
                logFormat
            ),
        }),
        // File: all logs
        new winston.transports.File({
            filename: path.join(logsDir, "payment.log"),
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
        }),
        // File: errors only
        new winston.transports.File({
            filename: path.join(logsDir, "payment-error.log"),
            level: "error",
            maxsize: 10 * 1024 * 1024,
            maxFiles: 5,
        }),
    ],
    exceptionHandlers: [
        new winston.transports.File({
            filename: path.join(logsDir, "payment-exceptions.log"),
        }),
    ],
    rejectionHandlers: [
        new winston.transports.File({
            filename: path.join(logsDir, "payment-rejections.log"),
        }),
    ],
});

export default logger;
