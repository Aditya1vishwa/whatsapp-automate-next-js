import mongoose, { Schema, Document, model, models } from "mongoose";

export interface IClient extends Document {
  clientName: string;
  contactPerson: string;
  email: string;
  phone: string;
  details?: string;
  status: "active" | "inactive" | "pending";
  createdAt: Date;
  updatedAt: Date;
}

const ClientSchema = new Schema<IClient>(
  {
    clientName: { type: String, required: true, trim: true },
    contactPerson: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    details: { type: String, default: "" },
    status: { type: String, enum: ["active", "inactive", "pending"], default: "active" },
  },
  { timestamps: true }
);

const Client = models.Client || model<IClient>("Client", ClientSchema);
export default Client;
