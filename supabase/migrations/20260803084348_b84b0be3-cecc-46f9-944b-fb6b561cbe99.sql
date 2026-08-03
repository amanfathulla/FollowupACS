ALTER TABLE public.whatsapp_settings ADD COLUMN IF NOT EXISTS send_timezone TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur';

CREATE TABLE IF NOT EXISTS public.whatsapp_send_windows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  day_of_week SMALLINT NOT NULL UNIQUE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '21:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.whatsapp_send_windows TO authenticated;
GRANT ALL ON public.whatsapp_send_windows TO service_role;

ALTER TABLE public.whatsapp_send_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff/admin read send windows"
ON public.whatsapp_send_windows FOR SELECT TO authenticated
USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "admin insert send windows"
ON public.whatsapp_send_windows FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin update send windows"
ON public.whatsapp_send_windows FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_send_windows()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_send_windows ON public.whatsapp_send_windows;
CREATE TRIGGER trg_touch_send_windows
BEFORE UPDATE ON public.whatsapp_send_windows
FOR EACH ROW EXECUTE FUNCTION public.touch_send_windows();

INSERT INTO public.whatsapp_send_windows (day_of_week, is_enabled, start_time, end_time) VALUES
  (0, false, '09:00', '21:00'),
  (1, true,  '09:00', '21:00'),
  (2, true,  '09:00', '21:00'),
  (3, true,  '09:00', '21:00'),
  (4, true,  '09:00', '21:00'),
  (5, true,  '09:00', '21:00'),
  (6, true,  '09:00', '21:00')
ON CONFLICT (day_of_week) DO NOTHING;