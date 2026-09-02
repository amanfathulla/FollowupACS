// Incoming WhatsApp webhook from ustazai.my.
// Accepts flexible payload shapes (JSON, form-encoded, alternate field names),
// logs every hit for debugging, stores inbound message, updates lead status,
// cancels pending followups and triggers AI auto-reply.
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization",
} as const;
const jsonHeaders = { "Content-Type": "application/json", ...CORS };

type AnyRecord = Record<string, unknown>;

function normalizePhone(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("60")) return digits;
  if (digits.startsWith("0")) return "60" + digits.slice(1);
  return "60" + digits;
}

function mimeToMediaType(mime: string): "image" | "video" | "audio" | "document" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "application/pdf": "pdf",
  };
  return map[mime] ?? "bin";
}

async function bufferToBytes(streamData: unknown): Promise<Uint8Array | null> {
  if (streamData == null) return null;
  if (typeof streamData === "string") {
    try {
      const bin = atob(streamData);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    } catch {
      return null;
    }
  }
  if (Array.isArray(streamData)) return new Uint8Array(streamData as number[]);
  if (typeof streamData === "object" && Array.isArray((streamData as AnyRecord).data)) {
    return new Uint8Array((streamData as { data: number[] }).data);
  }
  return null;
}

// Pull a value from a payload trying several key spellings, including nested
// objects (data / payload / message / body).
function deepPick(payload: AnyRecord, keys: string[]): string {
  const wanted = keys.map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const seen = new Set<AnyRecord>();
  const walk = (obj: AnyRecord, depth: number): string => {
    if (depth > 3 || seen.has(obj)) return "";
    seen.add(obj);
    for (const [k, v] of Object.entries(obj)) {
      const nk = k.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (wanted.includes(nk) && (typeof v === "string" || typeof v === "number")) {
        const s = String(v).trim();
        if (s) return s;
      }
    }
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const found = walk(v as AnyRecord, depth + 1);
        if (found) return found;
      }
    }
    return "";
  };
  return walk(payload, 0);
}

function findMedia(payload: AnyRecord): AnyRecord | null {
  const direct = payload.media ?? (payload.data as AnyRecord | undefined)?.media;
  if (direct && typeof direct === "object") return direct as AnyRecord;
  return null;
}

async function readBody(request: Request): Promise<{ payload: AnyRecord; raw: string }> {
  const raw = await request.text();
  if (!raw) return { payload: {}, raw };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return { payload: parsed as AnyRecord, raw };
  } catch {
    /* not json */
  }
  try {
    const params = new URLSearchParams(raw);
    const obj: AnyRecord = {};
    params.forEach((v, k) => {
      obj[k] = v;
    });
    if (Object.keys(obj).length > 0) return { payload: obj, raw };
  } catch {
    /* ignore */
  }
  return { payload: {}, raw };
}

