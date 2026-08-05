import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Plug,
  Send,
  Save,
  RefreshCw,
  Clock,
  CalendarClock,
  Smartphone,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
} from "lucide-react";

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
import { SendWindowsPanel } from "@/components/whatsapp/send-windows-panel";

export const Route = createFileRoute("/_authenticated/settings/whatsapp")({
  component: WhatsappSettingsPage,
});

type SectionKey = "connection" | "scheduler" | "windows" | "senders" | "logs";

const SECTIONS: {
  key: SectionKey;
  title: string;
  desc: string;
  icon: typeof Plug;
  tone: string;
}[] = [
  {
    key: "connection",
    title: "Sambungan API",
    desc: "API key ustazai.my, automation switch & ujian hantar.",
    icon: Plug,
    tone: "bg-whatsapp/15 text-whatsapp",
  },
  {
    key: "scheduler",
    title: "Status Scheduler",
    desc: "Timezone server, jadual 1 jam berikutnya & overdue.",
    icon: Clock,
    tone: "bg-primary/10 text-primary",
  },
  {
    key: "windows",
    title: "Waktu Aktif & Rehat",
    desc: "Set jam aktif setiap hari dan hari rehat.",
    icon: CalendarClock,
    tone: "bg-info/15 text-info",
  },
  {
    key: "senders",
    title: "Nombor Sender",
    desc: "Senarai nombor WhatsApp, status sambungan & had harian.",
    icon: Smartphone,
    tone: "bg-success/15 text-success",
  },
  {
    key: "logs",
    title: "Log Panggilan API",
    desc: "Request, HTTP status & respons ustazai.my.",
    icon: ScrollText,
    tone: "bg-muted text-muted-foreground",
  },
];

function WhatsappSettingsPage() {
  const [section, setSection] = useState<SectionKey | null>(null);
  const active = SECTIONS.find((s) => s.key === section);

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
          WhatsApp Automation
        </h1>
        <p className="text-sm text-muted-foreground">
          Pilih folder di bawah untuk buka bahagian yang anda perlukan.
        </p>
      </div>

      {!active ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              className="group rounded-2xl border bg-card p-5 text-left transition hover:border-primary/40 hover:shadow-md"
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${s.tone}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{s.desc}</div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setSection(null)}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Semua folder
            </Button>
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <FolderOpen className="h-4 w-4 shrink-0" />
              <span className="truncate">{active.title}</span>
            </div>
          </div>

          {section === "connection" && <ConnectionSection />}
          {section === "scheduler" && <SchedulerSection />}
          {section === "windows" && <SendWindowsPanel />}
          {section === "senders" && <SendersPanel />}
          {section === "logs" && <LogsSection />}
        </div>
      )}
    </div>
  );
}

function ConnectionSection() {
  const qc = useQueryClient();
  const getSettingsFn = useServerFn(getSettings);
  const updateSettingsFn = useServerFn(updateSettings);
  const setCredentialsFn = useServerFn(setCredentials);
  const testConnectionFn = useServerFn(testConnection);
  const getMyRoleFn = useServerFn(getMyRole);
  const listSendersFn = useServerFn(listSendersLite);

  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyRoleFn() });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => getSettingsFn() });
  const senders = useQuery({ queryKey: ["senders-lite"], queryFn: () => listSendersFn() });

  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [testNumber, setTestNumber] = useState("");
  const [testSenderId, setTestSenderId] = useState<string>("auto");

  const isAdmin = me.data?.isAdmin ?? false;

  const saveCredsMutation = useMutation({
    mutationFn: () => setCredentialsFn({ data: { apiKey: apiKey || null, sender: null } }),
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
        data: { number: num, senderId: testSenderId === "auto" ? null : testSenderId },
      }),
    onSuccess: (res: any) =>
      toast.success(`Test berjaya dihantar via ${res?.senderUsed ?? "auto"}`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Test gagal"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["api-logs"] }),
  });

  return (
    <Card className="space-y-4 rounded-2xl p-4 sm:p-6">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-whatsapp text-whatsapp-foreground">
          <Plug className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="font-medium">Sambungan API</div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Status:{" "}
            {settings.data?.api_key_configured ? (
              <Badge className="border-success/30 bg-success/15 text-success" variant="outline">
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t pt-4">
        <div className="min-w-0">
          <div className="text-sm font-medium">Automation Aktif (global)</div>
          <div className="text-xs text-muted-foreground">
            Cron hanya hantar mesej kalau switch ini ON.
          </div>
        </div>
        <Switch
          checked={settings.data?.automation_enabled ?? false}
          onCheckedChange={(v) => automationMutation.mutate(v)}
          disabled={!isAdmin}
          className="shrink-0"
        />
      </div>

      <Button
        onClick={() => saveCredsMutation.mutate()}
        disabled={!isAdmin || !apiKey || saveCredsMutation.isPending}
      >
        <Save className="mr-2 h-4 w-4" />
        Simpan API key
      </Button>

      <div className="space-y-2 border-t pt-4">
        <Label htmlFor="test">Test Sambungan</Label>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_240px_auto]">
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
            <Send className="mr-2 h-4 w-4" />
            Hantar test
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Test guna sender WhatsApp yang dipilih. Jika 400/401 keluar, buka folder “Log Panggilan
          API” untuk payload penuh & respons ustazai.my.
        </p>
      </div>
    </Card>
  );
}

