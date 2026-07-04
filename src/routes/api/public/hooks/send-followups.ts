// Called by pg_cron every hour. Iterates pending followups and sends via ustazai.my
// using the per-lead assigned sender (with gap_seconds and daily_limit enforcement).
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization",
} as const;

const jsonHeaders = { "Content-Type": "application/json", ...CORS };

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
        const { loadCredentials, renderTemplate, sendUstazaiMessage } = await import(
          "@/lib/ustazai.server"
        );

        const { data: settings } = await supabaseAdmin
          .from("whatsapp_settings")
          .select("automation_enabled")
          .eq("id", 1)
          .maybeSingle();
        if (!settings?.automation_enabled) {
          return new Response(
            JSON.stringify({ ok: true, skipped: "automation disabled", sent: 0, failed: 0 }),
            { status: 200, headers: jsonHeaders },
          );
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
        const startOfDayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

        // Load all active senders once
        const { data: senders } = await supabaseAdmin
          .from("whatsapp_senders")
          .select("id, phone_number, is_active, gap_seconds, daily_limit, last_sent_at");
        const senderMap = new Map(
          (senders ?? []).map((s) => [s.id as string, s]),
        );

        // Pre-compute today's sent counts per sender
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
        // Track last-sent times in-memory to enforce gap across this batch
        const inMemoryLastSent = new Map<string, number>();
        for (const s of senders ?? []) {
          if (s.last_sent_at) {
            inMemoryLastSent.set(
              s.id as string,
              new Date(s.last_sent_at as string).getTime(),
            );
          }
        }

        const { data: due, error } = await supabaseAdmin
          .from("lead_followups")
          .select(
            "id, lead_id, day_offset, leads!inner(name, phone, product, followup_status, assigned_sender_id), followup_steps!inner(message_template)",
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
            followup_status: string;
            assigned_sender_id: string | null;
          };
          const step = row.followup_steps as { message_template: string };

          if (lead.followup_status !== "active") {
            await supabaseAdmin
              .from("lead_followups")
              .update({ status: "cancelled", updated_at: new Date().toISOString() })
              .eq("id", row.id);
            skipped++;
            continue;
          }

          // Resolve sender for this lead
          const sender = lead.assigned_sender_id
            ? senderMap.get(lead.assigned_sender_id)
            : undefined;

          // Skip if lead has an inactive sender assigned
          if (sender && !sender.is_active) {
            skipped++;
            continue;
          }

          // Enforce daily limit
          if (sender) {
            const usedToday = dailyCounts.get(sender.id as string) ?? 0;
            if (usedToday >= (sender.daily_limit as number)) {
              deferred++;
              continue;
            }
            // Enforce gap
            const last = inMemoryLastSent.get(sender.id as string) ?? 0;
            const gapMs = (sender.gap_seconds as number) * 1000;
            const waitMs = last + gapMs - Date.now();
            if (waitMs > 0) {
              // Small waits (<10s) sleep inline; larger defer to next tick
              if (waitMs <= 10_000) {
                await new Promise((r) => setTimeout(r, waitMs));
              } else {
                deferred++;
                continue;
              }
            }
          }

          const message = renderTemplate(step.message_template, {
            nama: lead.name,
            produk: lead.product ?? "",
          });

          const result = await sendUstazaiMessage({
            credentials: creds,
            number: lead.phone,
            message,
            senderOverride: sender?.phone_number as string | undefined,
          });

          if (result.ok) {
            const senderId = sender?.id as string | undefined;
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
            if (senderId) {
              inMemoryLastSent.set(senderId, Date.now());
              dailyCounts.set(senderId, (dailyCounts.get(senderId) ?? 0) + 1);
              await supabaseAdmin
                .from("whatsapp_senders")
                .update({ last_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
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
                sender_id_used: (sender?.id as string | undefined) ?? null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", row.id);
            failed++;
          }

          // Baseline 3s delay to avoid spam detection
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
