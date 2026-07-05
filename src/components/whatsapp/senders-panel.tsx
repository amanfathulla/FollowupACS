import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
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
  WifiOff,
  Wifi,
  QrCode,
  RefreshCcw,
  AlertTriangle,
  Power,
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
  generateSenderQr,
  disconnectSender,
  reassignLeadsFromSender,
} from "@/lib/senders.functions";
import { getMyRole } from "@/lib/whatsapp.functions";

export function SendersPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSenders);
  const statsFn = useServerFn(senderStats);
  const addFn = useServerFn(addSender);
  const updateFn = useServerFn(updateSender);
  const deleteFn = useServerFn(deleteSender);
  const qrFn = useServerFn(generateSenderQr);
  const disconnectFn = useServerFn(disconnectSender);
  const reassignFn = useServerFn(reassignLeadsFromSender);
  const meFn = useServerFn(getMyRole);

  const me = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const isAdmin = me.data?.isAdmin ?? false;

  const senders = useQuery({
    queryKey: ["senders"],
    queryFn: () => listFn(),
    refetchInterval: 20000,
  });
  const stats = useQuery({ queryKey: ["senderStats"], queryFn: () => statsFn() });

  const [openAdd, setOpenAdd] = useState(false);
  const [form, setForm] = useState({
    label: "",
    phone_number: "",
    gap_seconds: 5,
    daily_limit: 200,
    is_active: true,
  });

  // QR modal state
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDevice, setQrDevice] = useState<string>("");
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<"idle" | "polling" | "connected" | "timeout">("idle");
  const pollRef = useRef<{ stop: boolean; attempts: number }>({ stop: false, attempts: 0 });

  const addMutation = useMutation({
    mutationFn: () => addFn({ data: form }),
    onSuccess: (created: any) => {
      toast.success("Nombor ditambah");
      setOpenAdd(false);
      qc.invalidateQueries({ queryKey: ["senders"] });
      qc.invalidateQueries({ queryKey: ["senderStats"] });
      // Auto-open QR for new sender
      setQrDevice(created.phone_number);
      setForm({ label: "", phone_number: "", gap_seconds: 5, daily_limit: 200, is_active: true });
      openQrFor(created.phone_number);
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

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => disconnectFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Nombor telah disconnect");
      qc.invalidateQueries({ queryKey: ["senders"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal disconnect"),
  });

  const reassignMutation = useMutation({
    mutationFn: (id: string) => reassignFn({ data: { fromSenderId: id } }),
    onSuccess: (r: any) => {
      toast.success(`${r.moved} lead diagih semula`);
      qc.invalidateQueries({ queryKey: ["senders"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal agih"),
  });

  async function openQrFor(phone: string) {
    setQrDevice(phone);
    setQrImage(null);
    setQrStatus("polling");
    setQrOpen(true);
    pollRef.current = { stop: false, attempts: 0 };
    // Loop
    while (!pollRef.current.stop && pollRef.current.attempts < 40) {
      pollRef.current.attempts++;
      try {
        const r: any = await qrFn({ data: { device: phone, force: pollRef.current.attempts === 1 } });
        if (r.status === "connected") {
          setQrStatus("connected");
          toast.success("Device disambungkan");
          qc.invalidateQueries({ queryKey: ["senders"] });
          return;
        }
        if (r.status === "qrcode" && r.qrcode) {
          setQrImage(r.qrcode);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal generate QR");
        setQrStatus("idle");
        return;
      }
      await new Promise((res) => setTimeout(res, 3000));
    }
    if (!pollRef.current.stop) setQrStatus("timeout");
  }

  function closeQr() {
    pollRef.current.stop = true;
    setQrOpen(false);
    setQrImage(null);
    setQrStatus("idle");
  }

  const disconnectedCount =
    senders.data?.filter((s: any) => s.connection_status === "disconnected").length ?? 0;

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
                <p className="text-xs text-muted-foreground">
                  Selepas disimpan, modal QR akan buka untuk connect device baharu.
                </p>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => addMutation.mutate()}
                  disabled={!form.label || !form.phone_number || addMutation.isPending}
                >
                  Simpan & connect
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {disconnectedCount > 0 && (
        <Card className="p-4 rounded-2xl bg-destructive/5 border-destructive/30">
          <div className="flex items-center gap-3 text-sm">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <strong>{disconnectedCount} nombor terputus sambungan.</strong>{" "}
              Followup untuk lead yang assigned kepada nombor tersebut telah dijeda. Klik{" "}
              <em>Reconnect</em> pada row untuk scan QR semula.
            </div>
          </div>
        </Card>
      )}

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
          dengan jumlah lead paling sedikit. Sekali lead dipasangkan dengan satu nombor, ia kekal dengan nombor tersebut untuk semua followup.
        </div>
      </Card>

      <Card className="p-6 rounded-2xl overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Sambungan</TableHead>
              <TableHead className="w-32">Terima lead</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Nombor</TableHead>
              <TableHead className="text-right">Assigned</TableHead>
              <TableHead className="w-24">Gap (s)</TableHead>
              <TableHead className="w-28">Had harian</TableHead>
              <TableHead className="w-20">Aktif</TableHead>
              <TableHead className="w-32">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(senders.data ?? []).map((s: any) => (
              <TableRow
                key={s.id}
                className={s.connection_status === "disconnected" ? "bg-destructive/5" : ""}
              >
                <TableCell>
                  {s.connection_status === "connected" && (
                    <Badge variant="outline" className="bg-success/15 text-success border-success/30 gap-1">
                      <Wifi className="w-3 h-3" />
                      Connected
                    </Badge>
                  )}
                  {s.connection_status === "disconnected" && (
                    <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 gap-1">
                      <WifiOff className="w-3 h-3" />
                      Disconnected
                    </Badge>
                  )}
                  {s.connection_status === "unknown" && (
                    <Badge variant="outline" className="bg-muted text-muted-foreground gap-1">
                      Belum disemak
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {s.is_active ? (
                    <Badge variant="outline" className="bg-success/15 text-success border-success/30 gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Aktif
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
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={s.connection_status === "connected" ? "Reconnect (QR)" : "Connect (QR)"}
                        onClick={() => openQrFor(s.phone_number)}
                      >
                        {s.connection_status === "connected" ? (
                          <RefreshCcw className="w-4 h-4" />
                        ) : (
                          <QrCode className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Disconnect"
                        onClick={() => {
                          if (s.current_lead_count > 0) {
                            const doReassign = confirm(
                              `${s.label} masih ada ${s.current_lead_count} lead assigned.\n\nOK = agih semula lead ke nombor lain dahulu\nCancel = disconnect sahaja (lead tergendala sehingga diagih manual)`,
                            );
                            if (doReassign) reassignMutation.mutate(s.id);
                          }
                          if (confirm(`Disconnect ${s.label}?`)) disconnectMutation.mutate(s.id);
                        }}
                      >
                        <Power className="w-4 h-4 text-destructive" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Padam"
                        onClick={() => {
                          if (confirm(`Padam ${s.label}? Sejarah followup dikekalkan.`))
                            deleteMutation.mutate(s.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {senders.data && senders.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Belum ada nombor sender. Tambah satu untuk mula.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* QR modal */}
      <Dialog open={qrOpen} onOpenChange={(v) => (v ? setQrOpen(true) : closeQr())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sambung device: {qrDevice}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-center">
            {qrStatus === "connected" && (
              <div className="py-8 space-y-2">
                <CheckCircle2 className="w-12 h-12 mx-auto text-success" />
                <div className="font-medium">Device berjaya disambung!</div>
              </div>
            )}
            {qrStatus === "timeout" && (
              <div className="py-6 space-y-2">
                <AlertTriangle className="w-12 h-12 mx-auto text-warning" />
                <div>Sambungan tamat tempoh. Sila cuba lagi.</div>
                <Button variant="outline" onClick={() => openQrFor(qrDevice)}>
                  <RefreshCcw className="w-4 h-4 mr-2" /> Cuba lagi
                </Button>
              </div>
            )}
            {qrStatus === "polling" && (
              <>
                {qrImage ? (
                  <>
                    <div className="text-sm text-muted-foreground">
                      Scan QR ini menggunakan WhatsApp di telefon nombor {qrDevice}
                    </div>
                    <img src={qrImage} alt="QR" className="mx-auto max-w-xs" />
                  </>
                ) : (
                  <div className="py-10 space-y-2">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                    <div className="text-sm text-muted-foreground">Menyediakan QR…</div>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeQr}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
