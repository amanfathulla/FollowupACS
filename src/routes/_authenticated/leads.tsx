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
  updateLead,
  deleteLead,
  cancelFollowup,
  sendFollowupNow,
  getSettings,
  updateSettings,
  getMyRole,
  getFollowupBoard,
} from "@/lib/whatsapp.functions";
import { listSenders } from "@/lib/senders.functions";

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
  const updateLeadFn = useServerFn(updateLead);
  const deleteLeadFn = useServerFn(deleteLead);
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
    Array<{ name: string; phone: string; product: string | null; car_model: string | null }> | null
  >(null);
  const [form, setForm] = useState({ name: "", phone: "", product: "", car_model: "" });
  const [editing, setEditing] = useState<{ id: string; name: string; phone: string; product: string; car_model: string } | null>(null);
  const [selectedSenderId, setSelectedSenderId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (payload: typeof form) => createLeadFn({ data: payload }),
    onSuccess: () => {
      toast.success("Lead ditambah — jadual followup dijana automatik");
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["followups"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setOpenLead(false);
      setForm({ name: "", phone: "", product: "", car_model: "" });
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

  const editLeadMutation = useMutation({
    mutationFn: (v: { id: string; name: string; phone: string; product: string }) =>
      updateLeadFn({ data: { id: v.id, name: v.name, phone: v.phone, product: v.product || null } }),
    onSuccess: () => {
      toast.success("Lead dikemaskini");
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["followup-board"] });
      setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal kemaskini lead"),
  });

  const deleteLeadMutation = useMutation({
    mutationFn: (id: string) => deleteLeadFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Lead dipadam");
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["followups"] });
      qc.invalidateQueries({ queryKey: ["followup-board"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal padam lead"),
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
                          <DropdownMenuItem
                            onClick={() =>
                              setEditing({
                                id: l.id,
                                name: l.name ?? "",
                                phone: l.phone ?? "",
                                product: l.product ?? "",
                              })
                            }
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit lead
                          </DropdownMenuItem>
                          {isAdmin && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                if (confirm(`Padam lead "${l.name}"? Semua followup akan dipadam.`))
                                  deleteLeadMutation.mutate(l.id);
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Padam lead
                            </DropdownMenuItem>
                          )}
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

          <FollowupBoard
            selectedSenderId={selectedSenderId}
            onSelectSender={setSelectedSenderId}
            onBack={() => setSelectedSenderId(null)}
            isAdmin={isAdmin}
            onCancelFollowup={(id) => cancelMutation.mutate(id)}
            onSendNow={(id) => sendNowMutation.mutate(id)}
          />
        </TabsContent>
      </Tabs>

      {/* Edit lead dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit lead</DialogTitle>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                editLeadMutation.mutate(editing);
              }}
            >
              <div>
                <Label htmlFor="e-name">Nama</Label>
                <Input
                  id="e-name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="e-phone">Telefon</Label>
                <Input
                  id="e-phone"
                  value={editing.phone}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="e-product">Produk</Label>
                <Input
                  id="e-product"
                  value={editing.product}
                  onChange={(e) => setEditing({ ...editing, product: e.target.value })}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Batal
                </Button>
                <Button type="submit" disabled={editLeadMutation.isPending}>
                  Simpan perubahan
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Followup Board (per-sender) ----------

function FollowupBoard(props: {
  selectedSenderId: string | null;
  onSelectSender: (id: string) => void;
  onBack: () => void;
  isAdmin: boolean;
  onCancelFollowup: (id: string) => void;
  onSendNow: (id: string) => void;
}) {
  const listSendersFn = useServerFn(listSenders);
  const getBoardFn = useServerFn(getFollowupBoard);

  const senders = useQuery({
    queryKey: ["senders", "for-followup"],
    queryFn: () => listSendersFn(),
  });

  const board = useQuery({
    queryKey: ["followup-board", props.selectedSenderId],
    queryFn: () => getBoardFn({ data: { senderId: props.selectedSenderId! } }),
    enabled: !!props.selectedSenderId,
    refetchInterval: 30_000,
  });

  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);

  if (!props.selectedSenderId) {
    const rows = senders.data ?? [];
    if (senders.isLoading) {
      return (
        <Card className="p-8 rounded-2xl text-center text-sm text-muted-foreground">
          Memuatkan sender…
        </Card>
      );
    }
    if (rows.length === 0) {
      return (
        <Card className="p-8 rounded-2xl text-center text-sm text-muted-foreground">
          Belum ada sender. Tambah di{" "}
          <Link to="/settings/whatsapp" className="text-primary underline">
            WhatsApp Automation
          </Link>
          .
        </Card>
      );
    }
    return (
      <div className="space-y-3">
        <div className="text-sm font-medium">Pilih nombor sender untuk lihat jadual followup</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {rows.map((s: any) => {
            const initials = (s.label ?? "S")
              .split(/\s+/)
              .map((p: string) => p[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            const connected = s.connection_status === "connected";
            return (
              <button
                key={s.id}
                onClick={() => props.onSelectSender(s.id)}
                className="text-left rounded-2xl border border-border bg-card p-4 hover:border-primary/60 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{s.label}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {s.phone_number}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <Badge
                    variant="outline"
                    className={
                      connected
                        ? "bg-success/15 text-success border-success/30"
                        : "bg-muted text-muted-foreground border-border"
                    }
                  >
                    {connected ? (
                      <>
                        <Wifi className="w-3 h-3 mr-1" /> Connected
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-3 h-3 mr-1" /> Offline
                      </>
                    )}
                  </Badge>
                  <span className="text-muted-foreground">
                    {s.current_lead_count ?? 0} lead
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const data = board.data;
  const sender = data?.sender;
  const leadsRows = data?.leads ?? [];

  // Compute set of day_offsets across all leads
  const allDays = Array.from(
    new Set(
      leadsRows.flatMap((l: any) =>
        (l.lead_followups ?? []).map((f: any) => Number(f.day_offset)),
      ),
    ),
  ).sort((a, b) => a - b);

  const initials = (sender?.label ?? "S")
    .split(/\s+/)
    .map((p: string) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card className="p-4 rounded-2xl flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="sm" onClick={props.onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Tukar sender
        </Button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{sender?.label ?? "—"}</div>
            <div className="text-xs text-muted-foreground font-mono truncate">
              {sender?.phone_number}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <Metric label="Terhantar hari ini" value={data?.summary.sentToday ?? 0} tone="success" />
          <Metric label="Pending" value={data?.summary.pending ?? 0} tone="warning" />
          <Metric label="Lead aktif" value={data?.summary.activeLeads ?? 0} tone="info" />
        </div>
      </Card>

      {/* Board */}
      <Card className="rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-sm font-medium">Jadual Followup — 1 baris per lead</div>
            <div className="text-xs text-muted-foreground">
              Klik kotak D untuk lihat detail semua hari untuk lead itu.
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {leadsRows.length} lead · {allDays.length} hari sequence
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Nama Lead</th>
                <th className="text-left px-4 py-3">Telefon</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Progress followup</th>
              </tr>
            </thead>
            <tbody>
              {leadsRows.map((lead: any) => {
                const fus = ((lead.lead_followups ?? []) as any[]).slice().sort(
                  (a, b) => Number(a.day_offset) - Number(b.day_offset),
                );
                const expanded = expandedLeadId === lead.id;
                return (
                  <FragmentRow key={lead.id}>
                    <tr className="border-t border-border hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">{lead.name}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        {lead.phone}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={STATUS_COLOR[lead.followup_status]}>
                          {lead.followup_status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {fus.length === 0 && (
                            <span className="text-xs text-muted-foreground italic">
                              Tiada jadual
                            </span>
                          )}
                          {fus.map((f: any) => (
                            <DayBox
                              key={f.id}
                              day={Number(f.day_offset)}
                              status={f.status}
                              onClick={() =>
                                setExpandedLeadId(expanded ? null : lead.id)
                              }
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-t border-border bg-muted/10">
                        <td colSpan={4} className="px-4 py-4">
                          <div className="rounded-xl border border-border overflow-hidden bg-card">
                            <table className="w-full text-xs">
                              <thead className="bg-muted/50 text-muted-foreground uppercase">
                                <tr>
                                  <th className="text-left px-3 py-2">Hari</th>
                                  <th className="text-left px-3 py-2">Status</th>
                                  <th className="text-left px-3 py-2">Dijadualkan</th>
                                  <th className="text-left px-3 py-2">Dihantar</th>
                                  <th className="text-left px-3 py-2">Mesej</th>
                                  <th className="text-right px-3 py-2">Aksi</th>
                                </tr>
                              </thead>
                              <tbody>
                                {fus.map((f: any) => (
                                  <tr key={f.id} className="border-t border-border align-top">
                                    <td className="px-3 py-2 font-mono">D{f.day_offset}</td>
                                    <td className="px-3 py-2">
                                      <Badge
                                        variant="outline"
                                        className={FU_STATUS_COLOR[f.status]}
                                      >
                                        {f.status}
                                      </Badge>
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                      {format(new Date(f.scheduled_at), "dd MMM, HH:mm")}
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                      {f.sent_at
                                        ? format(new Date(f.sent_at), "dd MMM, HH:mm")
                                        : "—"}
                                    </td>
                                    <td className="px-3 py-2 max-w-md">
                                      <div className="whitespace-pre-wrap break-words text-foreground/80">
                                        {f.rendered_message ??
                                          f.error_message ??
                                          <span className="italic text-muted-foreground">
                                            Belum dihantar
                                          </span>}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      {f.status === "pending" && (
                                        <div className="inline-flex gap-1">
                                          {props.isAdmin && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => props.onSendNow(f.id)}
                                            >
                                              <Send className="w-3 h-3 mr-1" />
                                              Hantar
                                            </Button>
                                          )}
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => props.onCancelFollowup(f.id)}
                                          >
                                            <XCircle className="w-3 h-3 mr-1" />
                                            Cancel
                                          </Button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}
              {board.isLoading && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    Memuatkan…
                  </td>
                </tr>
              )}
              {!board.isLoading && leadsRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    Tiada lead diagihkan kepada sender ini.
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

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Metric(props: { label: string; value: number | string; tone: "success" | "warning" | "info" }) {
  const toneClass =
    props.tone === "success"
      ? "text-success"
      : props.tone === "warning"
        ? "text-warning-foreground"
        : "text-info";
  return (
    <div className="text-center">
      <div className={`text-xl font-semibold ${toneClass}`}>{props.value}</div>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{props.label}</div>
    </div>
  );
}

function DayBox(props: { day: number; status: string; onClick: () => void }) {
  const base =
    "min-w-[36px] h-8 px-2 rounded-md text-[11px] font-mono font-semibold flex items-center justify-center border transition-colors cursor-pointer";
  let cls = "";
  if (props.status === "sent") {
    cls = "bg-success text-success-foreground border-success";
  } else if (props.status === "cancelled") {
    cls = "bg-transparent text-muted-foreground border-foreground/40";
  } else if (props.status === "failed") {
    cls = "bg-destructive/15 text-destructive border-destructive/40";
  } else {
    // pending
    cls = "bg-transparent text-muted-foreground border-border hover:border-primary/60";
  }
  return (
    <button type="button" onClick={props.onClick} className={`${base} ${cls}`} title={`D${props.day} · ${props.status}`}>
      D{props.day}
    </button>
  );
}
