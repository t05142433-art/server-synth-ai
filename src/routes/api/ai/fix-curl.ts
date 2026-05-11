import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "*",
};

const SYS = `Você é um terminal estilo Termux com superpoderes. Recebe um comando cURL (qualquer formato) e DEVE devolver APENAS um JSON válido no formato:
{
  "method": "GET"|"POST"|"PUT"|"PATCH"|"DELETE"|"HEAD",
  "url": "<URL absoluta final>",
  "headers": { "<name>": "<value>", ... },
  "body": "<string body crua>" | null,
  "post_process": "<descrição curta do que o comando faz depois — ex: 'extrai media id via grep'>" | null,
  "extract_regex": "<regex JS para extrair valor único da resposta — ex: 'instagram://media\\\\?id=([0-9]+)'>" | null,
  "notes": "<1 linha em pt-BR explicando o que ajustou>"
}

REGRAS:
1. CORRIJA headers para evitar bloqueios do servidor alvo:
   - Se não tiver User-Agent, adicione um realista de navegador moderno (Chrome desktop) — NUNCA "curl/x.x".
   - Adicione Accept, Accept-Language (en-US,en;q=0.9,pt-BR;q=0.8), Accept-Encoding (gzip, deflate, br) se faltarem.
   - Adicione sec-ch-ua, sec-fetch-* coerentes para sites de browser (Instagram, TikTok, Facebook, etc.).
   - Para Instagram/Facebook web: adicione "Sec-Fetch-Site: none", "Sec-Fetch-Mode: navigate", "Upgrade-Insecure-Requests: 1".
   - Mantenha cookies, tokens, csrf intactos.
   - REMOVA headers proibidos: host, content-length, connection, transfer-encoding.
2. Se o usuário usou pipes (| grep, | jq, | awk) para extrair algo, traduza para "extract_regex" (regex JS) que pega o mesmo valor da resposta. Ex: \`grep -oP 'instagram://media\\?id=\\K[0-9]+'\` -> "instagram://media\\\\?id=([0-9]+)".
3. Se o curl tem -d/--data sem -X, infira POST.
4. Resolva URLs relativas se houver (não há — devem ser absolutas).
5. Se faltar URL, retorne {"error":"..."} em vez do JSON acima.
6. NUNCA responda nada além do JSON. Sem comentários, sem markdown, sem prefixos.`;

async function callAi(curl: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYS },
        { role: "user", content: curl },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return JSON.parse(data?.choices?.[0]?.message?.content || "{}");
}

const PRIVATE = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)|^(localhost|::1|0\.0\.0\.0)$/i;
function safe(u: string) {
  try {
    const url = new URL(u);
    return /^https?:$/.test(url.protocol) && !PRIVATE.test(url.hostname);
  } catch { return false; }
}

export const Route = createFileRoute("/api/ai/fix-curl")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const { curl, execute = true } = await request.json();
          if (!curl || typeof curl !== "string") return Response.json({ error: "Campo 'curl' obrigatório" }, { status: 400 });
          const fix = await callAi(curl);
          if (fix?.error) return Response.json({ error: fix.error }, { status: 422 });
          if (!fix?.url || !safe(fix.url)) return Response.json({ error: "URL inválida ou bloqueada", fix }, { status: 400 });

          let executed: any = null;
          if (execute) {
            const start = Date.now();
            try {
              const method = String(fix.method || "GET").toUpperCase();
              const r = await fetch(fix.url, {
                method,
                headers: fix.headers || {},
                body: ["GET", "HEAD"].includes(method) ? undefined : (fix.body ?? undefined),
                redirect: "follow",
              });
              const text = await r.text();
              const respHeaders: Record<string, string> = {};
              r.headers.forEach((v, k) => { respHeaders[k] = v; });

              let extracted: string | null = null;
              if (fix.extract_regex) {
                try {
                  const m = text.match(new RegExp(fix.extract_regex));
                  extracted = m ? (m[1] ?? m[0]) : null;
                } catch {}
              }

              executed = {
                ok: r.ok,
                status: r.status,
                statusText: r.statusText,
                headers: respHeaders,
                body: text.slice(0, 200_000),
                truncated: text.length > 200_000,
                size: text.length,
                extracted,
                duration_ms: Date.now() - start,
              };
            } catch (e: any) {
              executed = { ok: false, error: e?.message || String(e), duration_ms: Date.now() - start };
            }
          }

          return new Response(JSON.stringify({ ok: true, fix, executed }), {
            status: 200, headers: { "content-type": "application/json", ...CORS },
          });
        } catch (e: any) {
          return Response.json({ error: e?.message || "Falha" }, { status: 500 });
        }
      },
    },
  },
});
