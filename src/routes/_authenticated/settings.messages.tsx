import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Save,
  Trash2,
  MessageCircle,
  MessagesSquare,
  Upload,
  ImageIcon,
  X,
} from "lucide-react";


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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

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

const MEDIA_TYPES = ["image", "video", "audio", "document"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

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

  const [category, setCategory] = useState<"prospect" | "customer">("prospect");
  const sequences = useQuery({ queryKey: ["sequences"], queryFn: () => listSequencesFn() });
  const activeSequence = (sequences.data ?? []).find(
    (s: any) => (s.category ?? "prospect") === category,
  );
  const steps = useQuery({
    queryKey: ["steps", activeSequence?.id],
    queryFn: () => listStepsFn({ data: { sequenceId: activeSequence!.id } }),
    enabled: !!activeSequence?.id,
  });


  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [draftDay, setDraftDay] = useState<number>(0);
  const [messageMode, setMessageMode] = useState<"text" | "media">("text");
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [mediaPath, setMediaPath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      if (s.media_type && s.media_url) {
        setMessageMode("media");
        setMediaType(s.media_type as MediaType);
        setMediaPath(s.media_url);
        void refreshPreview(s.media_url);
      } else {
        setMessageMode("text");
        setMediaPath(null);
        setPreviewUrl(null);
      }
    }
  }, [selectedStepId, steps.data]);

  async function refreshPreview(path: string) {
    if (!path) return setPreviewUrl(null);
    const [bucket, ...rest] = path.split("/");
    const { data } = await supabase.storage.from(bucket).createSignedUrl(rest.join("/"), 60 * 60);
    setPreviewUrl(data?.signedUrl ?? null);
  }

  async function handleFileUpload(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `steps/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("followup-media").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      const stored = `followup-media/${path}`;
      setMediaPath(stored);
      await refreshPreview(stored);
      toast.success("Fail dimuat naik");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Muat naik gagal");
    } finally {
      setUploading(false);
    }
  }

  const updateStepMutation = useMutation({
    mutationFn: () =>
      updateStepFn({
        data: {
          id: selectedStepId!,
          message_template: draftMessage,
          day_offset: draftDay,
          media_type: messageMode === "media" ? mediaType : null,
          media_url: messageMode === "media" ? mediaPath : null,
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
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
            Borang Mesej Harian
          </h1>
          <p className="text-sm text-muted-foreground">
            Susun ayat followup ikut hari untuk setiap kategori lead.
          </p>
        </div>

        {isAdmin && (
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button disabled={!activeSequence} className="shrink-0">
                <Plus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Tambah hari</span>
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

      {/* Category cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(
          [
            {
              key: "prospect" as const,
              title: "Mesej PROSPEK",
              sub: "Lead belum beli — kitaran memujuk",
              icon: MessageCircle,
              bg: "bg-info text-info-foreground",
            },
            {
              key: "customer" as const,
              title: "Mesej PELANGGAN",
              sub: "Lead dah beli — kitaran selepas jualan",
              icon: MessagesSquare,
              bg: "bg-whatsapp text-whatsapp-foreground",
            },
          ] as const
        ).map((c) => {
          const seq = (sequences.data ?? []).find(
            (s: any) => (s.category ?? "prospect") === c.key,
          );
          const count = c.key === category ? (steps.data?.length ?? 0) : null;
          const active = category === c.key;
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={() => {
                setCategory(c.key);
                setSelectedStepId(null);
              }}
              className={`relative overflow-hidden rounded-2xl p-5 text-left transition-all ${c.bg} ${
                active
                  ? "ring-4 ring-ring/40 shadow-lg"
                  : "opacity-80 hover:opacity-100 hover:shadow-md"
              }`}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium opacity-90">{c.title}</div>
                  <div className="mt-1 text-3xl font-bold leading-none">
                    {count === null ? "—" : count}
                    <span className="ml-1 text-sm font-medium opacity-80">hari</span>
                  </div>
                  <div className="mt-2 truncate text-xs opacity-85">{c.sub}</div>
                  <div className="mt-1 truncate text-xs opacity-70">
                    {seq?.name ?? "Sequence belum ada"}
                  </div>
                </div>
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/20">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              {active && (
                <Badge className="mt-3 border-0 bg-white/20 text-current">Sedang dipilih</Badge>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr] lg:gap-6">
        {/* Day list */}
        <Card className="h-fit overflow-hidden rounded-2xl p-0">
          <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Senarai hari
            </div>
            <Badge variant="outline" className="font-mono">
              {steps.data?.length ?? 0}
            </Badge>
          </div>
          <div className="max-h-[420px] space-y-1 overflow-y-auto p-3 lg:max-h-[560px]">
            {(steps.data ?? []).map((s: any) => {
              const active = selectedStepId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedStepId(s.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground/80 hover:bg-muted"
                  }`}
                >
                  <Badge
                    variant={active ? "secondary" : "outline"}
                    className="shrink-0 font-mono"
                  >
                    D{s.day_offset}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-xs opacity-85">
                    {s.message_template.slice(0, 30)}
                    {s.message_template.length > 30 ? "…" : ""}
                  </span>
                  {s.media_type && <ImageIcon className="h-3 w-3 shrink-0 opacity-70" />}
                </button>
              );
            })}
            {steps.data && steps.data.length === 0 && (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Belum ada langkah.
              </div>
            )}
          </div>
        </Card>

        {/* Editor */}
        <Card className="overflow-hidden rounded-2xl p-0">
          {selectedStep ? (
            <>
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b bg-gradient-to-r from-primary/10 to-transparent px-4 py-4 sm:px-6">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    Edit mesej — D{selectedStep.day_offset}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    Placeholder: <code>{"{{nama}}"}</code>, <code>{"{{produk}}"}</code>
                  </div>
                </div>
              </div>
              <div className="space-y-4 p-4 sm:p-6">


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
                <Label>Jenis mesej</Label>
                <div className="flex gap-2 mt-1">
                  <Button
                    type="button"
                    variant={messageMode === "text" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMessageMode("text")}
                    disabled={!isAdmin}
                  >
                    Teks sahaja
                  </Button>
                  <Button
                    type="button"
                    variant={messageMode === "media" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMessageMode("media")}
                    disabled={!isAdmin}
                  >
                    Teks + Media
                  </Button>
                </div>
              </div>

              {messageMode === "media" && (
                <div className="border rounded-xl p-4 space-y-3 bg-muted/20">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label>Jenis media</Label>
                      <Select
                        value={mediaType}
                        onValueChange={(v) => setMediaType(v as MediaType)}
                        disabled={!isAdmin}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="image">Gambar</SelectItem>
                          <SelectItem value="video">Video</SelectItem>
                          <SelectItem value="audio">Audio</SelectItem>
                          <SelectItem value="document">Dokumen</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <Label>Muat naik fail</Label>
                      <div className="flex gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFileUpload(f);
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={!isAdmin || uploading}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          {uploading ? "Uploading…" : "Pilih fail"}
                        </Button>
                        {mediaPath && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setMediaPath(null);
                              setPreviewUrl(null);
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  {previewUrl && (
                    <div className="rounded-lg overflow-hidden border max-w-sm">
                      {mediaType === "image" && (
                        <img src={previewUrl} alt="preview" className="w-full h-auto" />
                      )}
                      {mediaType === "video" && (
                        <video src={previewUrl} controls className="w-full h-auto" />
                      )}
                      {(mediaType === "audio" || mediaType === "document") && (
                        <div className="p-3 text-xs text-muted-foreground truncate">
                          {mediaPath}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label>{messageMode === "media" ? "Caption (opsyenal)" : "Ayat mesej"}</Label>
                <Textarea
                  rows={8}
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
              </div>
            </>
          ) : (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Pilih hari di senarai untuk edit ayat mesej.
            </div>

          )}
        </Card>
      </div>
    </div>
  );
}
