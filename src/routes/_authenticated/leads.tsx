import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  Users,
  UserPlus,
  MessageCircle,
  CheckCircle2,
  BarChart3,
  ClipboardList,
  MoreHorizontal,
  Send,
  XCircle,
  ExternalLink,
  Upload,
  Pencil,
  Trash2,
  ArrowLeft,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "@tanstack/react-router";

import {
  listLeads,
  listFollowups,
  todayStats,
  createLead,
  bulkImportLeads,
  updateLeadStatus,
  cancelFollowup,
  sendFollowupNow,
  getSettings,
  updateSettings,
  getMyRole,
} from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/_authenticated/leads")({
  component: LeadsPage,
});

const STATUS_COLOR: Record<string, string> = {
  active: "bg-info/15 text-info border-info/30",
  replied: "bg-violet/15 text-violet border-violet/30",
  converted: "bg-success/15 text-success border-success/30",
  stopped: "bg-muted text-muted-foreground border-border",
};
const FU_STATUS_COLOR: Record<string, string> = {
  sent: "bg-success/15 text-success border-success/30",
  pending: "bg-warning/15 text-warning-foreground border-warning/40",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

function StatCard(props: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "stat-1" | "stat-2" | "stat-3" | "stat-4" | "stat-5" | "stat-6";
  iconTone: string;
}) {
  const Icon = props.icon;
  return (
    <Card className={`p-5 rounded-2xl border-0 bg-${props.tone}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-foreground/60">{props.title}</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{props.value}</div>
          {props.subtitle && (
            <div className="mt-1 text-xs text-foreground/60">{props.subtitle}</div>
          )}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${props.iconTone}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </Card>
  );
}

function LeadsPage() {
  const qc = useQueryClient();

  const listLeadsFn = useServerFn(listLeads);
  const listFollowupsFn = useServerFn(listFollowups);
  const todayStatsFn = useServerFn(todayStats);
  const createLeadFn = useServerFn(createLead);
  const bulkImportLeadsFn = useServerFn(bulkImportLeads);
  const updateLeadStatusFn = useServerFn(updateLeadStatus);
  const cancelFollowupFn = useServerFn(cancelFollowup);
  const sendFollowupNowFn = useServerFn(sendFollowupNow);
  const getSettingsFn = useServerFn(getSettings);
  const updateSettingsFn = useServerFn(updateSettings);
  const getMyRoleFn = useServerFn(getMyRole);

  const stats = useQuery({ queryKey: ["stats"], queryFn: () => todayStatsFn() });
  const leads = useQuery({ queryKey: ["leads"], queryFn: () => listLeadsFn() });
  const followups = useQuery({
    queryKey: ["followups", "all"],
    queryFn: () => listFollowupsFn({ data: { statusFilter: "all", limit: 200 } }),
  });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => getSettingsFn() });
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyRoleFn() });

  const [openLead, setOpenLead] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [importPreview, setImportPreview] = useState<
    Array<{ name: string; phone: string; product: string | null }> | null
  >(null);
  const [form, setForm] = useState({ name: "", phone: "", product: "" });

  const createMutation = useMutation({
    mutationFn: (payload: typeof form) => createLeadFn({ data: payload }),
    onSuccess: () => {
      toast.success("Lead ditambah — jadual followup dijana automatik");
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["followups"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setOpenLead(false);
      setForm({ name: "", phone: "", product: "" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal tambah lead"),
  });

  const bulkImportMutation = useMutation({
    mutationFn: (rows: Array<{ name: string; phone: string; product: string | null }>) =>
      bulkImportLeadsFn({ data: { rows } }),
    onSuccess: (r) => {
      toast.success(`Berjaya import ${r.inserted} lead — followup dijana automatik`);
      setImportPreview(null);
      setOpenImport(false);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["followups"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import gagal"),
  });

  async function handleImportFile(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const parsed = rows
        .map((r) => {
          const name = String(r.Nama ?? r.nama ?? r.Name ?? r.name ?? "").trim();
          const phone = String(
            r.Telefon ?? r.telefon ?? r.Phone ?? r.phone ?? r.Nombor ?? r.nombor ?? "",
          ).trim();
          const product = String(r.Produk ?? r.produk ?? r.Product ?? r.product ?? "").trim();
          return { name, phone, product: product || null };
        })
        .filter((r) => r.name.length > 0 && r.phone.length >= 6);
      if (parsed.length === 0) {
        toast.error("Tiada baris sah. Pastikan lajur Nama & Telefon wujud.");
        return;
      }
      if (parsed.length > 500) {
        toast.error("Maksimum 500 lead per import.");
        return;
      }
      setImportPreview(parsed);
    } catch (e) {
      toast.error("Gagal baca fail: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  const statusMutation = useMutation({
    mutationFn: (v: { id: string; status: "active" | "replied" | "converted" | "stopped" }) =>
      updateLeadStatusFn({ data: v }),
    onSuccess: () => {
      toast.success("Status lead dikemaskini");
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["followups"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelFollowupFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Followup dibatalkan");
      qc.invalidateQueries({ queryKey: ["followups"] });
    },
  });

  const sendNowMutation = useMutation({
    mutationFn: (id: string) => sendFollowupNowFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Mesej dihantar");
      qc.invalidateQueries({ queryKey: ["followups"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal hantar"),
  });

  const automationMutation = useMutation({
    mutationFn: (v: boolean) => updateSettingsFn({ data: { automation_enabled: v } }),
    onSuccess: () => {
      toast.success("Automation setting dikemaskini");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  // Aggregate chart: leads created per day (last 14 days)
  const chartData = (() => {
    const days: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      days.push({ date: format(d, "dd MMM"), count: 0 });
    }
    (leads.data ?? []).forEach((l: { created_at: string }) => {
      const d = new Date(l.created_at);
      d.setHours(0, 0, 0, 0);
      const label = format(d, "dd MMM");
      const bucket = days.find((x) => x.date === label);
      if (bucket) bucket.count++;
    });
    return days;
  })();

  const isAdmin = me.data?.isAdmin ?? false;
  const totalLeads = leads.data?.length ?? 0;
  const converted = (leads.data ?? []).filter((l: { followup_status: string }) => l.followup_status === "converted").length;
  const conversionRate = totalLeads > 0 ? ((converted / totalLeads) * 100).toFixed(0) : "0";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lead Management</h1>
          <p className="text-sm text-muted-foreground">
            Urus semua lead dan pantau jadual WhatsApp followup.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={openLead} onOpenChange={setOpenLead}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="w-4 h-4 mr-2" />
                Tambah Lead
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Lead Baharu</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!form.name || !form.phone) return;
                  createMutation.mutate(form);
                }}
              >
                <div>
                  <Label htmlFor="name">Nama</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="phone">No. Telefon</Label>
                  <Input
                    id="phone"
                    placeholder="0172888xxxx atau 60172888xxxx"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Diformat automatik ke 60xxxxxxxxx.
                  </p>
                </div>
                <div>
                  <Label htmlFor="product">Produk (opsyenal)</Label>
                  <Input
                    id="product"
                    value={form.product}
                    onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    Simpan
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={openImport}
            onOpenChange={(v) => {
              setOpenImport(v);
              if (!v) setImportPreview(null);
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="w-4 h-4 mr-2" />
                Import Pukal
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Import Lead Pukal (Excel / CSV)</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="text-xs text-muted-foreground">
                  Lajur diperlukan: <code>Nama</code>, <code>Telefon</code>. Opsyenal:{" "}
                  <code>Produk</code>. Maksimum 500 lead per import. Setiap lead akan
                  diagihkan automatik ke nombor sender aktif.
                </div>

                {!importPreview && (
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-primary/50 transition-colors">
                    <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                    <div className="text-sm text-muted-foreground">
                      Klik untuk pilih fail .xlsx atau .csv
                    </div>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImportFile(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}

                {importPreview && (
                  <div className="space-y-3">
                    <div className="text-sm font-medium">
                      Preview ({importPreview.length} lead):
                    </div>
                    <div className="border rounded-lg max-h-64 overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground text-xs uppercase sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2">Nama</th>
                            <th className="text-left px-3 py-2">Telefon</th>
                            <th className="text-left px-3 py-2">Produk</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.map((r, i) => (
                            <tr key={i} className="border-t border-border">
                              <td className="px-3 py-2">{r.name}</td>
                              <td className="px-3 py-2 font-mono text-xs">{r.phone}</td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {r.product ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                {importPreview && (
                  <>
                    <Button variant="outline" onClick={() => setImportPreview(null)}>
                      Pilih fail lain
                    </Button>
                    <Button
                      onClick={() => bulkImportMutation.mutate(importPreview)}
                      disabled={bulkImportMutation.isPending}
                    >
                      Import {importPreview.length} lead
                    </Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard
          title="Lead Baru (30h)"
          value={
            (leads.data ?? []).filter(
              (l: { created_at: string }) =>
                new Date(l.created_at).getTime() > Date.now() - 30 * 86_400_000,
            ).length
          }
          icon={UserPlus}
          tone="stat-1"
          iconTone="bg-info text-info-foreground"
        />
        <StatCard
          title="Followup Pending"
          value={stats.data?.pendingTotal ?? "—"}
          icon={ClipboardList}
          tone="stat-3"
          iconTone="bg-warning text-warning-foreground"
        />
        <StatCard
          title="Closed / Converted"
          value={converted}
          icon={CheckCircle2}
          tone="stat-2"
          iconTone="bg-success text-success-foreground"
        />
        <StatCard
          title="Total Leads"
          value={totalLeads}
          icon={Users}
          tone="stat-4"
          iconTone="bg-violet text-violet-foreground"
        />
        <StatCard
          title="Conversion Rate"
          value={`${conversionRate}%`}
          icon={BarChart3}
          tone="stat-5"
          iconTone="bg-destructive text-destructive-foreground"
        />
        <StatCard
          title="WhatsApp Hari Ini"
          value={`${stats.data?.sentToday ?? 0} / ${stats.data?.scheduledToday ?? 0}`}
          subtitle="terhantar / dijadualkan"
          icon={MessageCircle}
          tone="stat-6"
          iconTone="bg-whatsapp text-whatsapp-foreground"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="whatsapp">
        <TabsList>
          <TabsTrigger value="graph">Graf</TabsTrigger>
          <TabsTrigger value="list">Senarai Lead</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp Followup</TabsTrigger>
        </TabsList>

        <TabsContent value="graph">
          <Card className="p-6 rounded-2xl">
            <div className="mb-4">
              <div className="text-sm font-medium">Lead baru — 14 hari lepas</div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="list">
          <Card className="rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Nama</th>
                  <th className="text-left px-4 py-3">Telefon</th>
                  <th className="text-left px-4 py-3">Produk</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Tarikh</th>
                  <th className="text-right px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {(leads.data ?? []).map((l: any) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{l.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{l.phone}</td>
                    <td className="px-4 py-3 text-muted-foreground">{l.product ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={STATUS_COLOR[l.followup_status]}>
                        {l.followup_status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {format(new Date(l.created_at), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              statusMutation.mutate({ id: l.id, status: "replied" })
                            }
                          >
                            Tandakan sudah reply
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              statusMutation.mutate({ id: l.id, status: "converted" })
                            }
                          >
                            Tandakan converted
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              statusMutation.mutate({ id: l.id, status: "stopped" })
                            }
                          >
                            Berhentikan followup
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              statusMutation.mutate({ id: l.id, status: "active" })
                            }
                          >
                            Aktifkan semula
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
                {leads.data?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      Belum ada lead. Klik "Tambah Lead" untuk mula.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp">
          <Card className="p-4 rounded-2xl mb-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  settings.data?.automation_enabled
                    ? "bg-success text-success-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-medium">
                  Automation:{" "}
                  <span
                    className={
                      settings.data?.automation_enabled ? "text-success" : "text-muted-foreground"
                    }
                  >
                    {settings.data?.automation_enabled ? "ON" : "OFF"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {settings.data?.api_key_configured
                    ? "API ustazai.my sudah disambung."
                    : "API ustazai.my belum disambung — pergi ke Settings."}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button
                  variant={settings.data?.automation_enabled ? "outline" : "default"}
                  onClick={() =>
                    automationMutation.mutate(!(settings.data?.automation_enabled ?? false))
                  }
                >
                  {settings.data?.automation_enabled ? "Matikan" : "Hidupkan"} Automation
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link to="/settings/whatsapp">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Uruskan Sequence
                </Link>
              </Button>
            </div>
          </Card>

          <Card className="rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <div className="text-sm font-medium">Jadual Followup Aktif</div>
              <div className="text-xs text-muted-foreground">
                Cron akan hantar mesej pending setiap jam kalau automation ON.
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Lead</th>
                    <th className="text-left px-4 py-3">Telefon</th>
                    <th className="text-left px-4 py-3">Hari</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Dijadual</th>
                    <th className="text-right px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {(followups.data ?? []).map((f: any) => (
                    <tr key={f.id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">{f.leads?.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{f.leads?.phone}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        Hari {f.day_offset ?? "?"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={FU_STATUS_COLOR[f.status]}>
                          {f.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {format(new Date(f.scheduled_at), "dd MMM yyyy, HH:mm")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {f.status === "pending" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {isAdmin && (
                                <DropdownMenuItem onClick={() => sendNowMutation.mutate(f.id)}>
                                  <Send className="w-4 h-4 mr-2" />
                                  Hantar sekarang
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => cancelMutation.mutate(f.id)}>
                                <XCircle className="w-4 h-4 mr-2" />
                                Cancel followup
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  ))}
                  {followups.data?.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        Belum ada followup dijadualkan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
