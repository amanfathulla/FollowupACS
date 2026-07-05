
-- 1) Media support on followup steps
ALTER TABLE public.followup_steps
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_url text;

ALTER TABLE public.followup_steps
  DROP CONSTRAINT IF EXISTS followup_steps_media_type_check;
ALTER TABLE public.followup_steps
  ADD CONSTRAINT followup_steps_media_type_check
  CHECK (media_type IS NULL OR media_type IN ('image','video','audio','document'));

-- 2) Sender health monitoring cols
ALTER TABLE public.whatsapp_senders
  ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_failures int NOT NULL DEFAULT 0;

-- 3) Lead chatbot pause + whatsapp profile
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS chatbot_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_name text,
  ADD COLUMN IF NOT EXISTS whatsapp_pp_url text;

-- 4) lead_messages table (inbound + outbound history)
CREATE TABLE IF NOT EXISTS public.lead_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.whatsapp_senders(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image','video','audio','document')),
  content text,
  media_url text,
  is_read boolean NOT NULL DEFAULT false,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_messages_lead ON public.lead_messages (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_messages_sender ON public.lead_messages (sender_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_messages TO authenticated;
GRANT ALL ON public.lead_messages TO service_role;

ALTER TABLE public.lead_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff/admin read lead_messages"
  ON public.lead_messages FOR SELECT TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/admin insert lead_messages"
  ON public.lead_messages FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/admin update lead_messages"
  ON public.lead_messages FOR UPDATE TO authenticated
  USING (public.is_staff_or_admin(auth.uid()))
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='lead_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_messages';
  END IF;
END $$;

ALTER TABLE public.lead_messages REPLICA IDENTITY FULL;

-- 5) chatbot_settings (single row)
CREATE TABLE IF NOT EXISTS public.chatbot_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_active boolean NOT NULL DEFAULT false,
  ai_provider text NOT NULL DEFAULT 'gemini' CHECK (ai_provider IN ('claude','openai','gemini','lovable')),
  model_name text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  product_knowledge text,
  tone_instruction text NOT NULL DEFAULT 'Balas mesra dan santai macam admin sebenar, bukan robot. Guna Bahasa Melayu santai. Pisahkan setiap idea dengan ||| supaya boleh dipecahkan kepada beberapa mesej pendek.',
  api_key_configured boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, UPDATE ON public.chatbot_settings TO authenticated;
GRANT ALL ON public.chatbot_settings TO service_role;

ALTER TABLE public.chatbot_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff/admin read chatbot_settings"
  ON public.chatbot_settings FOR SELECT TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Admin update chatbot_settings"
  ON public.chatbot_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.chatbot_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 6) chatbot_credentials (per-provider API keys, admin-only)
CREATE TABLE IF NOT EXISTS public.chatbot_credentials (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  claude_api_key text,
  openai_api_key text,
  gemini_api_key text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.chatbot_credentials TO service_role;
GRANT ALL ON public.chatbot_credentials TO service_role;
ALTER TABLE public.chatbot_credentials ENABLE ROW LEVEL SECURITY;
-- No policies: only service role (server) can read/write
INSERT INTO public.chatbot_credentials (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
