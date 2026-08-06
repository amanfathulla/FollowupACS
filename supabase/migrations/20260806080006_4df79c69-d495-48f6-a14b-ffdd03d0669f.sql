ALTER TABLE public.whatsapp_senders
  ADD COLUMN IF NOT EXISTS typing_seconds integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS stopper_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS batch_size integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS rest_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS resume_at timestamptz;