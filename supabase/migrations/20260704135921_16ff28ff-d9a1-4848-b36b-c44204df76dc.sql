ALTER TABLE public.lead_followups
  ADD COLUMN sender_id_used UUID REFERENCES public.whatsapp_senders(id) ON DELETE SET NULL;

CREATE INDEX idx_lead_followups_sender_sent
  ON public.lead_followups(sender_id_used, sent_at);