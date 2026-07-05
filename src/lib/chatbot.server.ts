// Server-only AI chatbot helpers. Never import at module scope from
// client-reachable modules.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ChatbotSettings = {
  is_active: boolean;
  ai_provider: "claude" | "openai" | "gemini" | "lovable";
  model_name: string;
  product_knowledge: string | null;
  tone_instruction: string;
};

export async function loadChatbotSettings(): Promise<ChatbotSettings | null> {
  const { data, error } = await supabaseAdmin
    .from("chatbot_settings")
    .select("is_active, ai_provider, model_name, product_knowledge, tone_instruction")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data as ChatbotSettings | null;
}

export async function loadChatbotApiKey(provider: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("chatbot_credentials")
    .select("claude_api_key, openai_api_key, gemini_api_key")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return null;
  if (provider === "claude") return data.claude_api_key;
  if (provider === "openai") return data.openai_api_key;
  if (provider === "gemini") return data.gemini_api_key;
  return null;
}

export async function saveChatbotApiKey(provider: string, apiKey: string): Promise<void> {
  const patch: {
    updated_at: string;
    claude_api_key?: string;
    openai_api_key?: string;
    gemini_api_key?: string;
  } = { updated_at: new Date().toISOString() };
  if (provider === "claude") patch.claude_api_key = apiKey;
  else if (provider === "openai") patch.openai_api_key = apiKey;
  else if (provider === "gemini") patch.gemini_api_key = apiKey;
  else throw new Error("Provider tidak sah");
  await supabaseAdmin.from("chatbot_credentials").update(patch).eq("id", 1);
  await supabaseAdmin
    .from("chatbot_settings")
    .update({ api_key_configured: true, updated_at: new Date().toISOString() })
    .eq("id", 1);
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export async function generateReply(params: {
  settings: ChatbotSettings;
  history: ChatTurn[];
  incoming: string;
  leadName?: string | null;
}): Promise<{ ok: true; parts: string[] } | { ok: false; error: string }> {
  const systemPrompt = [
    params.settings.tone_instruction,
    "",
    "Pisahkan setiap ayat/idea pendek dengan '|||' supaya boleh dihantar sebagai beberapa mesej WhatsApp berasingan. Jangan buat perenggan panjang. Maksimum 4 bahagian.",
    "",
    params.settings.product_knowledge
      ? "MAKLUMAT PRODUK:\n" + params.settings.product_knowledge
      : "",
    params.leadName ? `\nNama customer: ${params.leadName}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const messages = [
    { role: "system", content: systemPrompt },
    ...params.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: params.incoming },
  ];

  try {
    let text = "";
    const provider = params.settings.ai_provider;

    if (provider === "lovable") {
      const key = process.env.LOVABLE_API_KEY;
      if (!key) return { ok: false, error: "LOVABLE_API_KEY tidak set" };
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: params.settings.model_name,
          messages,
        }),
      });
      if (!resp.ok) return { ok: false, error: `Lovable AI ${resp.status}: ${await resp.text()}` };
      const json = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      text = json.choices?.[0]?.message?.content ?? "";
    } else if (provider === "openai") {
      const key = await loadChatbotApiKey("openai");
      if (!key) return { ok: false, error: "OpenAI API key belum diset" };
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: params.settings.model_name, messages }),
      });
      if (!resp.ok) return { ok: false, error: `OpenAI ${resp.status}: ${await resp.text()}` };
      const json = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      text = json.choices?.[0]?.message?.content ?? "";
    } else if (provider === "claude") {
      const key = await loadChatbotApiKey("claude");
      if (!key) return { ok: false, error: "Claude API key belum diset" };
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: params.settings.model_name,
          max_tokens: 800,
          system: systemPrompt,
          messages: [
            ...params.history.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: params.incoming },
          ],
        }),
      });
      if (!resp.ok) return { ok: false, error: `Claude ${resp.status}: ${await resp.text()}` };
      const json = (await resp.json()) as { content?: Array<{ text?: string }> };
      text = (json.content ?? []).map((c) => c.text ?? "").join("");
    } else if (provider === "gemini") {
      const key = await loadChatbotApiKey("gemini");
      if (!key) return { ok: false, error: "Gemini API key belum diset" };
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          params.settings.model_name,
        )}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [
              ...params.history.map((m) => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }],
              })),
              { role: "user", parts: [{ text: params.incoming }] },
            ],
          }),
        },
      );
      if (!resp.ok) return { ok: false, error: `Gemini ${resp.status}: ${await resp.text()}` };
      const json = (await resp.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    } else {
      return { ok: false, error: `Provider tidak disokong: ${provider}` };
    }

    const parts = text
      .split("|||")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4);
    if (parts.length === 0) return { ok: false, error: "AI kembalikan respons kosong" };
    return { ok: true, parts };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
