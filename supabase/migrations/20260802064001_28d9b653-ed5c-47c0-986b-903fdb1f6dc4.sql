ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_type text NOT NULL DEFAULT 'prospect';

ALTER TABLE public.followup_sequences
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'prospect';

CREATE OR REPLACE FUNCTION public.leads_validate_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.lead_type NOT IN ('prospect','converted') THEN
    RAISE EXCEPTION 'lead_type must be prospect or converted';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_validate_type ON public.leads;
CREATE TRIGGER trg_leads_validate_type
BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.leads_validate_type();

CREATE OR REPLACE FUNCTION public.sequences_validate_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.category NOT IN ('prospect','customer') THEN
    RAISE EXCEPTION 'category must be prospect or customer';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sequences_validate_category ON public.followup_sequences;
CREATE TRIGGER trg_sequences_validate_category
BEFORE INSERT OR UPDATE ON public.followup_sequences
FOR EACH ROW EXECUTE FUNCTION public.sequences_validate_category();

-- pick sequence matching the lead type
CREATE OR REPLACE FUNCTION public.generate_lead_followups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  step RECORD;
  seq_id UUID;
  want_cat TEXT;
BEGIN
  want_cat := CASE WHEN NEW.lead_type = 'converted' THEN 'customer' ELSE 'prospect' END;

  seq_id := COALESCE(
    NEW.followup_sequence_id,
    (SELECT id FROM public.followup_sequences
      WHERE is_active = true AND category = want_cat
      ORDER BY created_at LIMIT 1)
  );

  IF seq_id IS NULL THEN
    RETURN NEW;
  END IF;

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

INSERT INTO public.followup_sequences (name, description, is_active, category)
SELECT 'Mesej Pelanggan', 'Sequence followup untuk lead yang sudah beli (converted)', true, 'customer'
WHERE NOT EXISTS (SELECT 1 FROM public.followup_sequences WHERE category = 'customer');