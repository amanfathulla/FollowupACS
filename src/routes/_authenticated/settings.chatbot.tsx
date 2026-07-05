import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, Save, Send, Eye, EyeOff } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  getChatbotSettings,
  updateChatbotSettings,
  setChatbotApiKey,
  testChatbot,
} from "@/lib/chatbot.functions";
import { getMyRole } from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/_authenticated/settings/chatbot")({
  component: ChatbotSettingsPage,
});

const PROVIDER_MODELS: Record<string, string[]> = {
  lovable: ["google/gemini-2.5-flash", "google/gemini-2.5-pro", "openai/gpt-5-mini"],
  gemini: ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
  openai: ["gpt-4o-mini", "gpt-4o"],
  claude: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
};

function ChatbotSettingsPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getChatbotSettings);
  const updateFn = useServerFn(updateChatbotSettings);
  const setKeyFn = useServerFn(setChatbotApiKey);
  const testFn = useServerFn(testChatbot);
  const meFn = useServerFn(getMyRole);

  const me = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const settings = useQuery({ queryKey: ["chatbot-settings"], queryFn: () => getFn() });
  const isAdmin = me.data?.isAdmin ?? false;

  const [draft, setDraft] = useState<any>(null);
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [testMsg, setTestMsg] = useState("Salam, harga berapa untuk Honda City?");
  const [testResult, setTestResult] = useState<string[] | null>(null);

  useEffect(() => {
    if (settings.data && !draft) setDraft(settings.data);
  }, [settings.data, draft]);

  const saveMutation = useMutation({
    mutationFn: (patch: any) => updateFn({ data: patch }),
    onSuccess: () => {
      toast.success("Setting disimpan");
      qc.invalidateQueries({ queryKey: ["chatbot-settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal simpan"),
  });

  const keyMutation = useMutation({
    mutationFn: () =>
      setKeyFn({ data: { provider: draft.ai_provider, apiKey } }),
    onSuccess: () => {
      toast.success("API key disimpan");
      setApiKey("");
      qc.invalidateQueries({ queryKey: ["chatbot-settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal simpan key"),
  });

  const testMutation = useMutation({
    mutationFn: () => testFn({ data: { message: testMsg } }),
    onSuccess: (r) => setTestResult(r.parts),
    onError: (e) => {
      setTestResult(null);
      toast.error(e instanceof Error ? e.message : "Test gagal");
    },
  });

  if (!draft) return <div className="text-sm text-muted-foreground">Memuat setting…</div>;

  const kbLen = (draft.product_knowledge ?? "").length;
  const provider = draft.ai_provider;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Chatbot Auto-Reply</h1>
        <p className="text-sm text-muted-foreground">
          Balasan automatik untuk mesej masuk dari lead, berdasarkan pengetahuan produk yang anda tetapkan.
        </p>
      </div>

      <Card className="p-6 rounded-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Bot className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-medium">Auto-Reply Aktif</div>
            <div className="text-xs text-muted-foreground">
              Jika ON, AI akan balas mesej masuk. Bila admin reply manual dalam Live Chat, chatbot auto-pause untuk lead tersebut.
            </div>
          </div>
          <Switch
            checked={draft.is_active}
            onCheckedChange={(v) => {
              setDraft({ ...draft, is_active: v });
              saveMutation.mutate({ is_active: v });
            }}
            disabled={!isAdmin}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
          <div>
            <Label>AI Provider</Label>
            <Select
              value={provider}
              onValueChange={(v) => setDraft({ ...draft, ai_provider: v, model_name: PROVIDER_MODELS[v][0] })}
              disabled={!isAdmin}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lovable">Lovable AI Gateway (recommended)</SelectItem>
                <SelectItem value="gemini">Google Gemini (API key)</SelectItem>
                <SelectItem value="openai">OpenAI (API key)</SelectItem>
                <SelectItem value="claude">Anthropic Claude (API key)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Model</Label>
            <Select
              value={draft.model_name}
              onValueChange={(v) => setDraft({ ...draft, model_name: v })}
              disabled={!isAdmin}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(PROVIDER_MODELS[provider] ?? []).map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {provider !== "lovable" && (
          <div className="border-t pt-4">
            <Label>
              API Key ({provider}){" "}
              {settings.data?.api_key_configured && (
                <Badge variant="outline" className="bg-success/15 text-success border-success/30 ml-2">
                  Set
                </Badge>
              )}
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    settings.data?.api_key_configured ? "•••••••• (biar kosong untuk tidak ubah)" : `Masukkan ${provider} API key`
                  }
                  disabled={!isAdmin}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button
                onClick={() => keyMutation.mutate()}
                disabled={!isAdmin || !apiKey || keyMutation.isPending}
              >
                <Save className="w-4 h-4 mr-2" />
                Simpan key
              </Button>
            </div>
          </div>
        )}

        <div className="border-t pt-4">
          <div className="flex items-center justify-between">
            <Label>Product Knowledge</Label>
            <div className={`text-xs ${kbLen > 2500 ? "text-destructive" : "text-muted-foreground"}`}>
              {kbLen.toLocaleString()} / 2,500
            </div>
          </div>
          <Textarea
            rows={8}
            value={draft.product_knowledge ?? ""}
            onChange={(e) => setDraft({ ...draft, product_knowledge: e.target.value.slice(0, 2500) })}
            placeholder="Nyatakan produk, harga, warna, kelebihan, FAQ, dsb..."
            disabled={!isAdmin}
          />
        </div>

        <div>
          <Label>Gaya Respons (Tone)</Label>
          <Textarea
            rows={3}
            value={draft.tone_instruction}
            onChange={(e) => setDraft({ ...draft, tone_instruction: e.target.value })}
            disabled={!isAdmin}
          />
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() =>
              saveMutation.mutate({
                ai_provider: draft.ai_provider,
                model_name: draft.model_name,
                product_knowledge: draft.product_knowledge,
                tone_instruction: draft.tone_instruction,
              })
            }
            disabled={!isAdmin || saveMutation.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            Simpan setting
          </Button>
        </div>
      </Card>

      <Card className="p-6 rounded-2xl space-y-3">
        <div className="font-medium">Test Chatbot</div>
        <div className="flex gap-2">
          <Input
            value={testMsg}
            onChange={(e) => setTestMsg(e.target.value)}
            placeholder="Contoh mesej customer…"
          />
          <Button
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={!testMsg || testMutation.isPending}
          >
            <Send className="w-4 h-4 mr-2" />
            Test
          </Button>
        </div>
        {testResult && (
          <div className="space-y-2 bg-muted/20 rounded-lg p-3">
            {testResult.map((p, i) => (
              <div
                key={i}
                className="bg-primary text-primary-foreground rounded-2xl px-3 py-2 text-sm max-w-[80%]"
              >
                {p}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="text-xs text-muted-foreground bg-warning/10 border border-warning/30 rounded-lg p-3">
        <strong>Nota:</strong> AI auto-reply berhenti automatik untuk lead yang admin dah reply manual dalam Live Chat, supaya tidak overlap dengan admin sebenar.
      </div>
    </div>
  );
}
