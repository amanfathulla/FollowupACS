// Incoming WhatsApp webhook from ustazai.my.
// Payload: { device, from, name, participant, ppUrl, message, media }
// Stores inbound message in lead_messages, updates lead status, cancels pending followups,
// optionally triggers AI auto-reply.
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization",
} as const;
const jsonHeaders = { "Content-Type": "application/json", ...CORS };

type UstazaiIncoming = {
  device?: string;
  from?: string;
  name?: string;
  participant?: string;
  ppUrl?: string;
  message?: string;
  media?: {
    caption?: string;
    fileName?: string;
    stream?: { type?: string; data?: unknown };
    mimetype?: string;
  } | null;
};

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
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
    // base64
    try {
      const bin = atob(streamData);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    } catch {
      return null;
    }
  }
  if (Array.isArray(streamData)) {
    return new Uint8Array(streamData as number[]);
  }
  return null;
}

export const Route = createFileRoute("/api/public/hooks/whatsapp-webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let payload: UstazaiIncoming;
        try {
          payload = (await request.json()) as UstazaiIncoming;
        } catch {
          return new Response(JSON.stringify({ error: "invalid json" }), {
            status: 400,
            headers: jsonHeaders,
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const deviceRaw = payload.device ?? "";
        const fromRaw = payload.from ?? payload.participant ?? "";
        if (!fromRaw) {
          return new Response(JSON.stringify({ ok: true, skipped: "no sender" }), {
            headers: jsonHeaders,
          });
        }

        const deviceNorm = normalizePhone(deviceRaw);
        const fromNorm = normalizePhone(fromRaw);

        // Find sender
        let senderId: string | null = null;
        if (deviceNorm) {
          const { data: s } = await supabaseAdmin
            .from("whatsapp_senders")
            .select("id")
            .eq("phone_number", deviceNorm)
            .maybeSingle();
          senderId = (s?.id as string) ?? null;
        }

        // Find lead by phone
        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("id, chatbot_paused, followup_status, name")
          .eq("phone", fromNorm)
          .maybeSingle();

        if (!lead) {
          // Log to messages with lead_id? Skipping if no lead — could auto-create.
          return new Response(JSON.stringify({ ok: true, skipped: "no lead" }), {
            headers: jsonHeaders,
          });
        }

        // Save WA display name / profile pic if present
        if (payload.name || payload.ppUrl) {
          const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (payload.name) patch.whatsapp_name = payload.name;
          if (payload.ppUrl) patch.whatsapp_pp_url = payload.ppUrl;
          await supabaseAdmin.from("leads").update(patch as any).eq("id", lead.id);
        }

        // Handle media
        let content = payload.message ?? "";
        let messageType: "text" | "image" | "video" | "audio" | "document" = "text";
        let mediaUrl: string | null = null;
        if (payload.media) {
          const mime = payload.media.mimetype ?? "application/octet-stream";
          messageType = mimeToMediaType(mime);
          content = payload.media.caption ?? payload.message ?? "";
          const bytes = await bufferToBytes(payload.media.stream?.data);
          if (bytes) {
            const ext =
              (payload.media.fileName && payload.media.fileName.split(".").pop()) ??
              extFromMime(mime);
            const path = `${lead.id}/${Date.now()}.${ext}`;
            const { error: upErr } = await supabaseAdmin.storage
              .from("inbound-media")
              .upload(path, bytes, { contentType: mime, upsert: false });
            if (!upErr) mediaUrl = `inbound-media/${path}`;
          }
        }

        // Insert inbound message
        await supabaseAdmin.from("lead_messages").insert({
          lead_id: lead.id,
          sender_id: senderId,
          direction: "inbound",
          message_type: messageType,
          content,
          media_url: mediaUrl,
        });

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

        // Optional AI auto-reply
        if (!lead.chatbot_paused && content && messageType === "text") {
          const { loadChatbotSettings, generateReply } = await import("@/lib/chatbot.server");
          const { loadCredentials, sendUstazaiMessage } = await import("@/lib/ustazai.server");
          try {
            const settings = await loadChatbotSettings();
            if (settings?.is_active) {
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

              if (ai.ok) {
                const creds = await loadCredentials();
                if (creds && senderId) {
                  const { data: senderRow } = await supabaseAdmin
                    .from("whatsapp_senders")
                    .select("phone_number")
                    .eq("id", senderId)
                    .maybeSingle();
                  for (const part of ai.parts) {
                    const jitter = 2000 + Math.floor(Math.random() * 3000);
                    await new Promise((r) => setTimeout(r, jitter));
                    const res = await sendUstazaiMessage({
                      credentials: creds,
                      number: fromNorm,
                      message: part,
                      senderOverride: senderRow?.phone_number as string | undefined,
                    });
                    if (res.ok) {
                      await supabaseAdmin.from("lead_messages").insert({
                        lead_id: lead.id,
                        sender_id: senderId,
                        direction: "outbound",
                        message_type: "text",
                        content: part,
                        provider_message_id: res.messageId,
                      });
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.error("chatbot reply failed", err);
          }
        }

        return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
      },
    },
  },
});
