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

export const getChatbotSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("chatbot_settings")
      .select(
        "is_active, ai_provider, model_name, product_knowledge, tone_instruction, api_key_configured, updated_at",
      )
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateChatbotSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      is_active?: boolean;
      ai_provider?: "claude" | "openai" | "gemini" | "lovable";
      model_name?: string;
      product_knowledge?: string | null;
      tone_instruction?: string;
    }) =>
      z
        .object({
          is_active: z.boolean().optional(),
          ai_provider: z.enum(["claude", "openai", "gemini", "lovable"]).optional(),
          model_name: z.string().min(1).max(200).optional(),
          product_knowledge: z.string().max(2500).nullable().optional(),
          tone_instruction: z.string().min(1).max(1000).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    };
    for (const k of Object.keys(data) as Array<keyof typeof data>) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    const { error } = await context.supabase.from("chatbot_settings").update(patch as any).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setChatbotApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { provider: "claude" | "openai" | "gemini"; apiKey: string }) =>
    z
      .object({
        provider: z.enum(["claude", "openai", "gemini"]),
        apiKey: z.string().min(8).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { saveChatbotApiKey } = await import("./chatbot.server");
    await saveChatbotApiKey(data.provider, data.apiKey);
    return { ok: true };
  });

export const testChatbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { message: string }) =>
    z.object({ message: z.string().min(1).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { loadChatbotSettings, generateReply } = await import("./chatbot.server");
    const settings = await loadChatbotSettings();
    if (!settings) throw new Error("Chatbot settings tiada");
    const result = await generateReply({
      settings,
      history: [],
      incoming: data.message,
      leadName: "Ahmad",
    });
    if (!result.ok) throw new Error(result.error);
    return { parts: result.parts };
  });

export const setLeadChatbotPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string; paused: boolean }) =>
    z.object({ leadId: z.string().uuid(), paused: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ chatbot_paused: data.paused, updated_at: new Date().toISOString() })
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Verify the API key / gateway connection for the currently saved provider.
export const verifyChatbotConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { loadChatbotSettings, verifyProvider } = await import("./chatbot.server");
    const settings = await loadChatbotSettings();
    if (!settings) throw new Error("Chatbot settings tiada");
    const res = await verifyProvider(settings);
    if (!res.ok) throw new Error(res.error);
    return { ok: true, provider: settings.ai_provider, model: settings.model_name, sample: res.sample };
  });

// Test the chatbot end-to-end: generate a reply from the knowledge base and
// send it to your own WhatsApp number through a chosen sender.
export const testChatbotWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { phone: string; message: string; senderId?: string | null }) =>
    z
      .object({
        phone: z.string().min(8).max(20),
        message: z.string().min(1).max(1000),
        senderId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { loadChatbotSettings, generateReply } = await import("./chatbot.server");
    const { loadCredentials, sendUstazaiMessage, normalizePhone } = await import("./ustazai.server");

    const settings = await loadChatbotSettings();
    if (!settings) throw new Error("Chatbot settings tiada");

    const creds = await loadCredentials();
    if (!creds) throw new Error("Kredential WhatsApp (ustazai) belum diset");

    let senderPhone: string | undefined;
    if (data.senderId) {
      const { data: s, error } = await context.supabase
        .from("whatsapp_senders")
        .select("phone_number")
        .eq("id", data.senderId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      senderPhone = (s?.phone_number as string | undefined) ?? undefined;
    }

    const ai = await generateReply({
      settings,
      history: [],
      incoming: data.message,
      leadName: "Tester",
    });
    if (!ai.ok) throw new Error(ai.error);

    const to = normalizePhone(data.phone);
    const sent: string[] = [];
    for (const part of ai.parts) {
      const res = await sendUstazaiMessage({
        credentials: creds,
        number: to,
        message: part,
        senderOverride: senderPhone,
      });
      if (!res.ok) throw new Error(`Gagal hantar WhatsApp: ${res.error}`);
      sent.push(part);
    }
    return { ok: true, to, sender: senderPhone ?? creds.sender, parts: sent };
  });
