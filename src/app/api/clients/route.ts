import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Client from "@/models/Client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const clients = await Client.find().sort({ createdAt: -1 });
  return NextResponse.json(clients);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const body = await req.json();
  const { clientName, contactPerson, email, phone, details, status } = body;

  if (!clientName || !contactPerson || !email || !phone) {
    return NextResponse.json({ error: "Required fields missing" }, { status: 400 });
  }

  const client = await Client.create({ clientName, contactPerson, email, phone, details, status });
  return NextResponse.json(client, { status: 201 });
}
