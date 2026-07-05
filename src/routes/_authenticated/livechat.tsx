import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Send, User, Filter } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

import {
  listConversations,
  listLeadMessages,
  sendManualReply,
  listSendersLite,
} from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/_authenticated/livechat")({
  component: LiveChatPage,
});

function LiveChatPage() {
  const qc = useQueryClient();
  const convFn = useServerFn(listConversations);
  const msgFn = useServerFn(listLeadMessages);
  const replyFn = useServerFn(sendManualReply);
  const sendersFn = useServerFn(listSendersLite);

  const [senderFilter, setSenderFilter] = useState<string>("all");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const senders = useQuery({ queryKey: ["senders-lite"], queryFn: () => sendersFn() });

  const conversations = useQuery({
    queryKey: ["conversations", senderFilter],
    queryFn: () =>
      convFn({
        data: { senderId: senderFilter === "all" ? null : senderFilter },
      }),
    refetchInterval: 15000,
  });

  const messages = useQuery({
    queryKey: ["lead-messages", selectedLeadId],
    queryFn: () => msgFn({ data: { leadId: selectedLeadId! } }),
    enabled: !!selectedLeadId,
    refetchInterval: 8000,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("lead_messages_stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lead_messages" },
        (payload: any) => {
          qc.invalidateQueries({ queryKey: ["conversations"] });
          if (payload.new?.lead_id === selectedLeadId) {
            qc.invalidateQueries({ queryKey: ["lead-messages", selectedLeadId] });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, selectedLeadId]);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data]);

  const replyMutation = useMutation({
    mutationFn: (text: string) =>
      replyFn({ data: { leadId: selectedLeadId!, message: text } }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["lead-messages", selectedLeadId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal hantar"),
  });

  const selectedConv = useMemo(
    () => conversations.data?.find((c: any) => c.lead_id === selectedLeadId),
    [conversations.data, selectedLeadId],
  );

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live Chat</h1>
          <p className="text-sm text-muted-foreground">
            Semua perbualan WhatsApp — masuk & keluar — dalam satu tempat.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={senderFilter} onValueChange={setSenderFilter}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Semua nombor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua nombor</SelectItem>
              {(senders.data ?? []).map((s: any) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label} · {s.phone_number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 min-h-0">
        {/* Conversations list */}
        <Card className="rounded-2xl overflow-hidden flex flex-col">
          <div className="p-3 border-b text-xs text-muted-foreground uppercase tracking-wide">
            {conversations.data?.length ?? 0} perbualan
          </div>
          <div className="flex-1 overflow-y-auto divide-y">
            {(conversations.data ?? []).map((c: any) => {
              const active = c.lead_id === selectedLeadId;
              return (
                <button
                  key={c.lead_id}
                  onClick={() => setSelectedLeadId(c.lead_id)}
                  className={`w-full text-left p-3 flex gap-3 transition-colors ${
                    active ? "bg-muted" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 overflow-hidden">
                    {c.lead.whatsapp_pp_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.lead.whatsapp_pp_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm truncate">
                        {c.lead.whatsapp_name || c.lead.name}
                      </div>
                      {c.unread_count > 0 && (
                        <Badge className="bg-success text-white h-5 min-w-5 rounded-full px-1.5 text-[10px]">
                          {c.unread_count}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.last_message.content || `[${c.last_message.message_type}]`}
                    </div>
                  </div>
                </button>
              );
            })}
            {conversations.data && conversations.data.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-10">
                Tiada perbualan lagi.
              </div>
            )}
          </div>
        </Card>

        {/* Thread */}
        <Card className="rounded-2xl overflow-hidden flex flex-col">
          {selectedConv ? (
            <>
              <div className="p-3 border-b flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center overflow-hidden">
                  {selectedConv.lead.whatsapp_pp_url ? (
                    <img
                      src={selectedConv.lead.whatsapp_pp_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {selectedConv.lead.whatsapp_name || selectedConv.lead.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {selectedConv.lead.phone}
                  </div>
                </div>
                <Badge variant="outline">
                  {selectedConv.lead.followup_status}
                </Badge>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20">
                {(messages.data ?? []).map((m: any) => (
                  <MessageBubble key={m.id} msg={m} />
                ))}
                <div ref={bottomRef} />
              </div>

              <div className="p-3 border-t flex gap-2">
                <Textarea
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Taip mesej untuk hantar…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (draft.trim()) replyMutation.mutate(draft.trim());
                    }
                  }}
                />
                <Button
                  onClick={() => replyMutation.mutate(draft.trim())}
                  disabled={!draft.trim() || replyMutation.isPending}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Pilih perbualan dari sebelah kiri.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: any }) {
  const isOut = msg.direction === "outbound";
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
          isOut
            ? "bg-primary text-primary-foreground"
            : "bg-card border shadow-sm"
        }`}
      >
        {msg.message_type !== "text" && (
          <div className="text-xs italic opacity-70 mb-1">[{msg.message_type}]</div>
        )}
        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
        <div className={`text-[10px] mt-1 ${isOut ? "opacity-70" : "text-muted-foreground"}`}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}
