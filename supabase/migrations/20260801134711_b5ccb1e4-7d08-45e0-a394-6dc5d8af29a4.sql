-- Prevent duplicates so backfill is idempotent
DELETE FROM public.lead_followups a
USING public.lead_followups b
WHERE a.step_id = b.step_id
  AND a.lead_id = b.lead_id
  AND a.step_id IS NOT NULL
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS lead_followups_lead_step_uidx
  ON public.lead_followups (lead_id, step_id)
  WHERE step_id IS NOT NULL;

-- When a new step is added, backfill it for every lead on that sequence
CREATE OR REPLACE FUNCTION public.sync_step_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.lead_followups
    (lead_id, sequence_id, step_id, step_order, day_offset, scheduled_at, status)
  SELECT l.id, NEW.sequence_id, NEW.id, NEW.step_order, NEW.day_offset,
         l.created_at + (NEW.day_offset || ' days')::interval,
         CASE WHEN l.followup_status = 'active' THEN 'pending' ELSE 'cancelled' END
    FROM public.leads l
   WHERE l.followup_sequence_id = NEW.sequence_id
  ON CONFLICT (lead_id, step_id) WHERE step_id IS NOT NULL DO NOTHING;
  RETURN NULL;
END;
$$;

-- When a step is edited, only touch rows not yet sent
CREATE OR REPLACE FUNCTION public.sync_step_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.lead_followups f
     SET step_order = NEW.step_order,
         day_offset = NEW.day_offset,
         scheduled_at = CASE
           WHEN NEW.day_offset IS DISTINCT FROM OLD.day_offset
             THEN l.created_at + (NEW.day_offset || ' days')::interval
           ELSE f.scheduled_at END,
         updated_at = now()
    FROM public.leads l
   WHERE f.lead_id = l.id
     AND f.step_id = NEW.id
     AND f.sent_at IS NULL
     AND f.status IN ('pending','failed');
  RETURN NULL;
END;
$$;

-- When a step is deleted, cancel its unsent rows
CREATE OR REPLACE FUNCTION public.sync_step_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.lead_followups
     SET status = 'cancelled', step_id = NULL, updated_at = now()
   WHERE step_id = OLD.id
     AND sent_at IS NULL;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_step_insert ON public.followup_steps;
CREATE TRIGGER trg_sync_step_insert
AFTER INSERT ON public.followup_steps
FOR EACH ROW EXECUTE FUNCTION public.sync_step_insert();

DROP TRIGGER IF EXISTS trg_sync_step_update ON public.followup_steps;
CREATE TRIGGER trg_sync_step_update
AFTER UPDATE ON public.followup_steps
FOR EACH ROW EXECUTE FUNCTION public.sync_step_update();

DROP TRIGGER IF EXISTS trg_sync_step_delete ON public.followup_steps;
CREATE TRIGGER trg_sync_step_delete
BEFORE DELETE ON public.followup_steps
FOR EACH ROW EXECUTE FUNCTION public.sync_step_delete();

-- One-off backfill for existing leads missing any current steps
INSERT INTO public.lead_followups
  (lead_id, sequence_id, step_id, step_order, day_offset, scheduled_at, status)
SELECT l.id, s.sequence_id, s.id, s.step_order, s.day_offset,
       l.created_at + (s.day_offset || ' days')::interval,
       CASE WHEN l.followup_status = 'active' THEN 'pending' ELSE 'cancelled' END
  FROM public.leads l
  JOIN public.followup_steps s ON s.sequence_id = l.followup_sequence_id
ON CONFLICT (lead_id, step_id) WHERE step_id IS NOT NULL DO NOTHING;