export const Route = createFileRoute("/api/public/hooks/whatsapp-webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      // Some providers ping the URL with GET to verify it exists.
      GET: async () =>
        new Response(JSON.stringify({ ok: true, hook: "whatsapp-webhook", ready: true }), {
          headers: jsonHeaders,
        }),
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { payload, raw } = await readBody(request);

        const log = async (note: string, ok = true) => {
          try {
            await supabaseAdmin.from("whatsapp_api_logs").insert({
              endpoint: "inbound:whatsapp-webhook",
              method: "POST",
              phone: deepPick(payload, ["from", "sender", "participant", "number", "phone"]) || null,
              sender: deepPick(payload, ["device", "deviceid", "senderdevice"]) || null,
              request_body: (payload && Object.keys(payload).length
                ? payload
                : { raw: raw.slice(0, 2000) }) as any,
              response_status: 200,
              response_body: note.slice(0, 4000),
              ok,
              error_message: ok ? null : note.slice(0, 500),
              duration_ms: Date.now() - startedAt,
            });
          } catch {
            /* logging must never break the hook */
          }
        };

        const deviceRaw = deepPick(payload, ["device", "deviceid", "senderdevice", "to"]);
        const fromRaw = deepPick(payload, ["from", "participant", "sender", "number", "phone", "msisdn"]);
        const waName = deepPick(payload, ["name", "pushname", "notifyname", "sendername"]);
        const ppUrl = deepPick(payload, ["ppurl", "profilepic", "profilepicurl", "avatar"]);
        const textIn = deepPick(payload, [
          "message",
          "text",
          "body",
          "content",
          "caption",
          "messagebody",
        ]);

        if (!fromRaw) {
          await log("skipped: tiada nombor penghantar dalam payload", false);
          return new Response(JSON.stringify({ ok: true, skipped: "no sender" }), {
            headers: jsonHeaders,
          });
        }

        const deviceNorm = normalizePhone(deviceRaw);
        const fromNorm = normalizePhone(fromRaw);

        // Resolve the sender (device) row; fall back to the single/first active sender.
        let senderId: string | null = null;
        let senderPhone: string | null = null;
        if (deviceNorm) {
          const { data: s } = await supabaseAdmin
            .from("whatsapp_senders")
            .select("id, phone_number")
            .eq("phone_number", deviceNorm)
            .maybeSingle();
          senderId = (s?.id as string) ?? null;
          senderPhone = (s?.phone_number as string) ?? null;
        }

        // Find lead by phone; auto-create when unknown so chats are never dropped.
        let { data: lead } = await supabaseAdmin
          .from("leads")
          .select("id, chatbot_paused, followup_status, name, assigned_sender_id")
          .eq("phone", fromNorm)
          .maybeSingle();

        if (!lead) {
          const { data: created, error: createErr } = await supabaseAdmin
            .from("leads")
            .insert({
              name: waName || `WhatsApp ${fromNorm}`,
              phone: fromNorm,
              whatsapp_name: waName || null,
              lead_type: "prospect",
              followup_status: "replied",
              notes: "Auto-dibuat dari mesej masuk WhatsApp",
              ...(senderId ? { assigned_sender_id: senderId } : {}),
            } as any)
            .select("id, chatbot_paused, followup_status, name, assigned_sender_id")
            .maybeSingle();
          if (createErr || !created) {
            await log(`gagal auto-cipta lead: ${createErr?.message ?? "unknown"}`, false);
            return new Response(JSON.stringify({ ok: true, skipped: "lead create failed" }), {
              headers: jsonHeaders,
            });
          }
          lead = created;
        }

        if (!senderId && lead.assigned_sender_id) {
          const { data: s } = await supabaseAdmin
            .from("whatsapp_senders")
            .select("id, phone_number")
            .eq("id", lead.assigned_sender_id)
            .maybeSingle();
          senderId = (s?.id as string) ?? null;
          senderPhone = (s?.phone_number as string) ?? null;
        }
        if (!senderId) {
          const { data: s } = await supabaseAdmin
            .from("whatsapp_senders")
            .select("id, phone_number")
            .eq("is_active", true)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          senderId = (s?.id as string) ?? null;
          senderPhone = (s?.phone_number as string) ?? null;
        }

        // Save WA display name / profile pic if present
        if (waName || ppUrl) {
          const patch: AnyRecord = { updated_at: new Date().toISOString() };
          if (waName) patch.whatsapp_name = waName;
          if (ppUrl) patch.whatsapp_pp_url = ppUrl;
          await supabaseAdmin.from("leads").update(patch as any).eq("id", lead.id);
        }

        // Handle media
        const media = findMedia(payload);
        let content = textIn;
        let messageType: "text" | "image" | "video" | "audio" | "document" = "text";
        let mediaUrl: string | null = null;
        if (media) {
          const mime = (media.mimetype as string) ?? "application/octet-stream";
          messageType = mimeToMediaType(mime);
          content = ((media.caption as string) ?? textIn) || "";
          const stream = media.stream as AnyRecord | undefined;
          const bytes = await bufferToBytes(stream?.data ?? media.data ?? media.base64);
          if (bytes) {
            const fileName = media.fileName as string | undefined;
            const ext = (fileName && fileName.split(".").pop()) || extFromMime(mime);
            const path = `${lead.id}/${Date.now()}.${ext}`;
            const { error: upErr } = await supabaseAdmin.storage
              .from("inbound-media")
              .upload(path, bytes, { contentType: mime, upsert: false });
            if (!upErr) mediaUrl = `inbound-media/${path}`;
          }
        }

        // Insert inbound message
        const { error: msgErr } = await supabaseAdmin.from("lead_messages").insert({
          lead_id: lead.id,
          sender_id: senderId,
          direction: "inbound",
          message_type: messageType,
          content,
          media_url: mediaUrl,
        });
        if (msgErr) await log(`gagal simpan mesej masuk: ${msgErr.message}`, false);

        // Update lead status → replied, cancel pending followups
        await supabaseAdmin
          .from("leads")
          .update({ followup_status: "replied", updated_at: new Date().toISOString() })
          .eq("id", lead.id);
        await supabaseAdmin
          .from("lead_followups")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("lead_id", lead.id)
          .eq("status", "pending");

        // AI auto-reply
        let replyNote = "inbound disimpan";
        if (lead.chatbot_paused) {
          replyNote += "; chatbot dipause untuk lead ini";
        } else if (!content) {
          replyNote += "; tiada teks untuk dibalas";
        } else if (messageType !== "text") {
          replyNote += "; mesej bukan teks, AI tidak membalas";
        } else {
          const { loadChatbotSettings, generateReply } = await import("@/lib/chatbot.server");
          const { loadCredentials, sendUstazaiMessage } = await import("@/lib/ustazai.server");
          try {
            const settings = await loadChatbotSettings();
            if (!settings?.is_active) {
              replyNote += "; chatbot tidak aktif";
            } else {
              const { data: history } = await supabaseAdmin
                .from("lead_messages")
                .select("direction, content")
                .eq("lead_id", lead.id)
                .order("created_at", { ascending: false })
                .limit(10);
              const historyTurns = (history ?? [])
                .reverse()
                .filter((h) => h.content)
                .map((h) => ({
                  role: h.direction === "inbound" ? "user" : "assistant",
                  content: h.content as string,
                }));

              const ai = await generateReply({
                settings,
                history: historyTurns.slice(0, -1) as {
                  role: "user" | "assistant";
                  content: string;
                }[],
                incoming: content,
                leadName: lead.name,
              });

              if (!ai.ok) {
                replyNote += `; AI gagal: ${ai.error}`;
              } else {
                const creds = await loadCredentials();
                if (!creds) {
                  replyNote += "; API key ustazai belum diset";
                } else {
                  let sent = 0;
                  for (const part of ai.parts) {
                    const jitter = 1500 + Math.floor(Math.random() * 2500);
                    await new Promise((r) => setTimeout(r, jitter));
                    const res = await sendUstazaiMessage({
                      credentials: creds,
                      number: fromNorm,
                      message: part,
                      senderOverride: senderPhone ?? undefined,
                      meta: { leadId: lead.id, senderId },
                    });
                    if (res.ok) {
                      sent++;
                      await supabaseAdmin.from("lead_messages").insert({
                        lead_id: lead.id,
                        sender_id: senderId,
                        direction: "outbound",
                        message_type: "text",
                        content: part,
                        provider_message_id: res.messageId,
                      });
                    } else {
                      replyNote += `; hantar gagal: ${res.error}`;
                    }
                  }
                  replyNote += `; AI balas ${sent}/${ai.parts.length} mesej`;
                }
              }
            }
          } catch (err) {
            replyNote += `; ralat chatbot: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        await log(replyNote, true);
        return new Response(JSON.stringify({ ok: true, note: replyNote }), { headers: jsonHeaders });
      },
    },
  },
});
