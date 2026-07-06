
-- Dedupe existing leads by phone (keep earliest)
WITH ranked AS (
  SELECT id, phone,
         ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at ASC, id ASC) AS rn
  FROM public.leads
),
to_delete AS (SELECT id FROM ranked WHERE rn > 1)
DELETE FROM public.leads WHERE id IN (SELECT id FROM to_delete);

-- Enforce uniqueness
ALTER TABLE public.leads
  ADD CONSTRAINT leads_phone_unique UNIQUE (phone);
