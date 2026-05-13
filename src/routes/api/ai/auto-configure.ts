import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "*",
};

const PRIVATE = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)|^(localhost|::1|0\.0\.0\.0)$/i;
const safeUrl = (u: string) => {
  try { const url = new URL(u); return /^https?:$/.test(url.protocol) && !PRIVATE.test(url.hostname); } catch { return false; }
};

const SYS_PLAN = `Você é um engenheiro de APIs trabalhando como um terminal Termux com IA. Recebe:
- Um ou mais comandos cURL (até 4)
- Logs/exemplos do output esperado (opcional)
- Instruções extras do usuário (opcional)

Devolva APENAS JSON válido neste schema:
{
  "server": {
    "name": "<nome curto descrevendo o servidor>",
    "description": "<o que faz>",
    "variables": { "<chave>": "<valor default ou ''>", ... }
  },
  "endpoints": [
    {
      "name": "<nome>",
      "action_key": "<slug_minusculo_unico>",
      "description": "<o que faz>",
      "method": "GET|POST|PUT|PATCH|DELETE|HEAD",
      "url": "<URL absoluta>",
      "headers": { "<name>": "<value>", ... },
      "body": "<string body com placeholders {{NOME_MAIUSCULO}} para campos do usuário>" | null,
      "extract_regex": "<regex JS com 1 grupo>" | null,
      "expected_contains": "<substring esperada na resposta>" | null,
      "chain_to_action": "<action_key de outro endpoint, se este só extrai algo e o próximo deve ser chamado automaticamente com o valor>" | null,
      "user_inputs": [{ "key": "<NOME_MAIUSCULO>", "label": "<rótulo pt-BR>", "placeholder": "<exemplo>", "type": "text|textarea|url" }]
    }
  ],
  "notes": "<1-2 linhas em pt-BR explicando o que ajustou>"
}

REGRAS:
- Adicione User-Agent realista (Chrome desktop), Accept, Accept-Language (en-US,en;q=0.9,pt-BR;q=0.8), sec-ch-ua, sec-fetch-* coerentes para sites web.
- REMOVA: host, content-length, connection, transfer-encoding.
- Pipes (| grep, | jq, | awk) viram extract_regex.
- Cada cURL = 1 endpoint. action_key único.
- Se o usuário deu logs/output esperado, configure expected_contains com algo único do output.
- Quando o body precisa de dados que o usuário fornece (id, mensagem, username, etc.), use placeholders {{NOME}} no body, na URL e nos headers — o backend substitui em tempo real. Liste esses campos em "user_inputs".
- Se o usuário descreve um fluxo encadeado (ex: "extrair id do reel e usar pra enviar msg"), marque o endpoint que extrai com extract_regex e chain_to_action apontando para o action_key do endpoint de envio. O backend chama os dois automaticamente com 1 só request.
- Sem markdown, sem comentários, só JSON.`;

const SYS_FIX = `Você é o mesmo engenheiro. Um endpoint falhou. Recebe:
- Endpoint atual (JSON)
- Status HTTP, headers e primeiros bytes da resposta
- Output esperado (se houver)
- Tentativas anteriores

Devolva APENAS JSON com o endpoint CORRIGIDO no mesmo schema dos endpoints (com name, action_key, method, url, headers, body, extract_regex, expected_contains) + "fix_notes": "<o que mudou>".
Estratégias: trocar User-Agent, adicionar cookies/referrer, mudar Accept, ajustar regex, mudar método, adicionar query params, decodificar gzip via Accept-Encoding: identity.`;

async function callAi(messages: any[], jsonObject = true) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      ...(jsonObject ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

async function execEndpoint(ep: any) {
  const start = Date.now();
  try {
    const method = String(ep.method || "GET").toUpperCase();
    const r = await fetch(ep.url, {
      method,
      headers: ep.headers || {},
      body: ["GET", "HEAD"].includes(method) ? undefined : (ep.body ?? undefined),
      redirect: "follow",
    });
    const text = await r.text();
    const respHeaders: Record<string, string> = {};
    r.headers.forEach((v, k) => { respHeaders[k] = v; });
    let extracted: string | null = null;
    if (ep.extract_regex) {
      try { const m = text.match(new RegExp(ep.extract_regex)); extracted = m ? (m[1] ?? m[0]) : null; } catch {}
    }
    return {
      ok: r.ok, status: r.status, statusText: r.statusText, headers: respHeaders,
      body: text.slice(0, 8000), size: text.length, extracted, duration_ms: Date.now() - start,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e), duration_ms: Date.now() - start };
  }
}

