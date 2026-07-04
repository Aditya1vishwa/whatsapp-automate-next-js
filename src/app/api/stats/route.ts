import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Client from "@/models/Client";
import PhoneNumber from "@/models/PhoneNumber";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const [totalUsers, totalClients, totalNumbers] = await Promise.all([
    User.countDocuments(),
    Client.countDocuments(),
    PhoneNumber.countDocuments(),
  ]);

  const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5).select("name email phone createdAt");
  const recentClients = await Client.find().sort({ createdAt: -1 }).limit(5).select("clientName contactPerson status createdAt");

  const whatsappConfigured = !!(
    process.env.META_ACCESS_TOKEN &&
    process.env.META_ACCESS_TOKEN !== "your-permanent-whatsapp-token-here" &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_PHONE_NUMBER_ID !== "your-phone-number-id-here"
  );

  return NextResponse.json({
    stats: { totalUsers, totalClients, totalNumbers },
    recentUsers,
    recentClients,
    servers: [
      {
        id: "whatsapp",
        name: "WhatsApp",
        status: whatsappConfigured ? "connected" : "not_configured",
        description: "Meta WhatsApp Cloud API",
        icon: "whatsapp",
      },
    ],
  });
}
