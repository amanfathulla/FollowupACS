// Passive health check triggered by pg_cron every 30 min.
// Marks senders as disconnected if they haven't sent in > 2h AND had recent failures.
// (Active generate-qr ping is skipped by default to avoid disconnecting healthy devices.)
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization",
} as const;
const jsonHeaders = { "Content-Type": "application/json", ...CORS };

export const Route = createFileRoute("/api/public/hooks/check-sender-status")({
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
        const { data: senders } = await supabaseAdmin
          .from("whatsapp_senders")
          .select("id, consecutive_failures, connection_status, is_active");

        let flagged = 0;
        for (const s of senders ?? []) {
          if ((s.consecutive_failures as number) >= 5 && s.connection_status !== "disconnected") {
            await supabaseAdmin
              .from("whatsapp_senders")
              .update({
                connection_status: "disconnected",
                last_checked_at: new Date().toISOString(),
              })
              .eq("id", s.id);
            flagged++;
          } else {
            await supabaseAdmin
              .from("whatsapp_senders")
              .update({ last_checked_at: new Date().toISOString() })
              .eq("id", s.id);
          }
        }

        return new Response(JSON.stringify({ ok: true, flagged }), { headers: jsonHeaders });
      },
    },
  },
});
