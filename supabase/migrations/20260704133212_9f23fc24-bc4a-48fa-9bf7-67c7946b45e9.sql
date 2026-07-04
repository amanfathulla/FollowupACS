
CREATE TABLE public.whatsapp_credentials (
  id INT PRIMARY KEY DEFAULT 1,
  api_key TEXT,
  sender_number TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_cred_row CHECK (id = 1)
);
INSERT INTO public.whatsapp_credentials (id) VALUES (1);
-- NO grant to anon/authenticated: only service_role can read/write. Admin flows via server fn using service role.
GRANT ALL ON public.whatsapp_credentials TO service_role;
ALTER TABLE public.whatsapp_credentials ENABLE ROW LEVEL SECURITY;
-- No policies = zero access for anon/authenticated.
