import multer from "multer";
import fs from "fs";
import { normalizeFileName } from "../utils/fileName.js";

const tempDir = "./public/temp";
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, tempDir);
    },
    filename: (_req, file, cb) => {
        const { fileName } = normalizeFileName(file.originalname);
        cb(null, fileName);
    },
});

const fileFilter = (
    _req,
    file,
    cb
) => {
    const allowedMimes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/svg+xml",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "video/mp4",
        "video/webm",
        "audio/mpeg",
        "audio/wav",
        "audio/webm",
        "audio/ogg",
        "audio/mp4",
        "text/plain",
        "text/csv",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || "10") * 1024 * 1024,
    },
});

// ─── Convenience exports ──────────────────────────────────────────────────────
export const uploadSingle = (fieldName) => upload.single(fieldName);
export const uploadMultiple = (fieldName, maxCount = 5) =>
    upload.array(fieldName, maxCount);
export const uploadFields = (fields) => upload.fields(fields);