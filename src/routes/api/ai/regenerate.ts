import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "*",
};

// Endpoint chamado pelo popup "Gerar nova IA". Como a rotação real da chave
// do gateway é feita pela plataforma, aqui validamos o gateway com o
// LOVABLE_API_KEY atual e devolvemos status pra UI mostrar a animação de
// "atualizando" e em seguida tentar de novo a auto-configuração.
export const Route = createFileRoute("/api/ai/regenerate")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async () => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return Response.json({ ok: false, error: "LOVABLE_API_KEY ausente" }, { status: 500, headers: CORS });
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 15_000);
          const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            signal: ctrl.signal,
            headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk", "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [{ role: "user", content: "ping" }],
              max_tokens: 5,
            }),
          });
          clearTimeout(t);
          if (r.ok) return Response.json({ ok: true, status: r.status }, { headers: CORS });
          const txt = (await r.text()).slice(0, 240);
          const code = r.status === 429 ? "quota" : r.status === 402 ? "credit" : r.status === 401 || r.status === 403 ? "unauthorized" : "unknown";
          return Response.json({ ok: false, status: r.status, code, error: txt }, { status: 200, headers: CORS });
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message || String(e) }, { status: 200, headers: CORS });
        }
      },
    },
  },
});
