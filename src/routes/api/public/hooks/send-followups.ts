// Called by pg_cron every hour. Iterates pending followups and sends via ustazai.my.
// Auth: apikey header must equal the Supabase publishable key (already scoped
// to this project). Because /api/public/* bypasses edge auth, we still verify.
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization",
} as const;

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
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { loadCredentials, renderTemplate, sendUstazaiMessage } = await import(
          "@/lib/ustazai.server"
        );

        // Check automation switch
        const { data: settings } = await supabaseAdmin
          .from("whatsapp_settings")
          .select("automation_enabled")
          .eq("id", 1)
          .maybeSingle();
        if (!settings?.automation_enabled) {
          return new Response(
            JSON.stringify({ ok: true, skipped: "automation disabled", sent: 0, failed: 0 }),
            { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
          );
        }

        const creds = await loadCredentials();
        if (!creds) {
          return new Response(
            JSON.stringify({ ok: false, error: "credentials not set", sent: 0, failed: 0 }),
            { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
          );
        }

        const now = new Date().toISOString();
        const { data: due, error } = await supabaseAdmin
          .from("lead_followups")
          .select(
            "id, lead_id, day_offset, leads!inner(name, phone, product, followup_status), followup_steps!inner(message_template)",
          )
          .eq("status", "pending")
          .lte("scheduled_at", now)
          .order("scheduled_at", { ascending: true })
          .limit(50);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        let sent = 0;
        let failed = 0;
        let skipped = 0;

        for (const row of due ?? []) {
          const lead = row.leads as {
            name: string;
            phone: string;
            product: string | null;
            followup_status: string;
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

          const message = renderTemplate(step.message_template, {
            nama: lead.name,
            produk: lead.product ?? "",
          });

          const result = await sendUstazaiMessage({
            credentials: creds,
            number: lead.phone,
            message,
          });

          if (result.ok) {
            await supabaseAdmin
              .from("lead_followups")
              .update({
                status: "sent",
                sent_at: new Date().toISOString(),
                provider_message_id: result.messageId,
                rendered_message: message,
                updated_at: new Date().toISOString(),
              })
              .eq("id", row.id);
            sent++;
          } else {
            await supabaseAdmin
              .from("lead_followups")
              .update({
                status: "failed",
                error_message: result.error,
                rendered_message: message,
                updated_at: new Date().toISOString(),
              })
              .eq("id", row.id);
            failed++;
          }

          // 3s delay to avoid spam detection
          await new Promise((r) => setTimeout(r, 3000));
        }

        return new Response(JSON.stringify({ ok: true, sent, failed, skipped }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS },
        });
      },
    },
  },
});
