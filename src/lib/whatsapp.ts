import axios from "axios";

const GRAPH_API_VERSION = "v19.0";
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface WhatsAppTemplate {
  id: string;
  name: string;
  status: "APPROVED" | "PENDING" | "REJECTED";
  category: string;
  language: string;
  components: TemplateComponent[];
}

export interface TemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  text?: string;
  buttons?: TemplateButton[];
}

export interface TemplateButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
}

/**
 * Fetch all approved WhatsApp message templates for a WABA
 */
export async function fetchWhatsAppTemplates(): Promise<WhatsAppTemplate[]> {
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const token = process.env.META_ACCESS_TOKEN;

  if (!wabaId || !token) {
    throw new Error("WhatsApp credentials not configured");
  }

  const response = await axios.get(
    `${BASE_URL}/${wabaId}/message_templates`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { fields: "id,name,status,category,language,components", limit: 100 },
    }
  );

  const templates: WhatsAppTemplate[] = response.data.data || [];
  return templates.filter((t) => t.status === "APPROVED");
}

/**
 * Extract variable count from template body text
 * e.g. "Hello {{1}}, your order {{2}} is ready" → 2
 */
export function extractVariables(text: string): number {
  const matches = text.match(/\{\{(\d+)\}\}/g);
  if (!matches) return 0;
  const nums = matches.map((m) => parseInt(m.replace(/[{}]/g, ""), 10));
  return Math.max(...nums);
}

export interface SendMessagePayload {
  phones: string[];
  templateName: string;
  languageCode: string;
  variables: string[];
  headerVariable?: string;
}

export interface SendResult {
  phone: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send WhatsApp template messages to multiple phone numbers
 */
export async function sendWhatsAppMessages(payload: SendMessagePayload): Promise<SendResult[]> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.META_ACCESS_TOKEN;

  if (!phoneNumberId || !token) {
    throw new Error("WhatsApp credentials not configured");
  }

  const results: SendResult[] = [];

  for (const phone of payload.phones) {
    try {
      const body: Record<string, unknown> = {
        messaging_product: "whatsapp",
        to: phone.replace(/\D/g, ""), // strip non-digits
        type: "template",
        template: {
          name: payload.templateName,
          language: { code: payload.languageCode },
          components: [] as Record<string, unknown>[],
        },
      };

      const components = (body.template as Record<string, unknown>).components as Record<string, unknown>[];

      // Add body parameters if template has variables
      if (payload.variables.length > 0) {
        components.push({
          type: "body",
          parameters: payload.variables.map((v) => ({ type: "text", text: v })),
        });
      }

      // Add header variable if present (for dynamic header templates)
      if (payload.headerVariable) {
        components.unshift({
          type: "header",
          parameters: [{ type: "text", text: payload.headerVariable }],
        });
      }

      if (components.length === 0) {
        delete (body.template as Record<string, unknown>).components;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (body as any).template = {
          name: payload.templateName,
          language: { code: payload.languageCode },
        };
      }

      const response = await axios.post(
        `${BASE_URL}/${phoneNumberId}/messages`,
        body,
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );

      results.push({
        phone,
        success: true,
        messageId: response.data?.messages?.[0]?.id,
      });
    } catch (error: unknown) {
      const errMsg =
        (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ||
        (error as Error).message ||
        "Unknown error";

      results.push({ phone, success: false, error: errMsg });
    }
  }

  return results;
}
