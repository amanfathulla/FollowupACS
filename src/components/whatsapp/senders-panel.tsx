import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Phone,
  Users,
  BarChart3,
  Send,
  CheckCircle2,
  PauseCircle,
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
  senderStats,
} from "@/lib/senders.functions";
import { getMyRole } from "@/lib/whatsapp.functions";

export function SendersPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSenders);
  const statsFn = useServerFn(senderStats);
  const addFn = useServerFn(addSender);
  const updateFn = useServerFn(updateSender);
  const deleteFn = useServerFn(deleteSender);
  const meFn = useServerFn(getMyRole);

  const me = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const isAdmin = me.data?.isAdmin ?? false;

  const senders = useQuery({ queryKey: ["senders"], queryFn: () => listFn() });
  const stats = useQuery({ queryKey: ["senderStats"], queryFn: () => statsFn() });

  const [openAdd, setOpenAdd] = useState(false);
  const [form, setForm] = useState({
    label: "",
    phone_number: "",
    gap_seconds: 5,
    daily_limit: 200,
    is_active: true,
  });

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
      qc.invalidateQueries({ queryKey: ["senderStats"] });
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Senarai Nombor Sender</h2>
          <p className="text-sm text-muted-foreground">
            Agih beban followup pada beberapa nombor device. Setiap lead kekal (sticky) dengan satu nombor.
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

      <Card className="p-4 rounded-2xl bg-info/5 border-info/30">
        <div className="text-sm text-foreground/80">
          <strong>Bagaimana lead diagihkan:</strong> Setiap lead baru akan dihantar automatik ke nombor sender yang statusnya{" "}
          <Badge variant="outline" className="bg-success/15 text-success border-success/30 mx-1">Aktif</Badge>
          dengan jumlah lead paling sedikit. Sekali lead dipasangkan dengan satu nombor, ia kekal dengan nombor tersebut untuk semua followup. Nombor{" "}
          <Badge variant="outline" className="bg-muted text-muted-foreground mx-1">Tidak aktif</Badge>{" "}
          tidak akan diagih lead baru.
        </div>
      </Card>

      <Card className="p-6 rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Status</TableHead>
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
                <TableCell>
                  {s.is_active ? (
                    <Badge variant="outline" className="bg-success/15 text-success border-success/30 gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Aktif — terima lead
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted text-muted-foreground gap-1">
                      <PauseCircle className="w-3 h-3" />
                      Tidak aktif
                    </Badge>
                  )}
                </TableCell>
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
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Belum ada nombor sender. Tambah satu untuk mula.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
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
