import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(ctx: { supabase: any; userId: string }): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin sahaja");
}

export const listSenders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_senders")
      .select(
        "id, label, phone_number, is_active, gap_seconds, daily_limit, current_lead_count, last_sent_at, created_at",
      )
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const senderStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const [sendersRes, leadsRes, sentTodayRes, activeSenders] = await Promise.all([
      context.supabase.from("whatsapp_senders").select("id, is_active, current_lead_count"),
      context.supabase.from("leads").select("id", { count: "exact", head: true }),
      context.supabase
        .from("lead_followups")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("sent_at", start.toISOString()),
      context.supabase
        .from("whatsapp_senders")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
    ]);

    const totalSenders = sendersRes.data?.length ?? 0;
    const totalActive = activeSenders.count ?? 0;
    const totalAssigned = (sendersRes.data ?? []).reduce(
      (sum: number, s: { current_lead_count: number }) => sum + (s.current_lead_count ?? 0),
      0,
    );
    return {
      totalSenders,
      totalActive,
      totalLeads: leadsRes.count ?? 0,
      totalAssigned,
      avgPerSender: totalActive > 0 ? Math.round(totalAssigned / totalActive) : 0,
      sentToday: sentTodayRes.count ?? 0,
    };
  });

const senderInput = z.object({
  label: z.string().min(1).max(120),
  phone_number: z.string().min(6).max(30),
  gap_seconds: z.number().int().min(1).max(3600).default(5),
  daily_limit: z.number().int().min(1).max(5000).default(200),
  is_active: z.boolean().default(true),
});

export const addSender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => senderInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("whatsapp_senders").insert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateSender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        label: z.string().min(1).max(120).optional(),
        phone_number: z.string().min(6).max(30).optional(),
        gap_seconds: z.number().int().min(1).max(3600).optional(),
        daily_limit: z.number().int().min(1).max(5000).optional(),
        is_active: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("whatsapp_senders")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("whatsapp_senders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkImportSenders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        rows: z
          .array(
            z.object({
              label: z.string().min(1).max(120),
              phone_number: z.string().min(6).max(30),
              gap_seconds: z.number().int().min(1).max(3600).default(5),
              daily_limit: z.number().int().min(1).max(5000).default(200),
              is_active: z.boolean().default(true),
            }),
          )
          .min(1)
          .max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error, count } = await context.supabase
      .from("whatsapp_senders")
      .insert(data.rows, { count: "exact" });
    if (error) throw new Error(error.message);
    return { ok: true, inserted: count ?? data.rows.length };
  });
