import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import PhoneNumber from "@/models/PhoneNumber";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { id } = await params;
  const body = await req.json();
  const number = await PhoneNumber.findByIdAndUpdate(id, body, { new: true });
  if (!number) return NextResponse.json({ error: "Number not found" }, { status: 404 });
  return NextResponse.json(number);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { id } = await params;
  await PhoneNumber.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}
