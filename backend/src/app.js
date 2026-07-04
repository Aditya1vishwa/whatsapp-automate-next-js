import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import expressWinston from "express-winston";
import winston from "winston";
import fs from "fs";
if (!fs.existsSync("logs")) fs.mkdirSync("logs");
import { fileURLToPath } from "url";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const session = require("express-session");
import MongoStore from "connect-mongo";
import mongoose from "mongoose";
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");

const app = express()

// ─── Security Headers (Helmet) ────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: false, // Disabled to allow CDN resources in EJS views
    crossOriginEmbedderPolicy: false,
}));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use("/api", limiter);

const allowedOrigins = [
    "http://localhost:5173",
    "http://52.5.38.251:8002",
    "https://prepninjaai.com",
    "http://localhost:4173",
    "http://localhost:8002",
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Not allowed by CORS"));
    },
    credentials: true
}))

app.use(express.json({ limit: "16kb" }))
app.use(express.urlencoded({ extended: true, limit: "16kb" }))
app.use(express.static(publicDir));
app.use(
    "/uploads", express.static(path.join(__dirname, "..", "uploads"))
);


app.use(cookieParser())

// ─── Express Session (for dashboard auth) ─────────────────────────────────────
app.use(session({
    secret: process.env.SESSION_SECRET || "payverify_default_secret_change_in_production",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        clientPromise: mongoose.connection.asPromise().then(m => m.getClient()),
        collectionName: "payverify_sessions",
        ttl: 24 * 60 * 60, // 1 day
    }),
    cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 1 day
        sameSite: "lax",
    },
}));

// ─── EJS View Engine ──────────────────────────────────────────────────────────
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Make process available in EJS templates (for env checks in settings page)
app.locals.process = process;


app.use(expressWinston.logger({
    transports: [
        new winston.transports.File({ filename: 'logs/api.log' })
    ],
    format: winston.format.json(),
    meta: true,
    msg: "HTTP {{req.method}} {{req.url}}",
    expressFormat: true,
}));


// app.get("uploads/:filename", (req, res) => {
//     console.log("come here")
//     const filePath = path.join(__dirname, "uploads", req.params.filename);
//     console.log(filePath)
//     if (!fs.existsSync(filePath)) {
//         return res.status(404).json({ message: "File not found" });
//     }
//     res.sendFile(filePath);
// });

import authRouter from "./routes/auth.route.js"

// ─── Payment Verification Module Routes ───────────────────────────────────────
import paymentAuthRouter from "./routes/payment-auth.route.js";
import dashboardRouter from "./routes/dashboard.route.js";
import gmailRouter from "./routes/gmail.route.js";
import whatsappRouter from "./routes/whatsapp.route.js";
import verificationRouter from "./routes/verification.route.js";
import settingsRouter from "./routes/settings.route.js";

/// V1 Routes ////
app.use("/api/auth", authRouter);

// ─── Payment Verification Dashboard Routes ────────────────────────────────────
app.use("/", paymentAuthRouter);
app.use("/", dashboardRouter);
app.use("/", gmailRouter);
app.use("/", whatsappRouter);
app.use("/", verificationRouter);
app.use("/", settingsRouter);

// Root redirect: / → /dashboard (if authenticated) or /login
app.get("/", (req, res) => {
    if (req.session?.user) return res.redirect("/dashboard");
    res.redirect("/login");
});

import textToSpeech from "@google-cloud/text-to-speech";

const client = new textToSpeech.TextToSpeechClient();

app.get("/tts", async (req, res) => {
    try {
        const text = req.query.text;

        if (!text) {
            return res.status(400).send("Text is required");
        }

        const request = {
            input: { text },

            voice: {
                languageCode: "en-IN",
                name: "en-IN-Standard-A", // or Standard-A
            },

            audioConfig: {
                audioEncoding: "MP3",
            },
        };

        const [response] = await client.synthesizeSpeech(request);

        const audioBuffer = Buffer.from(response.audioContent);

        // 👇 Important headers for download
        res.set({
            "Content-Type": "audio/mpeg",
            "Content-Disposition": 'attachment; filename="speech.mp3"',
            "Content-Length": audioBuffer.length,
        });

        res.send(audioBuffer);

    } catch (err) {
        console.error(err);
        res.status(500).send("TTS Error");
    }
});







app.use((err, req, res, next) => {
    console.error("Error:", err.message);
    const status = err.statusCode || 500;
    res.status(status).json({
        success: false,
        message: err.message || "Internal Server Error"
    });
});

export default app 

// Start background worker for resend retries (non-blocking)
// Background retry worker removed: retries are driven by user requests only.
