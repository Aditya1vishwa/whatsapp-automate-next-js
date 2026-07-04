import fs from "fs";
import crypto from "crypto";

const Common = {}


Common.deleteLocalFiles = async (files) => {
    if (!files || !files.length) return;
    const fileArray = Array.isArray(files) ? files : [files];
    for (const file of fileArray) {
        try {
            await fs.promises.unlink(file);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                console.error(`Error deleting file: ${file}`, err);
            }
        }
    }
};

// ── Interview token helpers ───────────────────────────────────────────────────
// Creates a URL-safe token that encodes {interviewId, email, name, exp}
// so candidates don't need to log in; the backend decrypts and validates.
const TOKEN_KEY = () => {
    const k = process.env.INTERVIEW_TOKEN_SECRET || "prepninja_interview_secret_32chars!";
    return Buffer.from(k.padEnd(32, "_").slice(0, 32));
};
const IV_LENGTH = 16;
const ALGO = "aes-256-cbc";

Common.encryptInterviewToken = (payload) => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGO, TOKEN_KEY(), iv);
    const json = JSON.stringify(payload);
    const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
};

Common.decryptInterviewToken = (token) => {
    try {
        const [ivHex, encHex] = token.split(":");
        if (!ivHex || !encHex) return null;
        const iv = Buffer.from(ivHex, "hex");
        const decipher = crypto.createDecipheriv(ALGO, TOKEN_KEY(), iv);
        const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]);
        const payload = JSON.parse(decrypted.toString("utf8"));
        // Check expiry
        if (payload.exp && Date.now() > payload.exp) return null;
        return payload;
    } catch {
        return null;
    }
};

export default Common;
