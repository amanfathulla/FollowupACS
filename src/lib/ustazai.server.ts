// Server-only helpers for ustazai.my WhatsApp API.
// Never import from client-reachable modules at top-level.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type UstazaiCredentials = {
  apiKey: string;
  sender: string; // fallback sender when no per-lead sender assigned
};

export async function loadCredentials(): Promise<UstazaiCredentials | null> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_credentials")
    .select("api_key, sender_number")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.api_key || !data?.sender_number) return null;
  return { apiKey: data.api_key, sender: data.sender_number };
}

export async function saveCredentials(
  apiKey: string | null,
  sender: string | null,
  userId: string,
): Promise<void> {
  const patch = {
    updated_by: userId,
    updated_at: new Date().toISOString(),
    ...(apiKey !== null ? { api_key: apiKey } : {}),
    ...(sender !== null ? { sender_number: sender } : {}),
  };
  const { error } = await supabaseAdmin.from("whatsapp_credentials").update(patch).eq("id", 1);
  if (error) throw error;

  const { data: cred } = await supabaseAdmin
    .from("whatsapp_credentials")
    .select("api_key, sender_number")
    .eq("id", 1)
    .maybeSingle();

  await supabaseAdmin
    .from("whatsapp_settings")
    .update({
      api_key_configured: Boolean(cred?.api_key && cred?.sender_number),
      sender_number: cred?.sender_number ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("60")) return digits;
  if (digits.startsWith("0")) return "60" + digits.slice(1);
  return "60" + digits;
}

export function renderTemplate(
  template: string,
  vars: Record<string, string | null | undefined>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value == null ? "" : String(value);
  });
}

export type SendResult =
  | { ok: true; messageId: string | null; raw: unknown }
  | { ok: false; error: string; raw: unknown };

export async function sendUstazaiMessage(params: {
  credentials: UstazaiCredentials;
  number: string;
  message: string;
  senderOverride?: string | null;
}): Promise<SendResult> {
  try {
    const senderToUse = params.senderOverride?.trim() || params.credentials.sender;
    const response = await fetch("https://ustazai.my/send-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: params.credentials.apiKey,
        sender: senderToUse,
        number: params.number,
        message: params.message,
      }),
    });
    const text = await response.text();
    let raw: unknown = text;
    try {
      raw = JSON.parse(text);
    } catch {
      /* keep as text */
    }
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}`, raw };
    }
    const messageId =
      raw && typeof raw === "object" && raw !== null && "message_id" in raw
        ? String((raw as Record<string, unknown>).message_id ?? "") || null
        : null;
    return { ok: true, messageId, raw };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, raw: null };
  }
}
