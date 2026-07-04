
-- Ensure search_path is fixed for helper functions
ALTER FUNCTION public.normalize_my_phone(TEXT) SET search_path = public;
ALTER FUNCTION public.leads_normalize_phone() SET search_path = public;

-- Revoke public execute on security-definer functions; grant to specific roles
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_staff_or_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff_or_admin(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.bootstrap_first_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_lead_followups() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_pending_on_status_change() FROM PUBLIC, anon, authenticated;
