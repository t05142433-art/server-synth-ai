
ALTER TABLE public.endpoints
  ADD COLUMN IF NOT EXISTS extract_regex TEXT,
  ADD COLUMN IF NOT EXISTS chain_to_action TEXT;

ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_message TEXT;
