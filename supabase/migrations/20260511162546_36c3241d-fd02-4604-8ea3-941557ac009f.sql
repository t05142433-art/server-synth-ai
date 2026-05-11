CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_self_select ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY profiles_self_insert ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  logo_url text,
  method text NOT NULL DEFAULT 'GET',
  target_url text NOT NULL DEFAULT '',
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  body_template text,
  forward_query boolean NOT NULL DEFAULT true,
  forward_body boolean NOT NULL DEFAULT true,
  require_api_key boolean NOT NULL DEFAULT false,
  api_key text,
  rate_limit_per_min integer NOT NULL DEFAULT 60,
  enabled boolean NOT NULL DEFAULT true,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_prompt text,
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text,
  banned_ips text[] NOT NULL DEFAULT '{}'::text[],
  extract_regex text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS servers_user_id_idx ON public.servers(user_id);
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY servers_owner_all ON public.servers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action_key text,
  name text NOT NULL DEFAULT 'Endpoint',
  description text,
  method text NOT NULL DEFAULT 'GET',
  target_url text NOT NULL DEFAULT '',
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  body_template text,
  forward_query boolean NOT NULL DEFAULT true,
  forward_body boolean NOT NULL DEFAULT true,
  extract_token_path text,
  extract_token_var text,
  extract_token_prefix text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS endpoints_server_id_idx ON public.endpoints(server_id);
CREATE INDEX IF NOT EXISTS endpoints_user_id_idx ON public.endpoints(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS endpoints_action_unique ON public.endpoints(server_id, action_key) WHERE action_key IS NOT NULL;
ALTER TABLE public.endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY endpoints_owner_all ON public.endpoints FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  method text,
  path text,
  status integer,
  duration_ms integer,
  ip text,
  request_body text,
  response_body text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS request_logs_server_created_idx ON public.request_logs(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS request_logs_user_id_idx ON public.request_logs(user_id);
ALTER TABLE public.request_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY logs_owner_select ON public.request_logs FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  server_id uuid,
  slug text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT 'Untitled',
  html text NOT NULL DEFAULT '',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY pages_owner_all ON public.pages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY pages_public_select ON public.pages FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS pages_user_id_idx ON public.pages(user_id);
CREATE INDEX IF NOT EXISTS pages_slug_idx ON public.pages(slug);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_servers_updated_at ON public.servers;
CREATE TRIGGER update_servers_updated_at BEFORE UPDATE ON public.servers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_endpoints_updated_at ON public.endpoints;
CREATE TRIGGER update_endpoints_updated_at BEFORE UPDATE ON public.endpoints FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_pages_updated_at ON public.pages;
CREATE TRIGGER update_pages_updated_at BEFORE UPDATE ON public.pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();