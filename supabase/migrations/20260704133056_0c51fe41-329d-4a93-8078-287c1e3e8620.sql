
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'staff');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff_or_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','staff')
  )
$$;

CREATE POLICY "user can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Bootstrap: first user to sign up becomes admin automatically
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.bootstrap_first_admin();

-- Followup sequences
CREATE TABLE public.followup_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_sequences TO authenticated;
GRANT ALL ON public.followup_sequences TO service_role;
ALTER TABLE public.followup_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff can view sequences" ON public.followup_sequences
  FOR SELECT TO authenticated USING (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "admin can manage sequences" ON public.followup_sequences
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Followup steps
CREATE TABLE public.followup_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.followup_sequences(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  day_offset INT NOT NULL,
  message_template TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_followup_steps_sequence ON public.followup_steps (sequence_id, step_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_steps TO authenticated;
GRANT ALL ON public.followup_steps TO service_role;
ALTER TABLE public.followup_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff can view steps" ON public.followup_steps
  FOR SELECT TO authenticated USING (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "admin can manage steps" ON public.followup_steps
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Phone normalizer: strip non-digits, drop leading 0, ensure 60 prefix
CREATE OR REPLACE FUNCTION public.normalize_my_phone(raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits TEXT;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  digits := regexp_replace(raw, '\D', '', 'g');
  IF digits = '' THEN RETURN NULL; END IF;
  IF left(digits, 2) = '60' THEN
    RETURN digits;
  ELSIF left(digits, 1) = '0' THEN
    RETURN '60' || substring(digits from 2);
  ELSE
    RETURN '60' || digits;
  END IF;
END;
$$;

-- Leads
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  product TEXT,
  notes TEXT,
  followup_sequence_id UUID REFERENCES public.followup_sequences(id) ON DELETE SET NULL,
  followup_status TEXT NOT NULL DEFAULT 'active', -- active | replied | converted | stopped
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_leads_status ON public.leads (followup_status);
CREATE INDEX idx_leads_created ON public.leads (created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff can view leads" ON public.leads
  FOR SELECT TO authenticated USING (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "staff can insert leads" ON public.leads
  FOR INSERT TO authenticated WITH CHECK (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "staff can update leads" ON public.leads
  FOR UPDATE TO authenticated USING (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "admin can delete leads" ON public.leads
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Normalize phone on insert/update
CREATE OR REPLACE FUNCTION public.leads_normalize_phone()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.phone := public.normalize_my_phone(NEW.phone);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_leads_normalize_phone
BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.leads_normalize_phone();

-- Lead followups (jadual)
CREATE TABLE public.lead_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES public.followup_sequences(id) ON DELETE SET NULL,
  step_id UUID REFERENCES public.followup_steps(id) ON DELETE SET NULL,
  step_order INT,
  day_offset INT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed | cancelled
  provider_message_id TEXT,
  error_message TEXT,
  rendered_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lead_followups_status_scheduled ON public.lead_followups (status, scheduled_at);
CREATE INDEX idx_lead_followups_lead ON public.lead_followups (lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_followups TO authenticated;
GRANT ALL ON public.lead_followups TO service_role;
ALTER TABLE public.lead_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff can view followups" ON public.lead_followups
  FOR SELECT TO authenticated USING (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "staff can update followups" ON public.lead_followups
  FOR UPDATE TO authenticated USING (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "staff can insert followups" ON public.lead_followups
  FOR INSERT TO authenticated WITH CHECK (public.is_staff_or_admin(auth.uid()));

-- Auto-generate schedule on new lead
CREATE OR REPLACE FUNCTION public.generate_lead_followups()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  step RECORD;
  seq_id UUID;
BEGIN
  seq_id := COALESCE(
    NEW.followup_sequence_id,
    (SELECT id FROM public.followup_sequences WHERE is_active = true ORDER BY created_at LIMIT 1)
  );

  IF seq_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Save the assigned sequence back to the lead if it was defaulted
  IF NEW.followup_sequence_id IS NULL THEN
    UPDATE public.leads SET followup_sequence_id = seq_id WHERE id = NEW.id;
  END IF;

  FOR step IN
    SELECT * FROM public.followup_steps
    WHERE sequence_id = seq_id
    ORDER BY step_order
  LOOP
    INSERT INTO public.lead_followups
      (lead_id, sequence_id, step_id, step_order, day_offset, scheduled_at)
    VALUES
      (NEW.id, seq_id, step.id, step.step_order, step.day_offset,
       NEW.created_at + (step.day_offset || ' days')::interval);
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_followups
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.generate_lead_followups();

-- Cancel pending followups when a lead becomes replied/converted/stopped
CREATE OR REPLACE FUNCTION public.cancel_pending_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.followup_status <> 'active' AND (OLD.followup_status IS DISTINCT FROM NEW.followup_status) THEN
    UPDATE public.lead_followups
       SET status = 'cancelled', updated_at = now()
     WHERE lead_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cancel_pending_on_status_change
AFTER UPDATE OF followup_status ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.cancel_pending_on_status_change();

-- Settings table (single row): global automation on/off + sender number
CREATE TABLE public.whatsapp_settings (
  id INT PRIMARY KEY DEFAULT 1,
  automation_enabled BOOLEAN NOT NULL DEFAULT false,
  sender_number TEXT,
  api_key_configured BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO public.whatsapp_settings (id) VALUES (1);
GRANT SELECT ON public.whatsapp_settings TO authenticated;
GRANT ALL ON public.whatsapp_settings TO service_role;
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff can view settings" ON public.whatsapp_settings
  FOR SELECT TO authenticated USING (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "admin can update settings" ON public.whatsapp_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default sequence with 10 steps (D0, D3, D7, D10, D14, D17, D21, D24, D27, D30)
DO $$
DECLARE
  seq_id UUID;
BEGIN
  INSERT INTO public.followup_sequences (name, description, is_active)
  VALUES ('Standard Lead', 'Sequence followup standard 10x sebulan', true)
  RETURNING id INTO seq_id;

  INSERT INTO public.followup_steps (sequence_id, step_order, day_offset, message_template) VALUES
    (seq_id, 1, 0,  'Salam {{nama}}, terima kasih hubungi kami tentang {{produk}}. Boleh saya bantu lagi?'),
    (seq_id, 2, 3,  'Hai {{nama}}, cuma nak follow up. Ada apa-apa soalan tentang {{produk}}?'),
    (seq_id, 3, 7,  'Salam {{nama}}, minggu ni kami ada promosi menarik untuk {{produk}}. Nak saya kongsi?'),
    (seq_id, 4, 10, 'Hi {{nama}}, dah dapat brochure kami? Kalau perlu penjelasan lanjut boleh reply mesej ni ya.'),
    (seq_id, 5, 14, 'Salam {{nama}}, ramai customer kami dah upgrade ke {{produk}}. Nak saya emailkan testimoni?'),
    (seq_id, 6, 17, 'Hai {{nama}}, ada apa-apa yang buatkan awak masih fikirkan? Saya boleh bantu jelaskan.'),
    (seq_id, 7, 21, 'Salam {{nama}}, minggu ni last chance dapat harga promo untuk {{produk}}.'),
    (seq_id, 8, 24, 'Hi {{nama}}, kalau masa tak sesuai kami boleh follow up bulan depan. Just reply "NANTI".'),
    (seq_id, 9, 27, 'Salam {{nama}}, kami masih di sini bila-bila awak sedia teruskan.'),
    (seq_id, 10, 30, 'Hi {{nama}}, ini reminder terakhir. Kalau berminat, reply mesej ni ya. Terima kasih!');
END $$;
