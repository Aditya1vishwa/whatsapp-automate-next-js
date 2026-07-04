import { NextResponse } from "next/server";
import { fetchWhatsAppTemplates } from "@/lib/whatsapp";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const templates = await fetchWhatsAppTemplates();
    return NextResponse.json(templates);
  } catch (error: unknown) {
    const message = (error as Error).message;
    // Return empty array with error info if credentials not set up
    if (message.includes("not configured")) {
      return NextResponse.json({ error: message, templates: [] }, { status: 503 });
    }
    return NextResponse.json({ error: message, templates: [] }, { status: 500 });
  }
}
