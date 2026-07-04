/**
 * UTR Utility
 * Extracts UTR (Unique Transaction Reference) numbers from text.
 * Covers Indian payment systems: IMPS, NEFT, RTGS, UPI, HDFC, ICICI, SBI, Axis formats.
 */

/**
 * All known UTR patterns for Indian payment systems.
 * Priority order: most specific first.
 */
const UTR_PATTERNS = [
    // UPI Ref / Transaction ID: typically 12 digits
    /\bUTR[:\s#\-]*([0-9]{12,22})\b/gi,

    // IMPS reference: 12 digits
    /\bIMPS[:\s#\-]*([0-9]{12})\b/gi,

    // NEFT reference: alphanumeric, e.g. SBIN026234567890
    /\bNEFT[:\s#\-]*([A-Z0-9]{14,22})\b/gi,

    // RTGS reference: similar to NEFT
    /\bRTGS[:\s#\-]*([A-Z0-9]{14,22})\b/gi,

    // Generic "Ref No" / "Reference Number" / "Transaction ID"
    /(?:Ref(?:erence)?(?:\s*No\.?|:|\s*Number)?|Transaction\s*(?:ID|Number|Ref)?|TXN(?:\s*ID)?)[:\s#\-]*([A-Z0-9]{10,22})\b/gi,

    // UPI Transaction Reference
    /(?:UPI\s*Ref|UPI\s*Transaction)[:\s#\-]*([0-9]{12,22})\b/gi,

    // Standalone 12-digit numeric (most UTRs are exactly 12 digits)
    /\b([0-9]{12})\b/g,

    // Bank-specific: HDFC (HDFC + 12-digit)
    /HDFC[A-Z0-9]*([0-9]{10,16})/gi,

    // Standalone alphanumeric 14-22 chars (broad fallback)
    /\b([A-Z]{3,6}[0-9]{8,16})\b/g,
];

/**
 * Extract the first UTR found in the given text.
 * @param {string} text - Raw text (OCR output, email body, etc.)
 * @returns {string|null} - The extracted UTR or null
 */
export function extractUTR(text) {
    if (!text || typeof text !== "string") return null;

    // Normalize whitespace
    const normalized = text.replace(/\s+/g, " ").trim();

    for (const pattern of UTR_PATTERNS) {
        // Reset lastIndex for global patterns
        pattern.lastIndex = 0;
        const match = pattern.exec(normalized);
        if (match && match[1]) {
            const candidate = match[1].trim();
            // Sanity check: must be at least 10 chars
            if (candidate.length >= 10) {
                return candidate;
            }
        }
    }

    return null;
}

/**
 * Extract all UTRs found in text (for comprehensive matching).
 * @param {string} text
 * @returns {string[]} - Array of unique UTRs
 */
export function extractAllUTRs(text) {
    if (!text || typeof text !== "string") return [];

    const normalized = text.replace(/\s+/g, " ").trim();
    const found = new Set();

    for (const pattern of UTR_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(normalized)) !== null) {
            const candidate = (match[1] || "").trim();
            if (candidate.length >= 10) {
                found.add(candidate);
            }
            // Prevent infinite loop for zero-width matches
            if (match.index === pattern.lastIndex) pattern.lastIndex++;
        }
    }

    return [...found];
}

/**
 * Normalize a UTR for comparison (uppercase, strip spaces/dashes).
 * @param {string} utr
 * @returns {string}
 */
export function normalizeUTR(utr) {
    if (!utr) return "";
    return utr.toUpperCase().replace(/[\s\-_]/g, "");
}

/**
 * Compare two UTRs for equality (case-insensitive, ignores dashes/spaces).
 * @param {string} utr1
 * @param {string} utr2
 * @returns {boolean}
 */
export function utrMatch(utr1, utr2) {
    if (!utr1 || !utr2) return false;
    return normalizeUTR(utr1) === normalizeUTR(utr2);
}

/**
 * Extract amount from text (INR amounts like ₹1,234.56 or Rs.1234)
 * @param {string} text
 * @returns {number|null}
 */
export function extractAmount(text) {
    if (!text) return null;

    const amountPatterns = [
        /(?:₹|Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{1,2})?)/gi,
        /(?:Amount|Amt|amount paid|credited)[:\s]*(?:₹|Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/gi,
        /([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:rupees|INR)/gi,
    ];

    for (const pattern of amountPatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(text);
        if (match && match[1]) {
            const clean = match[1].replace(/,/g, "");
            const num = parseFloat(clean);
            if (!isNaN(num) && num > 0) return num;
        }
    }
    return null;
}
