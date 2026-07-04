import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  Plus,
  Trash2,
  Upload,
  Phone,
  Users,
  BarChart3,
  Send,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  listSenders,
  addSender,
  updateSender,
  deleteSender,
  bulkImportSenders,
  senderStats,
} from "@/lib/senders.functions";
import { getMyRole } from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/_authenticated/settings/senders")({
  component: SendersPage,
});

type PreviewRow = {
  label: string;
  phone_number: string;
  gap_seconds: number;
  daily_limit: number;
  is_active: boolean;
};

function SendersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSenders);
  const statsFn = useServerFn(senderStats);
  const addFn = useServerFn(addSender);
  const updateFn = useServerFn(updateSender);
  const deleteFn = useServerFn(deleteSender);
  const bulkFn = useServerFn(bulkImportSenders);
  const meFn = useServerFn(getMyRole);

  const me = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const isAdmin = me.data?.isAdmin ?? false;

  const senders = useQuery({ queryKey: ["senders"], queryFn: () => listFn() });
  const stats = useQuery({ queryKey: ["senderStats"], queryFn: () => statsFn() });

  const [openAdd, setOpenAdd] = useState(false);
  const [form, setForm] = useState<PreviewRow>({
    label: "",
    phone_number: "",
    gap_seconds: 5,
    daily_limit: 200,
    is_active: true,
  });

  const [preview, setPreview] = useState<PreviewRow[] | null>(null);

  const addMutation = useMutation({
    mutationFn: () => addFn({ data: form }),
    onSuccess: () => {
      toast.success("Nombor ditambah");
      setOpenAdd(false);
      setForm({ label: "", phone_number: "", gap_seconds: 5, daily_limit: 200, is_active: true });
      qc.invalidateQueries({ queryKey: ["senders"] });
      qc.invalidateQueries({ queryKey: ["senderStats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal tambah"),
  });

  const updateMutation = useMutation({
    mutationFn: (v: {
      id: string;
      gap_seconds?: number;
      daily_limit?: number;
      is_active?: boolean;
      label?: string;
    }) => updateFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["senders"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal kemaskini"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Nombor dipadam");
      qc.invalidateQueries({ queryKey: ["senders"] });
      qc.invalidateQueries({ queryKey: ["senderStats"] });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: (rows: PreviewRow[]) => bulkFn({ data: { rows } }),
    onSuccess: (r) => {
      toast.success(`Berjaya import ${r.inserted} nombor`);
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["senders"] });
      qc.invalidateQueries({ queryKey: ["senderStats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import gagal"),
  });

  async function handleFile(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const parsed: PreviewRow[] = rows
        .map((r) => {
          const label = String(r.Label ?? r.label ?? "").trim();
          const phone = String(r.Nombor ?? r.nombor ?? r.Phone ?? r.phone_number ?? "").trim();
          const gap = Number(r.Gap ?? r.gap ?? r.gap_seconds ?? 5);
          const limit = Number(r["Had Harian"] ?? r.daily_limit ?? r.limit ?? 200);
          return {
            label: label || phone,
            phone_number: phone,
            gap_seconds: Number.isFinite(gap) && gap > 0 ? gap : 5,
            daily_limit: Number.isFinite(limit) && limit > 0 ? limit : 200,
            is_active: true,
          };
        })
        .filter((r) => r.phone_number.length >= 6);
      if (parsed.length === 0) {
        toast.error("Tiada baris sah dalam fail. Pastikan lajur Label, Nombor wujud.");
        return;
      }
      setPreview(parsed);
    } catch (e) {
      toast.error("Gagal baca fail: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pengurusan Nombor WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Agih beban followup pada beberapa nombor device. Setiap lead kekal (sticky) dengan
            satu nombor sahaja.
          </p>
        </div>
        {isAdmin && (
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Tambah nombor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah nombor sender</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Label / Nota</Label>
                  <Input
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="Contoh: Team Sales A"
                  />
                </div>
                <div>
                  <Label>Nombor (60xxxxxxxxx)</Label>
                  <Input
                    value={form.phone_number}
                    onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                    placeholder="60172888xxxx"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Gap (saat)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.gap_seconds}
                      onChange={(e) =>
                        setForm({ ...form, gap_seconds: Number(e.target.value) || 1 })
                      }
                    />
                  </div>
                  <div>
                    <Label>Had harian</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.daily_limit}
                      onChange={(e) =>
                        setForm({ ...form, daily_limit: Number(e.target.value) || 1 })
                      }
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => addMutation.mutate()}
                  disabled={!form.label || !form.phone_number || addMutation.isPending}
                >
                  Simpan
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Phone className="w-5 h-5" />}
          label="Nombor aktif"
          value={`${stats.data?.totalActive ?? 0} / ${stats.data?.totalSenders ?? 0}`}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="Lead diagihkan"
          value={String(stats.data?.totalAssigned ?? 0)}
          color="bg-info/10 text-info"
        />
        <StatCard
          icon={<BarChart3 className="w-5 h-5" />}
          label="Purata / nombor"
          value={`~${stats.data?.avgPerSender ?? 0}`}
          color="bg-warning/15 text-warning"
        />
        <StatCard
          icon={<Send className="w-5 h-5" />}
          label="Terhantar hari ini"
          value={String(stats.data?.sentToday ?? 0)}
          color="bg-success/15 text-success"
        />
      </div>

      {/* Senders table */}
      <Card className="p-6 rounded-2xl">
        <div className="mb-4 font-medium">Senarai nombor sender</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Nombor</TableHead>
              <TableHead className="text-right">Lead assigned</TableHead>
              <TableHead className="w-28">Gap (s)</TableHead>
              <TableHead className="w-32">Had harian</TableHead>
              <TableHead className="w-24">Aktif</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(senders.data ?? []).map((s: any) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.label}</TableCell>
                <TableCell className="font-mono text-xs">{s.phone_number}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline">{s.current_lead_count}</Badge>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={1}
                    defaultValue={s.gap_seconds}
                    disabled={!isAdmin}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v && v !== s.gap_seconds)
                        updateMutation.mutate({ id: s.id, gap_seconds: v });
                    }}
                    className="h-8"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={1}
                    defaultValue={s.daily_limit}
                    disabled={!isAdmin}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v && v !== s.daily_limit)
                        updateMutation.mutate({ id: s.id, daily_limit: v });
                    }}
                    className="h-8"
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={s.is_active}
                    disabled={!isAdmin}
                    onCheckedChange={(v) => updateMutation.mutate({ id: s.id, is_active: v })}
                  />
                </TableCell>
                <TableCell>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Padam ${s.label}?`)) deleteMutation.mutate(s.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {senders.data && senders.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Belum ada nombor sender. Tambah satu untuk mula.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Bulk import */}
      {isAdmin && (
        <Card className="p-6 rounded-2xl space-y-4">
          <div>
            <div className="font-medium">Import Pukal (Excel / CSV)</div>
            <div className="text-xs text-muted-foreground">
              Lajur diperlukan: <code>Label</code>, <code>Nombor</code>, <code>Gap</code>,{" "}
              <code>Had Harian</code>. Format .xlsx atau .csv.
            </div>
          </div>

          <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-primary/50 transition-colors">
            <Upload className="w-8 h-8 text-muted-foreground mb-2" />
            <div className="text-sm text-muted-foreground">
              Klik untuk pilih fail atau drag & drop
            </div>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </label>

          {preview && (
            <div className="space-y-3">
              <div className="text-sm font-medium">
                Preview ({preview.length} baris) — semak sebelum simpan:
              </div>
              <div className="border rounded-lg max-h-64 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead>Nombor</TableHead>
                      <TableHead>Gap</TableHead>
                      <TableHead>Had</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{r.label}</TableCell>
                        <TableCell className="font-mono text-xs">{r.phone_number}</TableCell>
                        <TableCell>{r.gap_seconds}</TableCell>
                        <TableCell>{r.daily_limit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => bulkMutation.mutate(preview)}
                  disabled={bulkMutation.isPending}
                >
                  Simpan {preview.length} nombor
                </Button>
                <Button variant="outline" onClick={() => setPreview(null)}>
                  Batal
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function StatCard(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${props.color}`}>
          {props.icon}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{props.label}</div>
          <div className="text-lg font-semibold">{props.value}</div>
        </div>
      </div>
    </Card>
  );
}
