CREATE OR REPLACE FUNCTION public.sync_step_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- cancel unsent followups tied to this step
  UPDATE public.lead_followups
     SET status = 'cancelled', step_id = NULL, updated_at = now()
   WHERE step_id = OLD.id
     AND sent_at IS NULL;

  -- keep history rows but release the FK reference
  UPDATE public.lead_followups
     SET step_id = NULL, updated_at = now()
   WHERE step_id = OLD.id;

  RETURN OLD;
END;
$function$;