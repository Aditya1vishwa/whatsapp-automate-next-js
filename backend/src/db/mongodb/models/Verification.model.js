import mongoose from "mongoose";

/**
 * Verification Model
 * Central record linking a WhatsApp payment screenshot to a Gmail payment email.
 * Tracks confidence score, timeline, and manual override history.
 */
const verificationSchema = new mongoose.Schema(
    {
        // References
        whatsappId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Whatsapp",
            required: true,
            index: true,
        },
        emailId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Email",
            default: null,
            index: true,
        },

        // Matching result
        status: {
            type: String,
            enum: ["PENDING", "VERIFIED", "UNVERIFIED"],
            default: "PENDING",
            index: true,
        },

        // 0–100 confidence score based on matched fields
        confidence: { type: Number, default: 0, min: 0, max: 100 },

        // Which fields were matched: ["utr", "amount", "date", "sender"]
        matchedFields: [{ type: String }],

        // Human who verified (null = auto-verified)
        verifiedBy: { type: String, default: null },
        verifiedAt: { type: Date, default: null },

        // Audit trail
        timeline: [
            {
                action: { type: String }, // "AUTO_MATCHED", "MANUALLY_VERIFIED", "UNVERIFIED", "PENDING_SET"
                by: { type: String },
                at: { type: Date, default: Date.now },
                note: { type: String },
            },
        ],

        notes: { type: String, default: "" },
    },
    { timestamps: true }
);

verificationSchema.index({ status: 1, createdAt: -1 });
verificationSchema.index({ confidence: -1 });

const VerificationModel = mongoose.model("Verification", verificationSchema);

export default VerificationModel;
