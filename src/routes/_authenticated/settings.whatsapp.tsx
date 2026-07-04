import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Plug, Send, Trash2, Plus, Save, MessageCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  listSequences,
  listSteps,
  updateStep,
  addStep,
  deleteStep,
  getSettings,
  updateSettings,
  setCredentials,
  testConnection,
  getMyRole,
} from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/_authenticated/settings/whatsapp")({
  component: WhatsappSettingsPage,
});

function WhatsappSettingsPage() {
  const qc = useQueryClient();

  const listSequencesFn = useServerFn(listSequences);
  const listStepsFn = useServerFn(listSteps);
  const updateStepFn = useServerFn(updateStep);
  const addStepFn = useServerFn(addStep);
  const deleteStepFn = useServerFn(deleteStep);
  const getSettingsFn = useServerFn(getSettings);
  const updateSettingsFn = useServerFn(updateSettings);
  const setCredentialsFn = useServerFn(setCredentials);
  const testConnectionFn = useServerFn(testConnection);
  const getMyRoleFn = useServerFn(getMyRole);

  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyRoleFn() });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => getSettingsFn() });
  const sequences = useQuery({ queryKey: ["sequences"], queryFn: () => listSequencesFn() });
  const activeSequence = sequences.data?.[0];
  const steps = useQuery({
    queryKey: ["steps", activeSequence?.id],
    queryFn: () => listStepsFn({ data: { sequenceId: activeSequence!.id } }),
    enabled: !!activeSequence?.id,
  });

  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [sender, setSender] = useState("");
  useEffect(() => {
    if (settings.data) setSender(settings.data.sender_number ?? "");
  }, [settings.data]);

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [draftDay, setDraftDay] = useState<number>(0);

  useEffect(() => {
    if (!steps.data || steps.data.length === 0) return;
    if (!selectedStepId || !steps.data.some((s: any) => s.id === selectedStepId)) {
      setSelectedStepId(steps.data[0].id);
      setDraftMessage(steps.data[0].message_template);
      setDraftDay(steps.data[0].day_offset);
    }
  }, [steps.data, selectedStepId]);

  useEffect(() => {
    const s = steps.data?.find((x: any) => x.id === selectedStepId);
    if (s) {
      setDraftMessage(s.message_template);
      setDraftDay(s.day_offset);
    }
  }, [selectedStepId, steps.data]);

  const isAdmin = me.data?.isAdmin ?? false;

  const saveCredsMutation = useMutation({
    mutationFn: () =>
      setCredentialsFn({
        data: {
          apiKey: apiKey || null,
          sender: sender || null,
        },
      }),
    onSuccess: () => {
      toast.success("Sambungan disimpan");
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
    mutationFn: (num: string) => testConnectionFn({ data: { number: num } }),
    onSuccess: () => toast.success("Test mesej berjaya dihantar"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Test gagal"),
  });

  const updateStepMutation = useMutation({
    mutationFn: () =>
      updateStepFn({
        data: {
          id: selectedStepId!,
          message_template: draftMessage,
          day_offset: draftDay,
        },
      }),
    onSuccess: () => {
      toast.success("Mesej disimpan");
      qc.invalidateQueries({ queryKey: ["steps"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal simpan"),
  });

  const addStepMutation = useMutation({
    mutationFn: (v: { day_offset: number; message_template: string }) =>
      addStepFn({
        data: { sequenceId: activeSequence!.id, ...v },
      }),
    onSuccess: () => {
      toast.success("Langkah ditambah");
      qc.invalidateQueries({ queryKey: ["steps"] });
    },
  });

  const deleteStepMutation = useMutation({
    mutationFn: (id: string) => deleteStepFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Langkah dipadam");
      setSelectedStepId(null);
      qc.invalidateQueries({ queryKey: ["steps"] });
    },
  });

  const [testNumber, setTestNumber] = useState("");
  const [newDay, setNewDay] = useState<number>(1);
  const [newMessage, setNewMessage] = useState("Salam {{nama}}, ...");
  const [openNew, setOpenNew] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp Automation Settings</h1>
        <p className="text-sm text-muted-foreground">
          Konfigurasikan sambungan ustazai.my dan template mesej followup.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1 — Connection */}
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
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground">
                    Not connected
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div>
            <Label>Endpoint</Label>
            <Input value="https://ustazai.my/send-message" readOnly className="bg-muted/40" />
          </div>

          <div>
            <Label htmlFor="apiKey">API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
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
            <p className="text-xs text-muted-foreground mt-1">
              Disimpan di backend — tidak akan didedahkan ke client.
            </p>
          </div>

          <div>
            <Label htmlFor="sender">Sender (nombor device WhatsApp)</Label>
            <Input
              id="sender"
              placeholder="60172888xxxx"
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              disabled={!isAdmin}
            />
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
              disabled={!isAdmin || (!apiKey && !sender) || saveCredsMutation.isPending}
            >
              <Save className="w-4 h-4 mr-2" />
              Simpan sambungan
            </Button>
          </div>

          <div className="border-t pt-4 space-y-2">
            <Label htmlFor="test">Test Sambungan</Label>
            <div className="flex gap-2">
              <Input
                id="test"
                placeholder="No. telefon untuk test (contoh: 60172888xxxx)"
                value={testNumber}
                onChange={(e) => setTestNumber(e.target.value)}
                disabled={!isAdmin || !settings.data?.api_key_configured}
              />
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
          </div>
        </Card>

        {/* Panel 2 — Sequence summary */}
        <Card className="p-6 rounded-2xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="font-medium">{activeSequence?.name ?? "—"}</div>
              <div className="text-xs text-muted-foreground">
                {activeSequence?.description ?? "Sequence followup aktif"}
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-2">
              Setiap chip di bawah = 1 mesej dijadualkan pada hari tersebut.
            </div>
            <div className="flex flex-wrap gap-2">
              {(steps.data ?? []).map((s: any) => (
                <Badge
                  key={s.id}
                  variant={selectedStepId === s.id ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setSelectedStepId(s.id)}
                >
                  D{s.day_offset}
                </Badge>
              ))}
              {isAdmin && (
                <Dialog open={openNew} onOpenChange={setOpenNew}>
                  <DialogTrigger asChild>
                    <Badge variant="outline" className="cursor-pointer border-dashed">
                      <Plus className="w-3 h-3 mr-1" /> Tambah hari
                    </Badge>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Tambah langkah followup</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="d">Hari selepas lead masuk</Label>
                        <Input
                          id="d"
                          type="number"
                          min={0}
                          value={newDay}
                          onChange={(e) => setNewDay(Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="m">Mesej template</Label>
                        <Textarea
                          id="m"
                          rows={5}
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => {
                          addStepMutation.mutate({
                            day_offset: newDay,
                            message_template: newMessage,
                          });
                          setOpenNew(false);
                        }}
                      >
                        Tambah
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          <div className="border-t pt-4 text-xs text-muted-foreground space-y-1">
            <div>
              <strong className="text-foreground">Placeholder tersedia:</strong>{" "}
              <code className="text-xs">{"{{nama}}"}</code>,{" "}
              <code className="text-xs">{"{{produk}}"}</code>
            </div>
            <div>Cron hantar setiap jam — hantar mesej yang scheduled_at ≤ sekarang.</div>
          </div>
        </Card>
      </div>

      {/* Panel 3 — Message editor */}
      <Card className="p-6 rounded-2xl space-y-4">
        <div>
          <div className="font-medium">Borang Mesej Harian</div>
          <div className="text-xs text-muted-foreground">
            Pilih hari (tab) untuk edit template mesej.
          </div>
        </div>

        {steps.data && steps.data.length > 0 && selectedStepId && (
          <Tabs
            value={selectedStepId}
            onValueChange={setSelectedStepId}
            className="w-full"
          >
            <TabsList className="flex flex-wrap h-auto">
              {steps.data.map((s: any) => (
                <TabsTrigger key={s.id} value={s.id}>
                  D{s.day_offset}
                </TabsTrigger>
              ))}
            </TabsList>

            {steps.data.map((s: any) => (
              <TabsContent key={s.id} value={s.id} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <Label>Day offset</Label>
                    <Input
                      type="number"
                      min={0}
                      value={draftDay}
                      onChange={(e) => setDraftDay(Number(e.target.value))}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="md:col-span-3">
                    <Label>Placeholder</Label>
                    <Input readOnly value="{{nama}}, {{produk}}" className="bg-muted/40" />
                  </div>
                </div>
                <div>
                  <Label>Mesej</Label>
                  <Textarea
                    rows={7}
                    value={draftMessage}
                    onChange={(e) => setDraftMessage(e.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => updateStepMutation.mutate()}
                    disabled={!isAdmin || updateStepMutation.isPending}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Simpan mesej
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (confirm("Padam langkah ini?")) deleteStepMutation.mutate(s.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Padam
                    </Button>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </Card>
    </div>
  );
}
