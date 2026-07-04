import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Admin from "@/models/Admin";

export async function GET() {
  try {
    await connectDB();
    const existing = await Admin.findOne({ email: process.env.ADMIN_EMAIL || "admin@example.com" });
    if (existing) {
      return NextResponse.json({ message: "Admin already seeded", ok: true });
    }

    const admin = await Admin.create({
      username: process.env.ADMIN_USERNAME || "admin",
      name: "Administrator",
      email: process.env.ADMIN_EMAIL || "admin@example.com",
      password: process.env.ADMIN_PASSWORD || "admin123",
      role: "super_admin",
    });

    return NextResponse.json({
      message: "Admin seeded successfully",
      username: admin.username,
      email: admin.email,
      ok: true,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
