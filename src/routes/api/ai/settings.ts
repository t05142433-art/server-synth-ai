import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "*",
};

async function getUserId(request: Request) {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const { data } = await supabaseAdmin.auth.getUser(token);
  return data.user?.id ?? null;
}

function maskKey(key?: string | null) {
  if (!key) return "";
  if (key.length <= 10) return "••••••";
  return `${key.slice(0, 4)}••••••${key.slice(-4)}`;
}

export const Route = createFileRoute("/api/ai/settings")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const userId = await getUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
        const { data } = await (supabaseAdmin as any)
          .from("ai_settings")
          .select("mode,provider,model,base_url,api_key,temperature,max_rounds")
          .eq("user_id", userId)
          .maybeSingle();
        const row = data ?? { mode: "auto", provider: "lovable", model: "google/gemini-3-flash-preview", base_url: "", temperature: 0.2, max_rounds: 2 };
        return Response.json({ ...row, api_key: undefined, api_key_masked: maskKey(row.api_key), has_api_key: Boolean(row.api_key) }, { headers: CORS });
      },
      POST: async ({ request }) => {
        const userId = await getUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
        const body = await request.json();
        const mode = body.mode === "manual" ? "manual" : "auto";
        const provider = mode === "manual" ? "openai_compatible" : "lovable";
        const model = String(body.model || (provider === "lovable" ? "google/gemini-3-flash-preview" : "gpt-4o-mini")).slice(0, 120);
        const base_url = provider === "openai_compatible" ? String(body.base_url || "").trim().slice(0, 300) : null;
        const api_key = typeof body.api_key === "string" && body.api_key.trim() ? body.api_key.trim() : undefined;
        const temperature = Math.max(0, Math.min(Number(body.temperature ?? 0.2), 2));
        const max_rounds = Math.max(1, Math.min(Number(body.max_rounds ?? 2), 4));
        if (provider === "openai_compatible") {
          try {
            const u = new URL(base_url || "");
            if (u.protocol !== "https:") throw new Error("Base URL precisa usar https://");
          } catch (e: any) {
            return Response.json({ error: e?.message || "Base URL inválida" }, { status: 400, headers: CORS });
          }
        }
        const next: Record<string, unknown> = { user_id: userId, mode, provider, model, base_url, temperature, max_rounds, updated_at: new Date().toISOString() };
        if (api_key !== undefined) next.api_key = api_key;
        if (body.clear_api_key === true) next.api_key = null;
        const { error } = await (supabaseAdmin as any).from("ai_settings").upsert(next, { onConflict: "user_id" });
        if (error) return Response.json({ error: error.message }, { status: 500, headers: CORS });
        return Response.json({ ok: true }, { headers: CORS });
      },
    },
  },
});