import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/p/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { data, error } = await supabaseAdmin.from("pages").select("html,title,maintenance_mode,maintenance_message").eq("slug", params.slug).maybeSingle();
        if (error || !data) return new Response("Página não encontrada", { status: 404 });
        if ((data as any).maintenance_mode) {
          const safe = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
          const msg = (data as any).maintenance_message || "Estamos em manutenção. Volte em breve.";
          const html = `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe(data.title)} — Manutenção</title><style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;background:radial-gradient(1200px 600px at 50% -10%,#3b82f655,transparent),linear-gradient(180deg,#0b1020,#05060d);color:#e7ecff}.card{max-width:540px;padding:42px 36px;border-radius:24px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);box-shadow:0 30px 80px -20px #0007;text-align:center;backdrop-filter:blur(12px)}.icon{width:64px;height:64px;margin:0 auto 18px;border-radius:18px;background:linear-gradient(135deg,#6366f1,#22d3ee);display:grid;place-items:center;font-size:30px}h1{margin:0 0 6px;font-size:26px}p{margin:8px 0;color:#a4b1d6;line-height:1.5}small{color:#6b779b}</style></head><body><div class="card"><div class="icon">🛠️</div><h1>${safe(data.title)}</h1><p>${safe(msg)}</p><small>HTTP 503 • em manutenção</small></div></body></html>`;
          return new Response(html, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
        }
        return new Response(data.html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
        });
      },
    },
  },
});
