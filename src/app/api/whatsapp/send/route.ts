import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppMessages } from "@/lib/whatsapp";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { phones, templateName, languageCode, variables, headerVariable } = body;

    if (!phones || phones.length === 0) {
      return NextResponse.json({ error: "At least one phone number is required" }, { status: 400 });
    }
    if (!templateName || !languageCode) {
      return NextResponse.json({ error: "Template name and language are required" }, { status: 400 });
    }

    const results = await sendWhatsAppMessages({
      phones,
      templateName,
      languageCode,
      variables: variables || [],
      headerVariable,
    });

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      results,
      summary: { total: phones.length, success: successCount, failed: failCount },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
