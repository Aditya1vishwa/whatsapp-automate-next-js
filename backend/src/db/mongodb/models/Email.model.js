import mongoose from "mongoose";

/**
 * Email Model
 * Stores payment notification emails fetched from Gmail.
 * UTR is extracted automatically via regex and Gemini.
 */
const emailSchema = new mongoose.Schema(
    {
        // Gmail message identifier (unique per message)
        gmailMessageId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        sender: { type: String, trim: true },
        senderEmail: { type: String, trim: true, lowercase: true },
        subject: { type: String, trim: true },
        body: { type: String },
        snippet: { type: String },

        // Extracted payment data
        utr: { type: String, trim: true, index: true },
        amount: { type: Number, default: null },
        transactionId: { type: String, trim: true },
        referenceNumber: { type: String, trim: true },
        currency: { type: String, default: "INR" },

        // Email metadata
        labels: [{ type: String }],
        receivedAt: { type: Date, default: Date.now },
        isProcessed: { type: Boolean, default: false },

        // Verification status
        status: {
            type: String,
            enum: ["PENDING", "VERIFIED", "UNVERIFIED"],
            default: "PENDING",
            index: true,
        },

        // Relation to matched WhatsApp message
        matchedWhatsappId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Whatsapp",
            default: null,
        },
    },
    { timestamps: true }
);

// Compound index for faster lookups
emailSchema.index({ utr: 1, status: 1 });
emailSchema.index({ receivedAt: -1 });

const EmailModel = mongoose.model("Email", emailSchema);

export default EmailModel;
