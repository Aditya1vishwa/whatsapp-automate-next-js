import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import PhoneNumber from "@/models/PhoneNumber";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const numbers = await PhoneNumber.find().sort({ createdAt: -1 });
  return NextResponse.json(numbers);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const body = await req.json();
  const { name, phone, label, tags } = body;

  if (!name || !phone) {
    return NextResponse.json({ error: "Name and phone are required" }, { status: 400 });
  }

  const number = await PhoneNumber.create({ name, phone, label, tags: tags || [] });
  return NextResponse.json(number, { status: 201 });
}
