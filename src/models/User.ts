import mongoose, { Schema, Document, model, models } from "mongoose";

export interface IUser extends Document {
  name: string;
  email?: string;
  phone: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name:  { type: String, required: true, trim: true },
    email: { type: String, required: false, unique: false, lowercase: true, trim: true, sparse: true },
    phone: { type: String, required: true, trim: true },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

const User = models.User || model<IUser>("User", UserSchema);
export default User;
