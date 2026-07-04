import mongoose, { Schema, Document, model, models } from "mongoose";

export interface IPhoneNumber extends Document {
  name: string;
  phone: string;
  label?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const PhoneNumberSchema = new Schema<IPhoneNumber>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    label: { type: String, default: "" },
    tags: [{ type: String }],
  },
  { timestamps: true }
);

const PhoneNumber = models.PhoneNumber || model<IPhoneNumber>("PhoneNumber", PhoneNumberSchema);
export default PhoneNumber;
