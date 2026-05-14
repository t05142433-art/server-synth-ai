CREATE TABLE IF NOT EXISTS public.ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  mode text NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto', 'manual')),
  provider text NOT NULL DEFAULT 'lovable' CHECK (provider IN ('lovable', 'openai_compatible')),
  model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  base_url text,
  api_key text,
  temperature numeric NOT NULL DEFAULT 0.2,
  max_rounds integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_settings' AND policyname = 'ai_settings_owner_all'
  ) THEN
    CREATE POLICY ai_settings_owner_all
    ON public.ai_settings
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ai_settings_user_id_idx ON public.ai_settings(user_id);

DROP TRIGGER IF EXISTS update_ai_settings_updated_at ON public.ai_settings;
CREATE TRIGGER update_ai_settings_updated_at
BEFORE UPDATE ON public.ai_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();