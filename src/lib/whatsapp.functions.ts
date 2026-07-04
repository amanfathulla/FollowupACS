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

// ---------- Session / role ----------

export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const roles = (data ?? []).map((r: { role: string }) => r.role);
    return {
      userId: context.userId,
      email: (context.claims?.email as string | undefined) ?? null,
      roles,
      isAdmin: roles.includes("admin"),
      isStaff: roles.includes("staff") || roles.includes("admin"),
    };
  });

// ---------- Sequences & steps ----------

export const listSequences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("followup_sequences")
      .select("id, name, description, is_active, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sequenceId: string }) =>
    z.object({ sequenceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("followup_steps")
      .select("id, sequence_id, step_order, day_offset, message_template")
      .eq("sequence_id", data.sequenceId)
      .order("step_order", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; message_template: string; day_offset?: number }) =>
    z
      .object({
        id: z.string().uuid(),
        message_template: z.string().min(1).max(4000),
        day_offset: z.number().int().min(0).max(365).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const patch = {
      message_template: data.message_template,
      updated_at: new Date().toISOString(),
      ...(data.day_offset !== undefined ? { day_offset: data.day_offset } : {}),
    };
    const { error } = await context.supabase.from("followup_steps").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sequenceId: string; day_offset: number; message_template: string }) =>
    z
      .object({
        sequenceId: z.string().uuid(),
        day_offset: z.number().int().min(0).max(365),
        message_template: z.string().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { data: last } = await context.supabase
      .from("followup_steps")
      .select("step_order")
      .eq("sequence_id", data.sequenceId)
      .order("step_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (last?.step_order ?? 0) + 1;
    const { error } = await context.supabase.from("followup_steps").insert({
      sequence_id: data.sequenceId,
      step_order: nextOrder,
      day_offset: data.day_offset,
      message_template: data.message_template,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("followup_steps").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Leads ----------

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select("id, name, phone, product, followup_status, created_at, followup_sequence_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; phone: string; product?: string; notes?: string }) =>
    z
      .object({
        name: z.string().min(1).max(120),
        phone: z.string().min(6).max(30),
        product: z.string().max(120).optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("leads")
      .insert({
        name: data.name,
        phone: data.phone,
        product: data.product ?? null,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const bulkImportLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        rows: z
          .array(
            z.object({
              name: z.string().min(1).max(120),
              phone: z.string().min(6).max(30),
              product: z.string().max(120).optional().nullable(),
              notes: z.string().max(2000).optional().nullable(),
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const payload = data.rows.map((r) => ({
      name: r.name,
      phone: r.phone,
      product: r.product ?? null,
      notes: r.notes ?? null,
      created_by: context.userId,
    }));
    const { error, count } = await context.supabase
      .from("leads")
      .insert(payload, { count: "exact" });
    if (error) throw new Error(error.message);
    return { ok: true, inserted: count ?? payload.length };
  });

export const updateLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "active" | "replied" | "converted" | "stopped" }) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["active", "replied", "converted", "stopped"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ followup_status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Followups ----------

export const listFollowups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { statusFilter?: string; limit?: number }) =>
    z
      .object({
        statusFilter: z.enum(["all", "pending", "sent", "failed", "cancelled"]).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("lead_followups")
      .select(
        "id, lead_id, status, scheduled_at, sent_at, step_order, day_offset, error_message, leads!inner(name, phone, followup_status)",
      )
      .order("scheduled_at", { ascending: true })
      .limit(data.limit ?? 200);
    if (data.statusFilter && data.statusFilter !== "all") {
      q = q.eq("status", data.statusFilter);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const todayStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const range = [start.toISOString(), end.toISOString()] as const;

    const [sentToday, scheduledToday, pendingAll, leadsCount] = await Promise.all([
      context.supabase
        .from("lead_followups")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("sent_at", range[0])
        .lte("sent_at", range[1]),
      context.supabase
        .from("lead_followups")
        .select("id", { count: "exact", head: true })
        .gte("scheduled_at", range[0])
        .lte("scheduled_at", range[1]),
      context.supabase
        .from("lead_followups")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      context.supabase.from("leads").select("id", { count: "exact", head: true }),
    ]);

    return {
      sentToday: sentToday.count ?? 0,
      scheduledToday: scheduledToday.count ?? 0,
      pendingTotal: pendingAll.count ?? 0,
      leadsTotal: leadsCount.count ?? 0,
    };
  });

export const cancelFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("lead_followups")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Manual "send now" for one followup row
export const sendFollowupNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadCredentials, renderTemplate, sendUstazaiMessage } = await import(
      "./ustazai.server"
    );

    const { data: fu, error } = await supabaseAdmin
      .from("lead_followups")
      .select(
        "id, status, lead_id, day_offset, leads!inner(name, phone, product, followup_status), followup_steps!inner(message_template)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!fu) throw new Error("Followup tidak dijumpai");
    const lead = fu.leads as { name: string; phone: string; product: string | null; followup_status: string };
    const step = fu.followup_steps as { message_template: string };
    if (lead.followup_status !== "active") throw new Error("Lead bukan status aktif");

    const creds = await loadCredentials();
    if (!creds) throw new Error("API ustazai.my belum disetkan");

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
        .eq("id", fu.id);
      return { ok: true };
    }
    await supabaseAdmin
      .from("lead_followups")
      .update({
        status: "failed",
        error_message: result.error,
        rendered_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fu.id);
    throw new Error(result.error);
  });

// ---------- Settings & credentials ----------

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_settings")
      .select("automation_enabled, sender_number, api_key_configured, updated_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (
      data ?? {
        automation_enabled: false,
        sender_number: null,
        api_key_configured: false,
        updated_at: null,
      }
    );
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { automation_enabled?: boolean; sender_number?: string | null }) =>
    z
      .object({
        automation_enabled: z.boolean().optional(),
        sender_number: z.string().min(6).max(30).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const patch = {
      updated_at: new Date().toISOString(),
      ...(data.automation_enabled !== undefined
        ? { automation_enabled: data.automation_enabled }
        : {}),
      ...(data.sender_number !== undefined ? { sender_number: data.sender_number } : {}),
    };
    const { error } = await context.supabase.from("whatsapp_settings").update(patch).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { apiKey?: string | null; sender?: string | null }) =>
    z
      .object({
        apiKey: z.string().min(4).max(500).nullable().optional(),
        sender: z.string().min(6).max(30).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { saveCredentials } = await import("./ustazai.server");
    await saveCredentials(data.apiKey ?? null, data.sender ?? null, context.userId);
    return { ok: true };
  });

export const testConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { number: string; message?: string }) =>
    z
      .object({
        number: z.string().min(6).max(30),
        message: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { loadCredentials, normalizePhone, sendUstazaiMessage } = await import(
      "./ustazai.server"
    );
    const creds = await loadCredentials();
    if (!creds) throw new Error("API ustazai.my belum disetkan");
    const result = await sendUstazaiMessage({
      credentials: creds,
      number: normalizePhone(data.number),
      message: data.message ?? "Test mesej dari ACS CRM ✅",
    });
    if (!result.ok) throw new Error(result.error);
    return { ok: true, messageId: result.messageId };
  });
