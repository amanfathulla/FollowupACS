import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Plug, Send, Save, RefreshCw, Clock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  getSettings,
  updateSettings,
  setCredentials,
  testConnection,
  getMyRole,
  listSendersLite,
  listApiLogs,
  getSchedulerInfo,
} from "@/lib/whatsapp.functions";
import { SendersPanel } from "@/components/whatsapp/senders-panel";

export const Route = createFileRoute("/_authenticated/settings/whatsapp")({
  component: WhatsappSettingsPage,
});

function WhatsappSettingsPage() {
  const qc = useQueryClient();

  const getSettingsFn = useServerFn(getSettings);
  const updateSettingsFn = useServerFn(updateSettings);
  const setCredentialsFn = useServerFn(setCredentials);
  const testConnectionFn = useServerFn(testConnection);
  const getMyRoleFn = useServerFn(getMyRole);
  const listSendersFn = useServerFn(listSendersLite);
  const listLogsFn = useServerFn(listApiLogs);
  const getSchedulerInfoFn = useServerFn(getSchedulerInfo);

  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyRoleFn() });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => getSettingsFn() });
  const senders = useQuery({ queryKey: ["senders-lite"], queryFn: () => listSendersFn() });
  const logs = useQuery({
    queryKey: ["api-logs"],
    queryFn: () => listLogsFn({ data: { limit: 30 } }),
    refetchInterval: 15000,
  });

  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [testNumber, setTestNumber] = useState("");
  const [testSenderId, setTestSenderId] = useState<string>("auto");

  const isAdmin = me.data?.isAdmin ?? false;

  const saveCredsMutation = useMutation({
    mutationFn: () =>
      setCredentialsFn({ data: { apiKey: apiKey || null, sender: null } }),
    onSuccess: () => {
      toast.success("API key disimpan");
      setApiKey("");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal simpan"),
  });

  const automationMutation = useMutation({
    mutationFn: (v: boolean) => updateSettingsFn({ data: { automation_enabled: v } }),
    onSuccess: () => {
      toast.success("Automation dikemaskini");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: (num: string) =>
      testConnectionFn({
        data: {
          number: num,
          senderId: testSenderId === "auto" ? null : testSenderId,
        },
      }),
    onSuccess: (res: any) =>
      toast.success(`Test berjaya dihantar via ${res?.senderUsed ?? "auto"}`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Test gagal"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["api-logs"] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp Automation</h1>
        <p className="text-sm text-muted-foreground">
          Sambungan ustazai.my, senarai nombor sender, dan log API.
        </p>
      </div>

      {/* Connection */}
      <Card className="p-6 rounded-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-whatsapp text-whatsapp-foreground flex items-center justify-center">
            <Plug className="w-5 h-5" />
          </div>
          <div>
            <div className="font-medium">Sambungan API</div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              Status:{" "}
              {settings.data?.api_key_configured ? (
                <Badge className="bg-success/15 text-success border-success/30" variant="outline">
                  API Key Configured
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  Not connected
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Endpoint</Label>
            <Input value="https://ustazai.my/send-message" readOnly className="bg-muted/40" />
          </div>
          <div>
            <Label htmlFor="apiKey">API Key</Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showKey ? "text" : "password"}
                placeholder={
                  settings.data?.api_key_configured
                    ? "••••••••  (biarkan kosong untuk tidak ubah)"
                    : "Masukkan API key ustazai.my"
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
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
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div>
            <div className="text-sm font-medium">Automation Aktif (global)</div>
            <div className="text-xs text-muted-foreground">
              Cron hanya hantar mesej kalau switch ini ON.
            </div>
          </div>
          <Switch
            checked={settings.data?.automation_enabled ?? false}
            onCheckedChange={(v) => automationMutation.mutate(v)}
            disabled={!isAdmin}
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => saveCredsMutation.mutate()}
            disabled={!isAdmin || !apiKey || saveCredsMutation.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            Simpan API key
          </Button>
        </div>

        <div className="border-t pt-4 space-y-2">
          <Label htmlFor="test">Test Sambungan</Label>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_240px_auto] gap-2">
            <Input
              id="test"
              placeholder="No. telefon untuk test (contoh: 60172888xxxx)"
              value={testNumber}
              onChange={(e) => setTestNumber(e.target.value)}
              disabled={!isAdmin || !settings.data?.api_key_configured}
            />
            <Select value={testSenderId} onValueChange={setTestSenderId}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih sender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (sender aktif pertama)</SelectItem>
                {(senders.data ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label} · {s.phone_number}
                    {s.connection_status !== "connected" ? " ⚠︎" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => testMutation.mutate(testNumber)}
              disabled={
                !isAdmin ||
                !testNumber ||
                !settings.data?.api_key_configured ||
                testMutation.isPending
              }
            >
              <Send className="w-4 h-4 mr-2" />
              Hantar test
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Test guna sender WhatsApp yang dipilih. Jika 400/401 keluar, tengok log di bawah untuk
            payload penuh & respons ustazai.my.
          </p>
        </div>
      </Card>

      {/* Senders list (multiple) */}
      <SendersPanel />

      {/* API Debug Logs */}
      <Card className="p-6 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Log Panggilan API ustazai.my</div>
            <div className="text-xs text-muted-foreground">
              30 panggilan terkini — request, HTTP status & respons.
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["api-logs"] })}
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="text-muted-foreground border-b">
              <tr className="text-left">
                <th className="py-2 pr-2">Masa</th>
                <th className="py-2 pr-2">Endpoint</th>
                <th className="py-2 pr-2">Sender → Phone</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2">Respons</th>
              </tr>
            </thead>
            <tbody>
              {(logs.data ?? []).map((l: any) => (
                <tr key={l.id} className="border-b align-top hover:bg-muted/30">
                  <td className="py-2 pr-2 whitespace-nowrap">
                    {new Date(l.created_at).toLocaleTimeString()}
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap">
                    {l.endpoint?.split("/").pop()}
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap">
                    {l.sender ?? "—"} → {l.phone ?? "—"}
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap">
                    {l.ok ? (
                      <Badge className="bg-success/15 text-success border-success/30" variant="outline">
                        {l.response_status ?? "OK"}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                        {l.response_status ?? "ERR"}
                      </Badge>
                    )}
                  </td>
                  <td className="py-2 pr-2 font-mono text-[11px] max-w-md truncate">
                    {l.error_message || l.response_body}
                  </td>
                </tr>
              ))}
              {(logs.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    Belum ada panggilan API direkodkan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

