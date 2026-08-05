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
      .select("id, name, description, is_active, category, created_at")
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
      .select("id, sequence_id, step_order, day_offset, message_template, media_type, media_url")
      .eq("sequence_id", data.sequenceId)
      .order("step_order", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const mediaTypeSchema = z.enum(["image", "video", "audio", "document"]).nullable().optional();

export const updateStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string;
      message_template: string;
      day_offset?: number;
      media_type?: "image" | "video" | "audio" | "document" | null;
      media_url?: string | null;
    }) =>
      z
        .object({
          id: z.string().uuid(),
          message_template: z.string().min(0).max(4000),
          day_offset: z.number().int().min(0).max(365).optional(),
          media_type: mediaTypeSchema,
          media_url: z.string().max(500).nullable().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const patch: Record<string, unknown> = {
      message_template: data.message_template,
      updated_at: new Date().toISOString(),
    };
    if (data.day_offset !== undefined) patch.day_offset = data.day_offset;
    if (data.media_type !== undefined) patch.media_type = data.media_type;
    if (data.media_url !== undefined) patch.media_url = data.media_url;
    const { error } = await context.supabase.from("followup_steps").update(patch as any).eq("id", data.id);
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
    const { data: created, error } = await context.supabase
      .from("followup_steps")
      .insert({
        sequence_id: data.sequenceId,
        step_order: nextOrder,
        day_offset: data.day_offset,
        message_template: data.message_template,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
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
      .select(
        "id, name, phone, product, car_model, lead_type, followup_status, created_at, followup_sequence_id, assigned_sender_id, whatsapp_senders(label, phone_number)",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const leadTypeSchema = z.enum(["prospect", "converted"]);

export const createLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      name: string;
      phone: string;
      product?: string;
      car_model?: string;
      notes?: string;
      lead_type?: "prospect" | "converted";
      assigned_sender_id?: string | null;
    }) =>
      z
        .object({
          name: z.string().min(1).max(120),
          phone: z.string().min(6).max(30),
          product: z.string().max(120).optional().nullable(),
          car_model: z.string().max(120).optional().nullable(),
          notes: z.string().max(2000).optional().nullable(),
          lead_type: leadTypeSchema.optional(),
          assigned_sender_id: z.string().uuid().nullable().optional(),
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
        car_model: data.car_model ?? null,
        notes: data.notes ?? null,
        lead_type: data.lead_type ?? "prospect",
        assigned_sender_id: data.assigned_sender_id ?? null,
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
        lead_type: leadTypeSchema.optional(),
        assigned_sender_id: z.string().uuid().nullable().optional(),
        rows: z
          .array(
            z.object({
              name: z.string().min(1).max(120),
              phone: z.string().min(6).max(30),
              product: z.string().max(120).optional().nullable(),
              car_model: z.string().max(120).optional().nullable(),
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
      car_model: r.car_model ?? null,
      notes: r.notes ?? null,
      lead_type: data.lead_type ?? "prospect",
      assigned_sender_id: data.assigned_sender_id ?? null,
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

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; name?: string; phone?: string; product?: string | null; car_model?: string | null; lead_type?: "prospect" | "converted"; assigned_sender_id?: string | null }) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        phone: z.string().min(6).max(30).optional(),
        product: z.string().max(120).nullable().optional(),
        car_model: z.string().max(120).nullable().optional(),
        lead_type: leadTypeSchema.optional(),
        assigned_sender_id: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )

  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("leads")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("leads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Followup Board (grouped by lead per sender) ----------

export const getFollowupBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { senderId: string }) =>
    z.object({ senderId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const [senderRes, leadsRes, sentTodayRes, pendingRes, activeLeadsRes] = await Promise.all([
      context.supabase
        .from("whatsapp_senders")
        .select("id, label, phone_number, connection_status, is_active")
        .eq("id", data.senderId)
        .maybeSingle(),
      context.supabase
        .from("leads")
        .select(
          "id, name, phone, product, followup_status, created_at, lead_followups(id, day_offset, status, scheduled_at, sent_at, rendered_message, error_message)",
        )
        .eq("assigned_sender_id", data.senderId)
        .order("created_at", { ascending: false })
        .limit(500),
      context.supabase
        .from("lead_followups")
        .select("id, leads!inner(assigned_sender_id)", { count: "exact", head: true })
        .eq("status", "sent")
        .eq("leads.assigned_sender_id", data.senderId)
        .gte("sent_at", start.toISOString())
        .lte("sent_at", end.toISOString()),
      context.supabase
        .from("lead_followups")
        .select("id, leads!inner(assigned_sender_id)", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("leads.assigned_sender_id", data.senderId),
      context.supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("assigned_sender_id", data.senderId)
        .eq("followup_status", "active"),
    ]);

    if (senderRes.error) throw new Error(senderRes.error.message);
    if (leadsRes.error) throw new Error(leadsRes.error.message);

    return {
      sender: senderRes.data,
      summary: {
        sentToday: sentTodayRes.count ?? 0,
        pending: pendingRes.count ?? 0,
        activeLeads: activeLeadsRes.count ?? 0,
      },
      leads: leadsRes.data ?? [],
    };
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

export const getSchedulerInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const now = new Date();
    const oneHour = new Date(now.getTime() + 60 * 60 * 1000);

    const [nextHourRes, overdueRes, nextRowRes] = await Promise.all([
      context.supabase
        .from("lead_followups")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .gte("scheduled_at", now.toISOString())
        .lte("scheduled_at", oneHour.toISOString()),
      context.supabase
        .from("lead_followups")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .lt("scheduled_at", now.toISOString()),
      context.supabase
        .from("lead_followups")
        .select("scheduled_at")
        .eq("status", "pending")
        .gte("scheduled_at", now.toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    const serverTz =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const serverOffsetMin = -now.getTimezoneOffset();
    const sign = serverOffsetMin >= 0 ? "+" : "-";
    const abs = Math.abs(serverOffsetMin);
    const offsetLabel = `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;

    return {
      serverTimezone: serverTz,
      serverOffsetLabel: offsetLabel,
      displayTimezone: "Asia/Kuala_Lumpur",
      serverNowIso: now.toISOString(),
      nextHourIso: oneHour.toISOString(),
      scheduledNextHour: nextHourRes.count ?? 0,
      overduePending: overdueRes.count ?? 0,
      nextScheduledAt: (nextRowRes.data?.scheduled_at as string | null) ?? null,
    };
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
    const { loadCredentials, renderTemplate, sendUstazaiMessage, sendUstazaiMedia, signMediaUrl } =
      await import("./ustazai.server");

    const { data: fu, error } = await supabaseAdmin
      .from("lead_followups")
      .select(
        "id, status, lead_id, day_offset, leads!inner(name, phone, product, followup_status, assigned_sender_id), followup_steps!inner(message_template, media_type, media_url)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!fu) throw new Error("Followup tidak dijumpai");
    const lead = fu.leads as {
      name: string;
      phone: string;
      product: string | null;
      followup_status: string;
      assigned_sender_id: string | null;
    };
    const step = fu.followup_steps as {
      message_template: string;
      media_type: string | null;
      media_url: string | null;
    };
    if (lead.followup_status !== "active") throw new Error("Lead bukan status aktif");

    const creds = await loadCredentials();
    if (!creds) throw new Error("API ustazai.my belum disetkan");

    let senderPhone: string | undefined;
    if (lead.assigned_sender_id) {
      const { data: s } = await supabaseAdmin
        .from("whatsapp_senders")
        .select("phone_number")
        .eq("id", lead.assigned_sender_id)
        .maybeSingle();
      senderPhone = s?.phone_number as string | undefined;
    }

    const message = renderTemplate(step.message_template ?? "", {
      nama: lead.name,
      produk: lead.product ?? "",
    });

    let result;
    if (step.media_type && step.media_url) {
      const url = await signMediaUrl(step.media_url);
      if (!url) throw new Error("Gagal generate signed URL untuk media");
      result = await sendUstazaiMedia({
        credentials: creds,
        number: lead.phone,
        mediaType: step.media_type as "image" | "video" | "audio" | "document",
        url,
        caption: message,
        senderOverride: senderPhone,
      });
    } else {
      result = await sendUstazaiMessage({
        credentials: creds,
        number: lead.phone,
        message,
        senderOverride: senderPhone,
      });
    }

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
      await supabaseAdmin.from("lead_messages").insert({
        lead_id: lead && (fu.lead_id as string),
        sender_id: lead.assigned_sender_id,
        direction: "outbound",
        message_type: step.media_type ?? "text",
        content: message,
        media_url: step.media_url,
        provider_message_id: result.messageId,
      });
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
      .select("automation_enabled, sender_number, api_key_configured, send_timezone, updated_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (
      data ?? {
        automation_enabled: false,
        sender_number: null,
        api_key_configured: false,
        send_timezone: "Asia/Kuala_Lumpur",
        updated_at: null,
      }
    );
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      automation_enabled?: boolean;
      sender_number?: string | null;
      send_timezone?: string;
    }) =>
    z
      .object({
        automation_enabled: z.boolean().optional(),
        sender_number: z.string().min(6).max(30).nullable().optional(),
        send_timezone: z.string().min(3).max(64).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.automation_enabled !== undefined) patch.automation_enabled = data.automation_enabled;
    if (data.sender_number !== undefined) patch.sender_number = data.sender_number;
    if (data.send_timezone !== undefined) patch.send_timezone = data.send_timezone;
    const { error } = await context.supabase.from("whatsapp_settings").update(patch as any).eq("id", 1);
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
  .inputValidator((d: { number: string; message?: string; senderId?: string | null }) =>
    z
      .object({
        number: z.string().min(6).max(30),
        message: z.string().max(500).optional(),
        senderId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadCredentials, normalizePhone, sendUstazaiMessage } = await import(
      "./ustazai.server"
    );
    const creds = await loadCredentials();
    if (!creds) throw new Error("API ustazai.my belum disetkan");

    // Pick sender phone: explicit -> first active connected -> creds.sender
    let senderPhone: string | undefined;
    let senderIdUsed: string | null = null;
    if (data.senderId) {
      const { data: s } = await supabaseAdmin
        .from("whatsapp_senders")
        .select("id, phone_number")
        .eq("id", data.senderId)
        .maybeSingle();
      senderPhone = s?.phone_number as string | undefined;
      senderIdUsed = (s?.id as string | undefined) ?? null;
    }
    if (!senderPhone) {
      const { data: s } = await supabaseAdmin
        .from("whatsapp_senders")
        .select("id, phone_number")
        .eq("is_active", true)
        .eq("connection_status", "connected")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      senderPhone = s?.phone_number as string | undefined;
      senderIdUsed = (s?.id as string | undefined) ?? null;
    }

    const result = await sendUstazaiMessage({
      credentials: creds,
      number: normalizePhone(data.number),
      message: data.message ?? "Test mesej dari ACS CRM ✅",
      senderOverride: senderPhone,
      meta: { senderId: senderIdUsed },
    });
    if (!result.ok) throw new Error(result.error);
    return { ok: true, messageId: result.messageId, senderUsed: senderPhone ?? null };
  });

// ---------- Live Chat ----------

// List conversations (one row per lead who has messages), optionally filtered by sender.
export const listConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { senderId?: string | null }) =>
    z.object({ senderId: z.string().uuid().nullable().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    // Fetch recent messages then aggregate client-side per lead
    let q = context.supabase
      .from("lead_messages")
      .select(
        "id, lead_id, sender_id, direction, content, message_type, is_read, created_at, leads!inner(name, phone, whatsapp_name, whatsapp_pp_url, followup_status, assigned_sender_id)",
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data.senderId) q = q.eq("sender_id", data.senderId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const grouped = new Map<string, any>();
    for (const r of rows ?? []) {
      if (!grouped.has(r.lead_id)) {
        grouped.set(r.lead_id, {
          lead_id: r.lead_id,
          lead: r.leads,
          last_message: r,
          unread_count: 0,
        });
      }
      const g = grouped.get(r.lead_id)!;
      if (r.direction === "inbound" && !r.is_read) g.unread_count += 1;
    }
    return Array.from(grouped.values());
  });

export const listLeadMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) =>
    z.object({ leadId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("lead_messages")
      .select(
        "id, lead_id, sender_id, direction, content, message_type, media_url, created_at, provider_message_id",
      )
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    // Mark inbound as read
    await context.supabase
      .from("lead_messages")
      .update({ is_read: true })
      .eq("lead_id", data.leadId)
      .eq("direction", "inbound")
      .eq("is_read", false);
    return rows ?? [];
  });

export const sendManualReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string; message: string }) =>
    z
      .object({
        leadId: z.string().uuid(),
        message: z.string().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadCredentials, sendUstazaiMessage } = await import("./ustazai.server");
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, name, phone, assigned_sender_id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (!lead) throw new Error("Lead tidak dijumpai");
    const creds = await loadCredentials();
    if (!creds) throw new Error("API ustazai.my belum disetkan");
    let senderPhone: string | undefined;
    if (lead.assigned_sender_id) {
      const { data: s } = await supabaseAdmin
        .from("whatsapp_senders")
        .select("phone_number")
        .eq("id", lead.assigned_sender_id)
        .maybeSingle();
      senderPhone = s?.phone_number as string | undefined;
    }
    const result = await sendUstazaiMessage({
      credentials: creds,
      number: lead.phone as string,
      message: data.message,
      senderOverride: senderPhone,
    });
    if (!result.ok) throw new Error(result.error);
    await supabaseAdmin.from("lead_messages").insert({
      lead_id: lead.id,
      sender_id: lead.assigned_sender_id,
      direction: "outbound",
      message_type: "text",
      content: data.message,
      provider_message_id: result.messageId,
    });
    // Human takeover: pause chatbot for this lead
    await supabaseAdmin.from("leads").update({ chatbot_paused: true }).eq("id", lead.id);
    return { ok: true };
  });

// ---------- Media upload helpers ----------

// Sign an upload for followup-media via admin client (staff RLS already allows).
export const listSendersLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("whatsapp_senders")
      .select("id, label, phone_number, is_active, connection_status")
      .order("created_at");
    return data ?? [];
  });

// ---------- API Debug Logs ----------

export const listApiLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { onlyFailed?: boolean; limit?: number; page?: number }) =>
    z
      .object({
        onlyFailed: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        page: z.number().int().min(1).max(10).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const pageSize = data.limit ?? 10;
    const page = data.page ?? 1;
    const from = (page - 1) * pageSize;
    let q = context.supabase
      .from("whatsapp_api_logs")
      .select(
        "id, endpoint, method, phone, sender, response_status, response_body, ok, error_message, duration_ms, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (data.onlyFailed) q = q.eq("ok", false);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    const total = count ?? 0;
    return {
      rows: rows ?? [],
      total,
      page,
      pageSize,
      totalPages: Math.min(10, Math.max(1, Math.ceil(total / pageSize))),
    };
  });


// ---------- Waktu aktif / rehat (send windows) ----------

export const listSendWindows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_send_windows")
      .select("id, day_of_week, is_enabled, start_time, end_time")
      .order("day_of_week");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateSendWindow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      day_of_week: number;
      is_enabled?: boolean;
      start_time?: string;
      end_time?: string;
    }) =>
      z
        .object({
          day_of_week: z.number().int().min(0).max(6),
          is_enabled: z.boolean().optional(),
          start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
          end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.is_enabled !== undefined) patch.is_enabled = data.is_enabled;
    if (data.start_time !== undefined) patch.start_time = data.start_time;
    if (data.end_time !== undefined) patch.end_time = data.end_time;
    const { error } = await context.supabase
      .from("whatsapp_send_windows")
      .update(patch as any)
      .eq("day_of_week", data.day_of_week);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