function SchedulerSection() {
  const qc = useQueryClient();
  const getSchedulerInfoFn = useServerFn(getSchedulerInfo);
  const scheduler = useQuery({
    queryKey: ["scheduler-info"],
    queryFn: () => getSchedulerInfoFn(),
    refetchInterval: 30000,
  });

  return (
    <Card className="space-y-4 rounded-2xl p-4 sm:p-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Clock className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="font-medium">Status Scheduler</div>
            <div className="text-xs text-muted-foreground">
              Sahkan timezone server & bilangan followup dalam 1 jam berikutnya.
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => qc.invalidateQueries({ queryKey: ["scheduler-info"] })}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border p-3">
          <div className="text-xs text-muted-foreground">Timezone server</div>
          <div className="mt-1 text-sm font-medium">{scheduler.data?.serverTimezone ?? "—"}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {scheduler.data?.serverOffsetLabel ?? ""}
          </div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-muted-foreground">Masa server sekarang</div>
          <div className="mt-1 text-sm font-medium">
            {scheduler.data?.serverNowIso
              ? new Date(scheduler.data.serverNowIso).toLocaleString("en-MY", {
                  timeZone: "Asia/Kuala_Lumpur",
                  hour12: false,
                })
              : "—"}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            paparan: Asia/Kuala_Lumpur (UTC+08:00)
          </div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-muted-foreground">Dijadualkan 1 jam berikutnya</div>
          <div className="mt-1 text-2xl font-semibold">
            {scheduler.data?.scheduledNextHour ?? 0}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            status = pending, scheduled_at ≤{" "}
            {scheduler.data?.nextHourIso
              ? new Date(scheduler.data.nextHourIso).toLocaleTimeString("en-MY", {
                  timeZone: "Asia/Kuala_Lumpur",
                  hour12: false,
                })
              : "—"}
          </div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-muted-foreground">Overdue (belum dihantar)</div>
          <div className="mt-1 text-2xl font-semibold">{scheduler.data?.overduePending ?? 0}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {scheduler.data?.nextScheduledAt
              ? `Seterusnya: ${new Date(scheduler.data.nextScheduledAt).toLocaleString("en-MY", {
                  timeZone: "Asia/Kuala_Lumpur",
                  hour12: false,
                })}`
              : "Tiada pending akan datang"}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Nota: <code>scheduled_at</code> disimpan dalam UTC (timestamptz). Jika masa server jauh
        berbeza dengan Asia/Kuala_Lumpur, cron mungkin tersasar — semak nilai di atas.
      </p>
    </Card>
  );
}

const PAGE_SIZE = 10;
const MAX_PAGES = 10;

function LogsSection() {
  const qc = useQueryClient();
  const listLogsFn = useServerFn(listApiLogs);
  const [page, setPage] = useState(1);

  const logs = useQuery({
    queryKey: ["api-logs", page],
    queryFn: () => listLogsFn({ data: { limit: PAGE_SIZE, page } }),
    refetchInterval: 15000,
  });

  const rows = logs.data?.rows ?? [];
  const totalPages = Math.min(MAX_PAGES, logs.data?.totalPages ?? 1);

  return (
    <Card className="space-y-3 rounded-2xl p-4 sm:p-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <div className="font-medium">Log Panggilan API ustazai.my</div>
          <div className="text-xs text-muted-foreground">
            10 panggilan per halaman · maksimum {MAX_PAGES} halaman.
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => qc.invalidateQueries({ queryKey: ["api-logs"] })}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="border-b text-muted-foreground">
            <tr className="text-left">
              <th className="py-2 pr-2">Masa</th>
              <th className="py-2 pr-2">Endpoint</th>
              <th className="py-2 pr-2">Sender → Phone</th>
              <th className="py-2 pr-2">Status</th>
              <th className="py-2 pr-2">Respons</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l: any) => (
              <tr key={l.id} className="border-b align-top hover:bg-muted/30">
                <td className="whitespace-nowrap py-2 pr-2">
                  {new Date(l.created_at).toLocaleTimeString()}
                </td>
                <td className="whitespace-nowrap py-2 pr-2">{l.endpoint?.split("/").pop()}</td>
                <td className="whitespace-nowrap py-2 pr-2">
                  {l.sender ?? "—"} → {l.phone ?? "—"}
                </td>
                <td className="whitespace-nowrap py-2 pr-2">
                  {l.ok ? (
                    <Badge
                      className="border-success/30 bg-success/15 text-success"
                      variant="outline"
                    >
                      {l.response_status ?? "OK"}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-destructive/30 bg-destructive/10 text-destructive"
                    >
                      {l.response_status ?? "ERR"}
                    </Badge>
                  )}
                </td>
                <td className="max-w-md truncate py-2 pr-2 font-mono text-[11px]">
                  {l.error_message || l.response_body}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                  Belum ada panggilan API direkodkan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t pt-3">
        <div className="min-w-0 text-xs text-muted-foreground">
          Halaman {page} / {totalPages}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="icon"
              className="h-8 w-8 text-xs"
              onClick={() => setPage(p)}
            >
              {p}
            </Button>
          ))}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
