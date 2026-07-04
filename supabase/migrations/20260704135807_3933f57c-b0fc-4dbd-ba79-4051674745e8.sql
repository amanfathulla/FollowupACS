-- 1) whatsapp_senders
CREATE TABLE public.whatsapp_senders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  phone_number TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  gap_seconds INT NOT NULL DEFAULT 5,
  daily_limit INT NOT NULL DEFAULT 200,
  current_lead_count INT NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_senders TO authenticated;
GRANT ALL ON public.whatsapp_senders TO service_role;

ALTER TABLE public.whatsapp_senders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff/admin read senders"
  ON public.whatsapp_senders FOR SELECT TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "admin write senders"
  ON public.whatsapp_senders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- normalize phone on insert/update
CREATE OR REPLACE FUNCTION public.senders_normalize_phone()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.phone_number := public.normalize_my_phone(NEW.phone_number);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_senders_normalize
BEFORE INSERT OR UPDATE ON public.whatsapp_senders
FOR EACH ROW EXECUTE FUNCTION public.senders_normalize_phone();

-- 2) leads.assigned_sender_id
ALTER TABLE public.leads
  ADD COLUMN assigned_sender_id UUID REFERENCES public.whatsapp_senders(id) ON DELETE SET NULL;

CREATE INDEX idx_leads_assigned_sender ON public.leads(assigned_sender_id);

-- 3) Assignment BEFORE INSERT — pick sender with lowest current_lead_count
CREATE OR REPLACE FUNCTION public.assign_lead_sender()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chosen UUID;
BEGIN
  IF NEW.assigned_sender_id IS NULL THEN
    SELECT id INTO chosen
      FROM public.whatsapp_senders
     WHERE is_active = true
     ORDER BY current_lead_count ASC, created_at ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED;
    NEW.assigned_sender_id := chosen;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_leads_assign_sender
BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.assign_lead_sender();

-- Increment counter AFTER assignment
CREATE OR REPLACE FUNCTION public.bump_sender_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.assigned_sender_id IS NOT NULL THEN
    UPDATE public.whatsapp_senders
       SET current_lead_count = current_lead_count + 1
     WHERE id = NEW.assigned_sender_id;
  ELSIF TG_OP = 'DELETE' AND OLD.assigned_sender_id IS NOT NULL THEN
    UPDATE public.whatsapp_senders
       SET current_lead_count = GREATEST(current_lead_count - 1, 0)
     WHERE id = OLD.assigned_sender_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.assigned_sender_id IS DISTINCT FROM OLD.assigned_sender_id THEN
    IF OLD.assigned_sender_id IS NOT NULL THEN
      UPDATE public.whatsapp_senders
         SET current_lead_count = GREATEST(current_lead_count - 1, 0)
       WHERE id = OLD.assigned_sender_id;
    END IF;
    IF NEW.assigned_sender_id IS NOT NULL THEN
      UPDATE public.whatsapp_senders
         SET current_lead_count = current_lead_count + 1
       WHERE id = NEW.assigned_sender_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_leads_bump_sender_ins
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.bump_sender_count();

CREATE TRIGGER trg_leads_bump_sender_del
AFTER DELETE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.bump_sender_count();

CREATE TRIGGER trg_leads_bump_sender_upd
AFTER UPDATE OF assigned_sender_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.bump_sender_count();