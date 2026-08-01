ALTER TABLE public.leads ADD COLUMN car_model text;

COMMENT ON COLUMN public.leads.car_model IS 'Model kereta lead (opsyenal)';