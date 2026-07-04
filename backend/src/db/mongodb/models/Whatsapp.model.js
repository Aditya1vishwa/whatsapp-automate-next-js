import mongoose from "mongoose";

/**
 * WhatsApp Model
 * Stores messages received from WhatsApp groups containing payment screenshots.
 */
const whatsappSchema = new mongoose.Schema(
    {
        // WhatsApp group info
        groupName: { type: String, trim: true },
        groupId: { type: String, trim: true, index: true },

        // Sender info
        senderName: { type: String, trim: true },
        senderNumber: { type: String, trim: true },

        // Message content
        caption: { type: String, trim: true },
        messageId: { type: String, trim: true, unique: true, sparse: true },

        // Image data
        imagePath: { type: String, trim: true }, // local file path
        imageUrl: { type: String, trim: true },  // public URL

        // OCR result
        ocrText: { type: String },
        ocrProvider: { type: String, default: "gemini" },

        // Extracted payment data
        utr: { type: String, trim: true, index: true },
        amount: { type: Number, default: null },

        // Verification status
        status: {
            type: String,
            enum: ["PENDING", "VERIFIED", "UNVERIFIED"],
            default: "PENDING",
            index: true,
        },

        // Relation to matched email
        matchedEmailId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Email",
            default: null,
        },

        // When the WhatsApp message was originally sent
        receivedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

whatsappSchema.index({ utr: 1, status: 1 });
whatsappSchema.index({ createdAt: -1 });

const WhatsappModel = mongoose.model("Whatsapp", whatsappSchema);

export default WhatsappModel;
