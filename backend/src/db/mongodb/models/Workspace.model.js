import mongoose, { Schema } from "mongoose";

const workspaceSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        members: [
            {
                userId: {
                    type: Schema.Types.ObjectId,
                    ref: "User",
                },
                status: {
                    type: String,
                    enum: ["active", "pending", "inactive"],
                    default: "active",
                }
            }
        ],
        isDefault: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

const WorkspaceModel = mongoose.models.Workspace || mongoose.model("Workspace", workspaceSchema);

export default WorkspaceModel;
