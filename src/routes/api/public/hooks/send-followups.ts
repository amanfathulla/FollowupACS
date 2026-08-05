// Cron-invoked hourly. Sends pending followups using per-lead sender,
// respects gap_seconds & daily_limit, supports media via signed URLs,
// and tracks per-sender health (connection_status + consecutive_failures).
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization",
} as const;

const jsonHeaders = { "Content-Type": "application/json", ...CORS };

const HEALTH_THRESHOLD = 5;

export const Route = createFileRoute("/api/public/hooks/send-followups")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!expected || !provided || provided !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: jsonHeaders,
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const {
          loadCredentials,
          renderTemplate,
          sendUstazaiMessage,
          sendUstazaiMedia,
          signMediaUrl,
        } = await import("@/lib/ustazai.server");

        const { data: settings } = await supabaseAdmin
          .from("whatsapp_settings")
          .select("automation_enabled, send_timezone")
          .eq("id", 1)
          .maybeSingle();
        if (!settings?.automation_enabled) {
          return new Response(
            JSON.stringify({ ok: true, skipped: "automation disabled", sent: 0, failed: 0 }),
            { status: 200, headers: jsonHeaders },
          );
        }

        // Waktu aktif / rehat: hanya hantar dalam window hari tersebut.
        const tz = (settings as any)?.send_timezone || "Asia/Kuala_Lumpur";
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).formatToParts(new Date());
        const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
        const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
        const minutesNow = Number(get("hour")) * 60 + Number(get("minute"));
        const { data: windowRow } = await supabaseAdmin
          .from("whatsapp_send_windows")
          .select("is_enabled, start_time, end_time")
          .eq("day_of_week", dayIndex)
          .maybeSingle();
        if (windowRow) {
          const toMin = (t: string) => {
            const [h, m] = String(t).split(":");
            return Number(h) * 60 + Number(m);
          };
          const startMin = toMin(windowRow.start_time as string);
          const endMin = toMin(windowRow.end_time as string);
          const inWindow =
            startMin <= endMin
              ? minutesNow >= startMin && minutesNow < endMin
              : minutesNow >= startMin || minutesNow < endMin;
          if (!windowRow.is_enabled || !inWindow) {
            return new Response(
              JSON.stringify({
                ok: true,
                skipped: "outside active hours",
                timezone: tz,
                sent: 0,
                failed: 0,
              }),
              { status: 200, headers: jsonHeaders },
            );
          }
        }

        const creds = await loadCredentials();
        if (!creds) {
          return new Response(
            JSON.stringify({ ok: false, error: "credentials not set", sent: 0, failed: 0 }),
            { status: 200, headers: jsonHeaders },
          );
        }

        const now = new Date();
        const nowIso = now.toISOString();
        const startOfDayIso = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        ).toISOString();

        const { data: senders } = await supabaseAdmin
          .from("whatsapp_senders")
          .select(
            "id, phone_number, is_active, gap_seconds, daily_limit, last_sent_at, connection_status, consecutive_failures",
          );
        const senderMap = new Map((senders ?? []).map((s) => [s.id as string, s]));

        const dailyCounts = new Map<string, number>();
        for (const s of senders ?? []) {
          const { count } = await supabaseAdmin
            .from("lead_followups")
            .select("id", { count: "exact", head: true })
            .eq("status", "sent")
            .eq("sender_id_used", s.id)
            .gte("sent_at", startOfDayIso);
          dailyCounts.set(s.id as string, count ?? 0);
        }
        const inMemoryLastSent = new Map<string, number>();
        const senderFailures = new Map<string, number>();
        for (const s of senders ?? []) {
          if (s.last_sent_at) {
            inMemoryLastSent.set(
              s.id as string,
              new Date(s.last_sent_at as string).getTime(),
            );
          }
          senderFailures.set(s.id as string, (s.consecutive_failures as number) ?? 0);
        }

        const { data: due, error } = await supabaseAdmin
          .from("lead_followups")
          .select(
            "id, lead_id, day_offset, leads!inner(name, phone, product, car_model, whatsapp_name, notes, lead_type, followup_status, assigned_sender_id), followup_steps!inner(message_template, media_type, media_url)",
          )
          .eq("status", "pending")
          .lte("scheduled_at", nowIso)
          .order("scheduled_at", { ascending: true })
          .limit(100);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: jsonHeaders,
          });
        }

        let sent = 0;
        let failed = 0;
        let skipped = 0;
        let deferred = 0;

        for (const row of due ?? []) {
          const lead = row.leads as {
            name: string;
            phone: string;
            product: string | null;
            car_model: string | null;
            whatsapp_name: string | null;
            notes: string | null;
            lead_type: string | null;
            followup_status: string;
            assigned_sender_id: string | null;
          };

          const step = row.followup_steps as {
            message_template: string;
            media_type: string | null;
            media_url: string | null;
          };

          if (lead.followup_status !== "active") {
            await supabaseAdmin
              .from("lead_followups")
              .update({ status: "cancelled", updated_at: new Date().toISOString() })
              .eq("id", row.id);
            skipped++;
            continue;
          }

          const sender = lead.assigned_sender_id
            ? senderMap.get(lead.assigned_sender_id)
            : undefined;

          if (sender) {
            if (!sender.is_active || sender.connection_status === "disconnected") {
              skipped++;
              continue;
            }
            const usedToday = dailyCounts.get(sender.id as string) ?? 0;
            if (usedToday >= (sender.daily_limit as number)) {
              deferred++;
              continue;
            }
            const last = inMemoryLastSent.get(sender.id as string) ?? 0;
            const gapMs = (sender.gap_seconds as number) * 1000;
            const waitMs = last + gapMs - Date.now();
            if (waitMs > 0) {
              if (waitMs <= 10_000) {
                await new Promise((r) => setTimeout(r, waitMs));
              } else {
                deferred++;
                continue;
              }
            }
          }

          const message = renderTemplate(step.message_template ?? "", {
            nama: lead.name,
            telefon: lead.phone,
            produk: lead.product ?? "",
            model_kereta: lead.car_model ?? "",
            nama_whatsapp: lead.whatsapp_name ?? "",
            nota: lead.notes ?? "",
            jenis_lead: lead.lead_type ?? "",
          });


          let result;
          if (step.media_type && step.media_url) {
            const url = await signMediaUrl(step.media_url);
            if (!url) {
              await supabaseAdmin
                .from("lead_followups")
                .update({
                  status: "failed",
                  error_message: "Gagal generate signed URL",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", row.id);
              failed++;
              continue;
            }
            result = await sendUstazaiMedia({
              credentials: creds,
              number: lead.phone,
              mediaType: step.media_type as "image" | "video" | "audio" | "document",
              url,
              caption: message,
              senderOverride: sender?.phone_number as string | undefined,
            });
          } else {
            result = await sendUstazaiMessage({
              credentials: creds,
              number: lead.phone,
              message,
              senderOverride: sender?.phone_number as string | undefined,
            });
          }

          const senderId = sender?.id as string | undefined;

          if (result.ok) {
            await supabaseAdmin
              .from("lead_followups")
              .update({
                status: "sent",
                sent_at: new Date().toISOString(),
                provider_message_id: result.messageId,
                rendered_message: message,
                sender_id_used: senderId ?? null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", row.id);
            await supabaseAdmin.from("lead_messages").insert({
              lead_id: row.lead_id,
              sender_id: senderId ?? null,
              direction: "outbound",
              message_type: step.media_type ?? "text",
              content: message,
              media_url: step.media_url,
              provider_message_id: result.messageId,
            });
            if (senderId) {
              inMemoryLastSent.set(senderId, Date.now());
              dailyCounts.set(senderId, (dailyCounts.get(senderId) ?? 0) + 1);
              senderFailures.set(senderId, 0);
              await supabaseAdmin
                .from("whatsapp_senders")
                .update({
                  last_sent_at: new Date().toISOString(),
                  connection_status: "connected",
                  consecutive_failures: 0,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", senderId);
            }
            sent++;
          } else {
            await supabaseAdmin
              .from("lead_followups")
              .update({
                status: "failed",
                error_message: result.error,
                rendered_message: message,
                sender_id_used: senderId ?? null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", row.id);
            if (senderId) {
              const next = (senderFailures.get(senderId) ?? 0) + 1;
              senderFailures.set(senderId, next);
              const patch: Record<string, unknown> = {
                consecutive_failures: next,
                updated_at: new Date().toISOString(),
              };
              if (next >= HEALTH_THRESHOLD) patch.connection_status = "disconnected";
              await supabaseAdmin.from("whatsapp_senders").update(patch as any).eq("id", senderId);
            }
            failed++;
          }

          await new Promise((r) => setTimeout(r, 3000));
        }

        return new Response(
          JSON.stringify({ ok: true, sent, failed, skipped, deferred }),
          { status: 200, headers: jsonHeaders },
        );
      },
    },
  },
});
