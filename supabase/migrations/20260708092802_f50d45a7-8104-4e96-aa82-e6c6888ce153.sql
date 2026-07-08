CREATE TABLE public.whatsapp_api_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST',
  phone TEXT,
  sender TEXT,
  request_body JSONB,
  response_status INTEGER,
  response_body TEXT,
  ok BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  lead_id UUID,
  followup_id UUID,
  sender_id UUID,
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_api_logs_created_at ON public.whatsapp_api_logs (created_at DESC);
CREATE INDEX idx_wa_api_logs_ok ON public.whatsapp_api_logs (ok, created_at DESC);

GRANT SELECT ON public.whatsapp_api_logs TO authenticated;
GRANT ALL ON public.whatsapp_api_logs TO service_role;

ALTER TABLE public.whatsapp_api_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff/admin boleh lihat log API"
  ON public.whatsapp_api_logs
  FOR SELECT
  TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));