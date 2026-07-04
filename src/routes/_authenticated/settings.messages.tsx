import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Save, Trash2, MessageCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  listSequences,
  listSteps,
  updateStep,
  addStep,
  deleteStep,
  getMyRole,
} from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/_authenticated/settings/messages")({
  component: MessagesPage,
});

function MessagesPage() {
  const qc = useQueryClient();
  const listSequencesFn = useServerFn(listSequences);
  const listStepsFn = useServerFn(listSteps);
  const updateStepFn = useServerFn(updateStep);
  const addStepFn = useServerFn(addStep);
  const deleteStepFn = useServerFn(deleteStep);
  const getMyRoleFn = useServerFn(getMyRole);

  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyRoleFn() });
  const isAdmin = me.data?.isAdmin ?? false;

  const sequences = useQuery({ queryKey: ["sequences"], queryFn: () => listSequencesFn() });
  const activeSequence = sequences.data?.[0];
  const steps = useQuery({
    queryKey: ["steps", activeSequence?.id],
    queryFn: () => listStepsFn({ data: { sequenceId: activeSequence!.id } }),
    enabled: !!activeSequence?.id,
  });

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [draftDay, setDraftDay] = useState<number>(0);

  useEffect(() => {
    if (!steps.data || steps.data.length === 0) {
      setSelectedStepId(null);
      return;
    }
    if (!selectedStepId || !steps.data.some((s: any) => s.id === selectedStepId)) {
      setSelectedStepId(steps.data[0].id);
    }
  }, [steps.data, selectedStepId]);

  useEffect(() => {
    const s = steps.data?.find((x: any) => x.id === selectedStepId);
    if (s) {
      setDraftMessage(s.message_template);
      setDraftDay(s.day_offset);
    }
  }, [selectedStepId, steps.data]);

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

  const [openNew, setOpenNew] = useState(false);
  const [newDay, setNewDay] = useState<number>(1);
  const [newMessage, setNewMessage] = useState("Salam {{nama}}, ...");

  const addStepMutation = useMutation({
    mutationFn: (v: { day_offset: number; message_template: string }) =>
      addStepFn({ data: { sequenceId: activeSequence!.id, ...v } }),
    onSuccess: (created: any) => {
      toast.success("Langkah ditambah");
      qc.invalidateQueries({ queryKey: ["steps"] });
      if (created?.id) setSelectedStepId(created.id);
      setOpenNew(false);
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

  const selectedStep = steps.data?.find((x: any) => x.id === selectedStepId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Borang Mesej Harian</h1>
          <p className="text-sm text-muted-foreground">
            Edit ayat mesej followup untuk setiap hari dalam sequence{" "}
            <span className="font-medium text-foreground">{activeSequence?.name ?? "—"}</span>.
          </p>
        </div>
        {isAdmin && (
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button disabled={!activeSequence}>
                <Plus className="w-4 h-4 mr-2" />
                Tambah hari
              </Button>
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
                  onClick={() =>
                    addStepMutation.mutate({ day_offset: newDay, message_template: newMessage })
                  }
                  disabled={addStepMutation.isPending}
                >
                  Tambah
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Sidebar list — days */}
        <Card className="p-3 rounded-2xl h-fit">
          <div className="px-2 py-2 text-xs text-muted-foreground uppercase tracking-wide">
            Senarai hari
          </div>
          <div className="space-y-1">
            {(steps.data ?? []).map((s: any) => {
              const active = selectedStepId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedStepId(s.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-foreground/80"
                  }`}
                >
                  <Badge
                    variant={active ? "secondary" : "outline"}
                    className="shrink-0 font-mono"
                  >
                    D{s.day_offset}
                  </Badge>
                  <span className="truncate text-xs opacity-80">
                    {s.message_template.slice(0, 32)}
                    {s.message_template.length > 32 ? "…" : ""}
                  </span>
                </button>
              );
            })}
            {steps.data && steps.data.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6">
                Belum ada langkah. Tambah hari pertama.
              </div>
            )}
          </div>
        </Card>

        {/* Editor */}
        <Card className="p-6 rounded-2xl space-y-4">
          {selectedStep ? (
            <>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-medium">Edit mesej — D{selectedStep.day_offset}</div>
                  <div className="text-xs text-muted-foreground">
                    Placeholder: <code>{"{{nama}}"}</code>, <code>{"{{produk}}"}</code>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <Label>Hari (day offset)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draftDay}
                    onChange={(e) => setDraftDay(Number(e.target.value))}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="md:col-span-3">
                  <Label>Placeholder tersedia</Label>
                  <Input readOnly value="{{nama}}, {{produk}}" className="bg-muted/40" />
                </div>
              </div>

              <div>
                <Label>Ayat mesej</Label>
                <Textarea
                  rows={10}
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
                      if (confirm("Padam langkah ini?")) deleteStepMutation.mutate(selectedStep.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Padam
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-12">
              Pilih hari di sebelah kiri untuk edit ayat mesej.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