function judgeSuccess(ep: any, exec: any, expected?: string | null) {
  if (!exec || exec.ok === false || (typeof exec.status === "number" && exec.status >= 400)) return false;
  const target = expected || ep.expected_contains;
  if (target && exec.body && !String(exec.body).includes(target)) return false;
  if (ep.extract_regex && exec.extracted == null) return false;
  return true;
}

export const Route = createFileRoute("/api/ai/auto-configure")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { curls = [], instructions = "", expected_output = "", generate_html = false, max_retries = 12 } = await request.json();
        if (!Array.isArray(curls) || curls.length === 0) return Response.json({ error: "Envie ao menos 1 cURL" }, { status: 400 });

        const enc = new TextEncoder();
        const stream = new ReadableStream({
          async start(ctrl) {
            const send = (event: string, data: any) =>
              ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            const log = (line: string, level: "info" | "ok" | "warn" | "err" | "ai" = "info") =>
              send("log", { line, level, t: Date.now() });

            try {
              log(`▶ Iniciando auto-configuração com ${curls.length} cURL(s)…`, "info");
              if (instructions) log(`📝 Instruções: ${instructions.slice(0, 200)}`, "info");
              if (expected_output) log(`🎯 Output esperado fornecido (${expected_output.length} chars)`, "info");

              log("🧠 IA analisando comandos e planejando servidor…", "ai");
              const planRaw = await callAi([
                { role: "system", content: SYS_PLAN },
                { role: "user", content: `cURLs:\n${curls.map((c: string, i: number) => `# ${i + 1}\n${c}`).join("\n\n")}\n\nInstruções: ${instructions || "(nenhuma)"}\n\nOutput esperado:\n${expected_output || "(nenhum)"}` },
              ]);
              let plan: any;
              try { plan = JSON.parse(planRaw); } catch { throw new Error("IA devolveu JSON inválido: " + planRaw.slice(0, 200)); }
              log(`✓ Plano: "${plan.server?.name}" com ${plan.endpoints?.length ?? 0} endpoint(s)`, "ok");
              if (plan.notes) log(`💡 ${plan.notes}`, "ai");
              send("plan", plan);

              const finalEndpoints: any[] = [];
              for (let i = 0; i < (plan.endpoints || []).length; i++) {
                let ep = plan.endpoints[i];
                log(`\n━━━ Endpoint ${i + 1}/${plan.endpoints.length}: ${ep.name} (${ep.method} ${ep.url})`, "info");

                if (!safeUrl(ep.url)) { log(`✗ URL bloqueada/inválida: ${ep.url}`, "err"); finalEndpoints.push({ ...ep, _failed: "url" }); continue; }

                const attempts: any[] = [];
                let success = false;

                for (let attempt = 1; attempt <= max_retries + 1; attempt++) {
                  log(`$ curl -X ${ep.method} "${ep.url}"`, "info");
                  const exec = await execEndpoint(ep);
                  if (exec.ok === false || exec.error) log(`✗ ERRO: ${exec.error || "rede"}`, "err");
                  else log(`← HTTP ${exec.status} ${exec.statusText} (${exec.duration_ms}ms, ${exec.size}b)`, (exec.status ?? 500) < 400 ? "ok" : "warn");
                  if (exec.extracted != null) log(`  extracted: ${String(exec.extracted).slice(0, 120)}`, "ok");

                  attempts.push({ attempt, endpoint: ep, exec });
                  send("attempt", { endpointIndex: i, attempt, endpoint: ep, exec });

                  if (judgeSuccess(ep, exec, expected_output)) {
                    log(`✓ Sucesso na tentativa ${attempt}!`, "ok");
                    success = true; break;
                  }

                  if (attempt > max_retries) { log(`⚠ Limite de ${max_retries} tentativas atingido — salvando mesmo assim para você ajustar manualmente`, "warn"); break; }

                  log(`🧠 IA analisando falha (tentativa ${attempt}/${max_retries}) e ajustando…`, "ai");
                  const fixRaw = await callAi([
                    { role: "system", content: SYS_FIX },
                    { role: "user", content: `Endpoint atual:\n${JSON.stringify(ep, null, 2)}\n\nResposta:\nstatus=${exec.status}\nheaders=${JSON.stringify(exec.headers || {}, null, 2).slice(0, 1000)}\nbody=${(exec.body || exec.error || "").slice(0, 2000)}\n\nOutput esperado: ${expected_output || ep.expected_contains || "(nenhum)"}\n\nTentativas anteriores: ${attempts.length}` },
                  ]);
                  try {
                    const fix = JSON.parse(fixRaw);
                    if (fix.fix_notes) log(`💡 ${fix.fix_notes}`, "ai");
                    ep = { ...ep, ...fix };
                  } catch { log(`⚠ IA devolveu JSON inválido, repetindo igual`, "warn"); }
                }

                finalEndpoints.push({ ...ep, _success: success, _attempts: attempts.length });
              }

              let html: string | null = null;
              if (generate_html) {
                log(`\n🎨 IA gerando página HTML para a API…`, "ai");
                const htmlSys = `Você gera UMA página HTML COMPLETA (Tailwind via CDN), moderna, bonita, com efeitos 3D/glassmorphism quando o usuário pedir, em pt-BR. É um PAINEL DE PRODUÇÃO conectado a uma API real.

REGRAS ABSOLUTAS — LEIA TUDO:

1. URL DO BACKEND
   - Toda chamada vai para a string LITERAL __SERVER_BASE__ (não substitua, não invente URL). O backend substitui depois pelo proxy real "/api/public/s/<slug>".
   - NUNCA chame URLs externas diretamente (Instagram, Facebook, qualquer API original) — isso quebra por CORS. SEMPRE __SERVER_BASE__.

2. COMO CHAMAR
   - method: "POST"
   - headers: { "Content-Type": "application/json" }   ← APENAS isso. Nunca inclua Authorization, cookies, sessionid, csrftoken, fb_dtsg, User-Agent ou qualquer header da API original. Esses ficam no servidor.
   - body: JSON.stringify({ "action": "<action_key do endpoint>", ...campos_do_usuario })
   - O servidor já tem os headers, cookies, body_template e variáveis. Você só passa o que o usuário digitou (id, mensagem, link, etc.) usando as MESMAS chaves do user_inputs / placeholders {{NOME}}.

3. FLUXOS ENCADEADOS (ex: extrair id do reel → enviar mensagem)
   - Se um endpoint tem chain_to_action setado, basta chamar SÓ ele com os inputs — o backend chama o próximo automaticamente. Resposta vem com {ok, extracted, chained_status, chained_response}.
   - Se NÃO tem chain_to_action mas o usuário descreveu o fluxo, faça você mesmo no JS: chame o endpoint extrator, leia "value" da resposta JSON, depois chame o segundo endpoint passando esse valor no campo certo (ex: id). Mostre as duas respostas.
   - Aceite link do Instagram (/reel/, /p/, /reels/) E também id direto. Se o input parecer link, mande o link inteiro pro backend extrator. Se parecer só números, pule a extração.

4. NADA DE SIMULAÇÃO
   - Proibido: Math.random, setTimeout fingindo loading, mock, "exemplo de resposta", lorem ipsum, dados estáticos. Toda resposta exibida vem do fetch real.
   - Mostre status HTTP e body cru (formatado se JSON) num <pre> visível depois de cada execução.

5. UI
   - Para cada endpoint no array, gere um cartão com: nome, descrição, badge método+URL original (apenas informativo, em <code>), formulário com os user_inputs e botão "Executar".
   - Use Tailwind via <script src="https://cdn.tailwindcss.com"></script>. Use gradientes, sombras, transform 3D quando o usuário pedir "bonito/3D". Dark theme por padrão.
   - Mostre também um bloco "cURL para devs": curl -X POST "<origem>__SERVER_BASE__" -H "Content-Type: application/json" -d '{"action":"<key>","campo":"valor"}'

6. SAÍDA
   - Devolva APENAS o HTML cru. Sem markdown, sem \`\`\`, sem texto fora. Começa com <!doctype html>.`;
                const htmlRaw = await callAi([
                  { role: "system", content: htmlSys },
                  { role: "user", content: JSON.stringify({
                    server: plan.server,
                    endpoints: finalEndpoints.map((e: any) => ({
                      name: e.name, description: e.description, action_key: e.action_key,
                      method: e.method, url: e.url,
                      body_preview: typeof e.body === "string" ? e.body.slice(0, 400) : null,
                      extract_regex: e.extract_regex || null,
                      chain_to_action: e.chain_to_action || null,
                      user_inputs: e.user_inputs || [],
                    })),
                    instructions,
                  }) },
                ], false);
                html = htmlRaw.replace(/^```html\n?/, "").replace(/\n?```$/, "").trim();
                log(`✓ HTML gerado (${html?.length ?? 0} chars)`, "ok");
              }

              send("done", { plan, endpoints: finalEndpoints, html });
              log(`\n✅ Concluído! ${finalEndpoints.filter((e) => e._success).length}/${finalEndpoints.length} endpoint(s) funcionando.`, "ok");
            } catch (e: any) {
              send("log", { line: `💥 ${e?.message || e}`, level: "err", t: Date.now() });
              send("error", { error: e?.message || String(e) });
            } finally {
              ctrl.close();
            }
          },
        });

        return new Response(stream, {
          headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", ...CORS },
        });
      },
    },
  },
});
