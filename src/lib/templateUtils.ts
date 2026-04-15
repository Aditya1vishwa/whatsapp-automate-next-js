/**
 * Client-safe utility to extract variable count from WhatsApp template body text.
 * e.g. "Hello {{1}}, your order {{2}} is ready" → 2
 */
export function extractVariables(text: string): number {
  const matches = text.match(/\{\{(\d+)\}\}/g);
  if (!matches) return 0;
  const nums = matches.map((m) => parseInt(m.replace(/[{}]/g, ""), 10));
  return Math.max(...nums);
}
