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
  Phone,
  Video,
  MoreVertical,
  Smile,
  Paperclip,
  Mic,
  CheckCheck,
  FileText,
  Music2,
  Clock3,
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
import { MESSAGE_PLACEHOLDERS } from "@/lib/placeholders";


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
  head: () => ({
    meta: [
      { title: "Borang Mesej Harian — ACS CRM" },
      {
        name: "description",
        content: "Susun dan pratonton mesej WhatsApp automatik mengikut hari.",
      },
      { property: "og:title", content: "Borang Mesej Harian — ACS CRM" },
      {
        property: "og:description",
        content: "Susun dan pratonton mesej WhatsApp automatik mengikut hari.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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
    queryFn: () => {
      if (!activeSequence?.id) return Promise.resolve([]);
      return listStepsFn({ data: { sequenceId: activeSequence.id } });
    },
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
  const messageRef = useRef<HTMLTextAreaElement | null>(null);

  function insertPlaceholder(token: string) {
    const el = messageRef.current;
    if (!el) {
      setDraftMessage((m) => m + token);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    setDraftMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }



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
    mutationFn: () => {
      if (!selectedStepId) throw new Error("Pilih hari dahulu");
      return updateStepFn({
        data: {
          id: selectedStepId,
          message_template: draftMessage,
          day_offset: draftDay,
          media_type: messageMode === "media" ? mediaType : null,
          media_url: messageMode === "media" ? mediaPath : null,
        },
      });
    },
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
    mutationFn: (v: { day_offset: number; message_template: string }) => {
      if (!activeSequence?.id) throw new Error("Sequence belum ada");
      return addStepFn({ data: { sequenceId: activeSequence.id, ...v } });
    },
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
  const previewMessage = MESSAGE_PLACEHOLDERS.reduce(
    (message, placeholder) => message.split(placeholder.token).join(placeholder.example),
    draftMessage,
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-whatsapp">
            <MessageCircle className="h-4 w-4" /> Studio mesej automatik
          </div>
          <h1 className="text-2xl font-bold sm:text-3xl">Borang Mesej Harian</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sediakan mesej dan lihat rupa sebenar sebelum dihantar.</p>
        </div>
        {isAdmin && (
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild><Button disabled={!activeSequence}><Plus className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Tambah hari</span></Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Tambah langkah followup</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label htmlFor="d">Hari selepas lead masuk</Label><Input id="d" type="number" min={0} value={newDay} onChange={(e) => setNewDay(Number(e.target.value))} /></div>
                <div><Label htmlFor="m">Mesej template</Label><Textarea id="m" rows={5} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} /></div>
              </div>
              <DialogFooter><Button onClick={() => addStepMutation.mutate({ day_offset: newDay, message_template: newMessage })} disabled={addStepMutation.isPending}>Tambah</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </header>

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Kategori mesej">
        {([
          { key: "prospect" as const, title: "Mesej Prospek", sub: "Lead belum beli", icon: MessageCircle, tone: "bg-info" },
          { key: "customer" as const, title: "Mesej Pelanggan", sub: "Susulan selepas jualan", icon: MessagesSquare, tone: "bg-whatsapp" },
        ]).map((item) => {
          const active = category === item.key;
          const seq = (sequences.data ?? []).find((s: any) => (s.category ?? "prospect") === item.key);
          const Icon = item.icon;
          return (
            <Button key={item.key} type="button" variant="outline" onClick={() => { setCategory(item.key); setSelectedStepId(null); }} className={`h-auto justify-start gap-3 border-2 px-4 py-4 text-left ${active ? "border-whatsapp bg-stat-2 shadow-sm" : "bg-card"}`}>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${item.tone} text-whatsapp-foreground`}><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block font-semibold">{item.title}</span><span className="block truncate text-xs font-normal text-muted-foreground">{item.sub} · {seq?.name ?? "Sequence belum ada"}</span></span>
              {active && <Badge className="bg-whatsapp text-whatsapp-foreground">Aktif</Badge>}
            </Button>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div><p className="text-xs font-semibold uppercase text-muted-foreground">Pilih hari followup</p><p className="text-sm font-medium">{steps.data?.length ?? 0} mesej dalam siri ini</p></div>
          <Clock3 className="h-5 w-5 text-whatsapp" />
        </div>
        <div className="flex gap-2 overflow-x-auto p-3">
          {(steps.data ?? []).map((step: any) => {
            const active = selectedStepId === step.id;
            return <Button key={step.id} type="button" variant={active ? "default" : "outline"} onClick={() => setSelectedStepId(step.id)} className={`h-14 min-w-16 shrink-0 flex-col gap-0 ${active ? "bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90" : ""}`}><span className="text-sm font-bold">D{step.day_offset}</span><span className="text-[10px] font-normal opacity-80">Hari {step.day_offset}</span></Button>;
          })}
          {steps.data?.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Belum ada langkah.</p>}
        </div>
      </section>

      {selectedStep ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="overflow-hidden rounded-xl p-0 shadow-sm">
            <div className="flex items-center gap-3 border-b bg-stat-2 px-5 py-4">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-whatsapp text-whatsapp-foreground"><MessageCircle className="h-5 w-5" /></span>
              <div><p className="font-semibold">Edit mesej — D{selectedStep.day_offset}</p><p className="text-xs text-muted-foreground">Perubahan terus dipaparkan pada telefon</p></div>
            </div>
            <div className="space-y-5 p-4 sm:p-6">
              <div className="grid gap-4 md:grid-cols-[160px_1fr]">
                <div><Label htmlFor="message-day">Hari selepas lead masuk</Label><Input id="message-day" type="number" min={0} value={draftDay} onChange={(e) => setDraftDay(Number(e.target.value))} disabled={!isAdmin} /></div>
                <div><Label>Jenis mesej</Label><div className="mt-1 flex gap-2"><Button type="button" variant={messageMode === "text" ? "default" : "outline"} size="sm" onClick={() => setMessageMode("text")} disabled={!isAdmin}>Teks sahaja</Button><Button type="button" variant={messageMode === "media" ? "default" : "outline"} size="sm" onClick={() => setMessageMode("media")} disabled={!isAdmin}>Teks + Media</Button></div></div>
              </div>

              <div><Label>Masukkan maklumat lead</Label><div className="mt-2 flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3">{MESSAGE_PLACEHOLDERS.map((placeholder) => <Button key={placeholder.token} type="button" variant="outline" size="sm" disabled={!isAdmin} onClick={() => insertPlaceholder(placeholder.token)} title={`${placeholder.column} · contoh: ${placeholder.example}`} className="h-auto gap-1 px-2 py-1"><span className="font-mono text-xs">{placeholder.token}</span><span className="text-[10px] text-muted-foreground">{placeholder.label}</span></Button>)}</div></div>

              {messageMode === "media" && (
                <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div><Label>Jenis media</Label><Select value={mediaType} onValueChange={(value) => setMediaType(value as MediaType)} disabled={!isAdmin}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="image">Gambar</SelectItem><SelectItem value="video">Video</SelectItem><SelectItem value="audio">Audio</SelectItem><SelectItem value="document">Dokumen</SelectItem></SelectContent></Select></div>
                    <div className="md:col-span-2"><Label>Muat naik fail</Label><div className="mt-1 flex gap-2"><input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleFileUpload(file); }} /><Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={!isAdmin || uploading}><Upload className="mr-2 h-4 w-4" />{uploading ? "Memuat naik…" : "Pilih fail"}</Button>{mediaPath && <Button type="button" variant="ghost" size="icon" aria-label="Buang media" onClick={() => { setMediaPath(null); setPreviewUrl(null); }}><X className="h-4 w-4" /></Button>}</div></div>
                  </div>
                </div>
              )}

              <div><div className="mb-2 flex items-end justify-between gap-3"><Label htmlFor="message-copy">{messageMode === "media" ? "Caption mesej" : "Ayat mesej"}</Label><span className="text-xs text-muted-foreground">{draftMessage.length} aksara</span></div><Textarea id="message-copy" ref={messageRef} rows={12} value={draftMessage} onChange={(e) => setDraftMessage(e.target.value)} disabled={!isAdmin} className="resize-y bg-muted/20 text-base leading-relaxed" /></div>

              <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-between"><Button variant="outline" onClick={() => { if (confirm("Padam langkah ini?")) deleteStepMutation.mutate(selectedStep.id); }} disabled={!isAdmin}><Trash2 className="mr-2 h-4 w-4" />Padam</Button><Button onClick={() => updateStepMutation.mutate()} disabled={!isAdmin || updateStepMutation.isPending} className="bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90"><Save className="mr-2 h-4 w-4" />Simpan & kemas kini</Button></div>
            </div>
          </Card>

          <aside className="xl:sticky xl:top-5">
            <div className="mb-3 flex items-center justify-between"><div><p className="font-semibold">Pratonton WhatsApp</p><p className="text-xs text-muted-foreground">Data contoh menggantikan placeholder</p></div><Badge variant="outline" className="gap-1 border-whatsapp text-whatsapp"><span className="h-2 w-2 rounded-full bg-whatsapp" /> Live</Badge></div>
            <div className="mx-auto w-full max-w-[350px] rounded-[2.25rem] border-[7px] border-phone-frame bg-phone-frame p-1 shadow-xl">
              <div className="relative flex h-[650px] flex-col overflow-hidden rounded-[1.75rem] bg-chat-wallpaper">
                <div className="absolute left-1/2 top-0 z-20 h-5 w-28 -translate-x-1/2 rounded-b-xl bg-phone-frame" />
                <div className="flex items-center gap-3 bg-chat-header px-3 pb-3 pt-8 text-chat-header-foreground">
                  <Phone className="h-4 w-4" /><span className="grid h-9 w-9 place-items-center rounded-full bg-chat-avatar"><MessageCircle className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{category === "prospect" ? "Ahmad" : "Pelanggan ACS"}</p><p className="text-[10px] opacity-80">dalam talian</p></div><Video className="h-4 w-4" /><MoreVertical className="h-4 w-4" />
                </div>
                <div className="flex flex-1 flex-col justify-end overflow-y-auto p-3">
                  <div className="relative ml-auto max-w-[88%] whitespace-pre-wrap rounded-lg rounded-tr-none bg-chat-bubble p-2.5 text-[12px] leading-relaxed text-chat-bubble-foreground shadow-sm">
                    {messageMode === "media" && previewUrl && mediaType === "image" && <img src={previewUrl} alt="Media mesej" className="mb-2 max-h-48 w-full rounded-md object-cover" />}
                    {messageMode === "media" && previewUrl && mediaType === "video" && <video src={previewUrl} controls className="mb-2 max-h-48 w-full rounded-md" />}
                    {messageMode === "media" && mediaType === "audio" && <div className="mb-2 flex items-center gap-2 rounded-md bg-chat-media p-3"><Music2 className="h-5 w-5" /><span>Audio followup</span></div>}
                    {messageMode === "media" && mediaType === "document" && <div className="mb-2 flex items-center gap-2 rounded-md bg-chat-media p-3"><FileText className="h-5 w-5" /><span className="truncate">Dokumen followup</span></div>}
                    <span>{previewMessage || "Mesej anda akan kelihatan di sini."}</span>
                    <span className="mt-1 flex items-center justify-end gap-1 text-[9px] text-chat-meta">3:54 PTG <CheckCheck className="h-3 w-3 text-info" /></span>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2"><div className="flex h-10 flex-1 items-center gap-2 rounded-full bg-chat-input px-3 text-chat-meta"><Smile className="h-5 w-5" /><span className="flex-1 text-xs">Mesej</span><Paperclip className="h-4 w-4" /></div><span className="grid h-10 w-10 place-items-center rounded-full bg-whatsapp text-whatsapp-foreground"><Mic className="h-4 w-4" /></span></div>
              </div>
            </div>
          </aside>
        </div>
      ) : <Card className="grid min-h-52 place-items-center p-8 text-center"><div><MessageCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">Pilih hari untuk mula mengedit</p><p className="text-sm text-muted-foreground">Pratonton WhatsApp akan muncul secara langsung.</p></div></Card>}
    </div>
  );
}
