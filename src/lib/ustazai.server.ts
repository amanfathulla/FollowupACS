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
  if (!data?.api_key) return null;
  return { apiKey: data.api_key, sender: data.sender_number ?? "" };
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
      api_key_configured: Boolean(cred?.api_key),
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

type LogMeta = {
  phone?: string | null;
  sender?: string | null;
  leadId?: string | null;
  followupId?: string | null;
  senderId?: string | null;
};

async function logApiCall(entry: {
  endpoint: string;
  method: string;
  request_body: Record<string, unknown>;
  response_status: number | null;
  response_body: string;
  ok: boolean;
  error_message: string | null;
  duration_ms: number;
  meta: LogMeta;
}) {
  const redacted: Record<string, unknown> = { ...entry.request_body };
  if (typeof redacted.api_key === "string") {
    const k = redacted.api_key as string;
    redacted.api_key = `${k.slice(0, 4)}…(len:${k.length})`;
  }
  // eslint-disable-next-line no-console
  console.log("[ustazai]", {
    endpoint: entry.endpoint,
    status: entry.response_status,
    ok: entry.ok,
    duration_ms: entry.duration_ms,
    request: redacted,
    response: entry.response_body.slice(0, 500),
    meta: entry.meta,
  });
  try {
    await supabaseAdmin.from("whatsapp_api_logs").insert({
      endpoint: entry.endpoint,
      method: entry.method,
      phone: entry.meta.phone ?? null,
      sender: entry.meta.sender ?? null,
      request_body: redacted as any,
      response_status: entry.response_status,
      response_body: entry.response_body.slice(0, 4000),
      ok: entry.ok,
      error_message: entry.error_message,
      lead_id: entry.meta.leadId ?? null,
      followup_id: entry.meta.followupId ?? null,
      sender_id: entry.meta.senderId ?? null,
      duration_ms: entry.duration_ms,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ustazai] failed to persist log", err);
  }
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
  meta: LogMeta = {},
): Promise<SendResult> {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let raw: unknown = text;
    try {
      raw = JSON.parse(text);
    } catch {
      /* keep as text */
    }
    const duration = Date.now() - startedAt;
    if (!response.ok) {
      const error = `HTTP ${response.status}: ${text.slice(0, 300)}`;
      await logApiCall({
        endpoint: url,
        method: "POST",
        request_body: body,
        response_status: response.status,
        response_body: text,
        ok: false,
        error_message: error,
        duration_ms: duration,
        meta,
      });
      return { ok: false, error, raw };
    }
    const messageId =
      raw && typeof raw === "object" && raw !== null && "message_id" in raw
        ? String((raw as Record<string, unknown>).message_id ?? "") || null
        : null;
    await logApiCall({
      endpoint: url,
      method: "POST",
      request_body: body,
      response_status: response.status,
      response_body: text,
      ok: true,
      error_message: null,
      duration_ms: duration,
      meta,
    });
    return { ok: true, messageId, raw };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logApiCall({
      endpoint: url,
      method: "POST",
      request_body: body,
      response_status: null,
      response_body: message,
      ok: false,
      error_message: message,
      duration_ms: Date.now() - startedAt,
      meta,
    });
    return { ok: false, error: message, raw: null };
  }
}

export async function sendUstazaiMessage(params: {
  credentials: UstazaiCredentials;
  number: string;
  message: string;
  senderOverride?: string | null;
  meta?: LogMeta;
}): Promise<SendResult> {
  const senderToUse = params.senderOverride?.trim() || params.credentials.sender;
  return postJson(
    "https://ustazai.my/send-message",
    {
      api_key: params.credentials.apiKey,
      sender: senderToUse,
      number: params.number,
      message: params.message,
    },
    { ...(params.meta ?? {}), phone: params.number, sender: senderToUse },
  );
}

export async function sendUstazaiMedia(params: {
  credentials: UstazaiCredentials;
  number: string;
  mediaType: "image" | "video" | "audio" | "document";
  url: string;
  caption?: string;
  senderOverride?: string | null;
  meta?: LogMeta;
}): Promise<SendResult> {
  const senderToUse = params.senderOverride?.trim() || params.credentials.sender;
  const body: Record<string, unknown> = {
    api_key: params.credentials.apiKey,
    sender: senderToUse,
    number: params.number,
    media_type: params.mediaType,
    url: params.url,
  };
  if (params.caption && params.caption.trim()) body.caption = params.caption;
  return postJson("https://ustazai.my/send-media", body, {
    ...(params.meta ?? {}),
    phone: params.number,
    sender: senderToUse,
  });
}

export async function generateQrCode(params: {
  credentials: UstazaiCredentials;
  device: string;
  force?: boolean;
}): Promise<{
  status: "processing" | "qrcode" | "connected" | "unknown";
  qrcode: string | null;
  raw: unknown;
}> {
  try {
    const resp = await fetch("https://ustazai.my/generate-qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: params.credentials.apiKey,
        device: params.device,
        force: params.force ?? true,
      }),
    });
    const text = await resp.text();
    let raw: unknown = text;
    try {
      raw = JSON.parse(text);
    } catch {
      /* keep as text */
    }
    const obj =
      raw && typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    const msg = (obj.message ?? obj.msg ?? "") as string;
    if (typeof msg === "string" && /connected/i.test(msg)) {
      return { status: "connected", qrcode: null, raw };
    }
    if (obj.status === "processing" || /processing/i.test(String(obj.status ?? ""))) {
      return { status: "processing", qrcode: null, raw };
    }
    if (typeof obj.qrcode === "string") {
      return { status: "qrcode", qrcode: obj.qrcode, raw };
    }
    return { status: "unknown", qrcode: null, raw };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "unknown", qrcode: null, raw: { error: message } };
  }
}

export async function logoutDevice(params: {
  credentials: UstazaiCredentials;
  sender: string;
}): Promise<{ ok: boolean; raw: unknown }> {
  try {
    const resp = await fetch("https://ustazai.my/logout-device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: params.credentials.apiKey, sender: params.sender }),
    });
    const text = await resp.text();
    let raw: unknown = text;
    try {
      raw = JSON.parse(text);
    } catch {
      /* keep as text */
    }
    const obj = raw && typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    return { ok: obj.status === true || resp.ok, raw };
  } catch (err) {
    return { ok: false, raw: { error: err instanceof Error ? err.message : String(err) } };
  }
}

// Create a short-lived signed URL for a private storage object so ustazai
// can fetch it as a direct link.
export async function signMediaUrl(mediaPath: string, expiresIn = 60 * 60): Promise<string | null> {
  // media_url stored can be either a full URL (external) or "bucket/path"
  if (/^https?:\/\//i.test(mediaPath)) return mediaPath;
  const [bucket, ...rest] = mediaPath.split("/");
  const path = rest.join("/");
  if (!bucket || !path) return null;
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}
