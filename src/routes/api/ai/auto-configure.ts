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

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

class AiError extends Error {
  status: number;
  code: "quota" | "credit" | "unauthorized" | "network" | "invalid" | "unknown";
  detail: string;
  constructor(status: number, code: AiError["code"], detail: string) {
    super(`[${code}] HTTP ${status} ${detail}`);
    this.status = status; this.code = code; this.detail = detail;
  }
}

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
      "user_inputs": [{ "key": "<NOME_MAIUSCULO>", "label": "<rótulo pt-BR>", "placeholder": "<exemplo>", "type": "text|textarea|url", "example": "<VALOR REAL DE TESTE — obrigatório, usado pra testar o endpoint agora>" }]
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
- TODO user_input PRECISA ter "example" com um VALOR REAL FUNCIONAL (não placeholder genérico) — vamos usar pra testar o endpoint agora. Se o usuário mandou um link/id/etc no cURL ou nas instruções, REUTILIZE esses valores. Se não mandou, use um valor público real conhecido (ex: pro Instagram, https://www.instagram.com/p/DYKEoJYAR7j/).
- Placeholders {{NOME}} podem aparecer em url, headers E body — todos serão substituídos no teste pelos "example" e em produção pelos inputs reais do usuário.
- Se o usuário descreve um fluxo encadeado (ex: "extrair id do reel e usar pra enviar msg"), marque o endpoint que extrai com extract_regex e chain_to_action apontando para o action_key do endpoint de envio. O backend chama os dois automaticamente com 1 só request.
- Sem markdown, sem comentários, só JSON.`;

const SYS_FIX = `Você é o mesmo engenheiro. Um endpoint falhou. Recebe:
- Endpoint atual (JSON)
- Status HTTP, headers e primeiros bytes da resposta
- Output esperado (se houver)
- Tentativas anteriores

Devolva APENAS JSON com o endpoint CORRIGIDO no mesmo schema dos endpoints (com name, action_key, method, url, headers, body, extract_regex, expected_contains) + "fix_notes": "<o que mudou>".
Estratégias: trocar User-Agent, adicionar cookies/referrer, mudar Accept, ajustar regex, mudar método, adicionar query params, decodificar gzip via Accept-Encoding: identity.`;

const MODEL_FALLBACKS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-pro",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "openai/gpt-5",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callAi(messages: any[], jsonObject = true) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new AiError(500, "unauthorized", "LOVABLE_API_KEY ausente no servidor");
  let lastStatus = 0;
  let lastDetail = "";
  let lastCode: AiError["code"] = "unknown";
  const models = ["google/gemini-3-flash-preview", ...MODEL_FALLBACKS.filter((m) => m !== "google/gemini-3-flash-preview")];
  for (let round = 0; round < 2; round++) {
    for (const model of models) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25_000);
        const res = await fetch(GATEWAY_URL, {
          method: "POST",
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk", "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.2,
            ...(jsonObject ? { response_format: { type: "json_object" } } : {}),
          }),
        });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content) return content;
          lastStatus = 200; lastDetail = "resposta vazia"; lastCode = "invalid";
          continue;
        }
        const txt = (await res.text()).slice(0, 300);
        lastStatus = res.status; lastDetail = txt;
        if (res.status === 429) lastCode = "quota";
        else if (res.status === 402) lastCode = "credit";
        else if (res.status === 401 || res.status === 403) lastCode = "unauthorized";
        else lastCode = "unknown";
        if (res.status === 429 || res.status === 402 || res.status >= 500) {
          await sleep(500 + round * 800);
          continue;
        }
        continue;
      } catch (e: any) {
        lastStatus = 0; lastDetail = e?.message || String(e); lastCode = "network";
        await sleep(350);
        continue;
      }
    }
  }
  throw new AiError(lastStatus, lastCode, lastDetail);
}

function tokenizeCurl(curl: string) {
  const out: string[] = [];
  const re = /'([^']*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(curl.replace(/\\\n/g, " ")))) out.push(m[1] ?? (m[2] ? m[2].replace(/\\"/g, '"') : m[3]));
  return out;
}

function extractGrepRegex(curl: string) {
  const m = curl.match(/grep\s+-oP\s+(['"])([\s\S]*?)\1/);
  if (!m?.[2]) return null;
  return m[2].replace(/\\K(.+)$/, "($1)").replace(/\[0-9\]\+/g, "[0-9]+");
}

function parseCurlFallback(curl: string, index: number) {
  const clean = curl.split("|")[0].trim();
  const tokens = tokenizeCurl(clean).filter((t) => t !== "curl");
  let method = "GET";
  let url = "";
  let body: string | null = null;
  const headers: Record<string, string> = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (["-X", "--request"].includes(t)) method = String(tokens[++i] || method).toUpperCase();
    else if (["-H", "--header"].includes(t)) {
      const raw = String(tokens[++i] || "");
      const p = raw.indexOf(":");
      if (p > 0) headers[raw.slice(0, p).trim()] = raw.slice(p + 1).trim();
    } else if (["-d", "--data", "--data-raw", "--data-binary", "--data-urlencode"].includes(t)) {
      body = String(tokens[++i] || "");
      if (method === "GET") method = "POST";
    } else if (!t.startsWith("-") && /^https?:\/\//i.test(t)) url = t;
  }
  const lower = Object.fromEntries(Object.keys(headers).map((k) => [k.toLowerCase(), k]));
  const add = (k: string, v: string) => { if (!lower[k.toLowerCase()]) headers[k] = v; };
  add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36");
  add("Accept", "*/*");
  add("Accept-Language", "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7");
  const path = (() => { try { return new URL(url).pathname.split("/").filter(Boolean).slice(-1)[0] || `endpoint-${index + 1}`; } catch { return `endpoint-${index + 1}`; } })();
  return {
    name: `Endpoint ${index + 1}`,
    action_key: path.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `acao_${index + 1}`,
    description: "Criado automaticamente pelo parser local quando a IA estava indisponível.",
    method,
    url,
    headers,
    body,
    extract_regex: extractGrepRegex(curl),
    expected_contains: null,
    chain_to_action: null,
    user_inputs: [],
  };
}

function buildFallbackPlan(curls: string[], instructions: string) {
  const endpoints = curls.map(parseCurlFallback).filter((e) => e.url);
  return {
    server: {
      name: "API configurada sem IA",
      description: "Plano criado por parser local para não travar quando o provedor de IA estiver sem quota, crédito ou indisponível.",
      variables: {},
    },
    endpoints,
    notes: instructions ? "A IA falhou; usei configuração local com os cURLs enviados." : "A IA falhou; usei configuração local automática.",
  };
}

function escapeHtml(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function buildFallbackHtml(plan: any, endpoints: any[]) {
  const cards = endpoints.map((e: any) => `
    <article class="card">
      <div class="pill">${escapeHtml(e.method)} • ${escapeHtml(e.action_key || "run")}</div>
      <h3>${escapeHtml(e.name)}</h3><p>${escapeHtml(e.description || e.url)}</p>
      <textarea class="payload" spellcheck="false">${escapeHtml(JSON.stringify({ action: e.action_key || undefined }, null, 2))}</textarea>
      <button onclick="run(this)">Executar real</button>
      <pre></pre>
    </article>`).join("");
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(plan.server?.name || "API")}</title><script src="https://cdn.tailwindcss.com"></script><style>
body{margin:0;background:#050816;color:#f8fbff;font-family:Inter,ui-sans-serif,system-ui;overflow-x:hidden}.mesh{position:fixed;inset:-20%;background:radial-gradient(circle at 20% 20%,#22d3ee55,transparent 28%),radial-gradient(circle at 80% 10%,#a855f755,transparent 30%),radial-gradient(circle at 50% 90%,#10b98144,transparent 32%);filter:blur(50px);animation:float 12s ease-in-out infinite alternate;z-index:-1}@keyframes float{to{transform:translate3d(2%,-3%,0) scale(1.08)}}.wrap{max-width:1180px;margin:auto;padding:70px 22px}.hero{min-height:44vh;display:grid;align-content:center}.badge,.pill{display:inline-flex;width:max-content;border:1px solid #ffffff22;background:#ffffff10;border-radius:999px;padding:8px 12px;color:#a7f3d0;font-size:12px}.title{font-size:clamp(42px,8vw,96px);line-height:.92;font-weight:900;letter-spacing:0;background:linear-gradient(90deg,#fff,#67e8f9,#86efac,#c4b5fd);-webkit-background-clip:text;color:transparent;margin:18px 0}.sub{max-width:720px;color:#b8c4de;font-size:18px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}.card{transform-style:preserve-3d;border:1px solid #ffffff18;background:linear-gradient(180deg,#ffffff14,#ffffff08);border-radius:22px;padding:22px;box-shadow:0 30px 90px #0008;backdrop-filter:blur(18px)}.card:hover{transform:perspective(1200px) rotateX(2deg) translateY(-4px)}h3{font-size:22px;margin:14px 0 8px}.payload{width:100%;height:110px;margin:14px 0;border:1px solid #ffffff1f;border-radius:14px;background:#020617;color:#d1fae5;padding:12px;font:12px ui-monospace,monospace}button{border:0;border-radius:14px;background:linear-gradient(135deg,#22d3ee,#10b981);color:#041014;font-weight:800;padding:12px 16px;box-shadow:0 15px 40px #22d3ee44;cursor:pointer}pre{white-space:pre-wrap;overflow:auto;max-height:260px;margin-top:14px;background:#020617;border:1px solid #ffffff14;border-radius:14px;padding:12px;color:#d8f3ff;font-size:12px}</style></head><body><div class="mesh"></div><main class="wrap"><section class="hero"><span class="badge">API real conectada ao servidor</span><h1 class="title">${escapeHtml(plan.server?.name || "Painel API")}</h1><p class="sub">${escapeHtml(plan.server?.description || "Execute endpoints reais pelo backend configurado, sem chamadas externas diretas no navegador.")}</p></section><section class="grid">${cards}</section></main><script>
const API="__SERVER_BASE__";async function run(btn){const card=btn.closest('.card');const pre=card.querySelector('pre');let payload={};try{payload=JSON.parse(card.querySelector('textarea').value||'{}')}catch(e){pre.textContent='JSON inválido: '+e.message;return}pre.textContent='Enviando request real...';try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const text=await r.text();pre.textContent='HTTP '+r.status+'\n\n'+text}catch(e){pre.textContent='Erro de rede: '+e.message}}</script></body></html>`;
}

async function execEndpoint(ep: any) {
  const start = Date.now();
  try {
    const method = String(ep.method || "GET").toUpperCase();
    const subs: Record<string, string> = {};
    for (const ui of (ep.user_inputs || [])) {
      if (ui?.key && ui?.example != null) subs[String(ui.key)] = String(ui.example);
    }
    const sub = (s: any) => typeof s === "string" ? s.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, k) => subs[k] ?? `{{${k}}}`) : s;
    const url = sub(ep.url);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(ep.headers || {})) headers[k] = sub(v);
    const body = ep.body == null ? undefined : sub(ep.body);
    const r = await fetch(url, {
      method,
      headers,
      body: ["GET", "HEAD"].includes(method) ? undefined : body,
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
      ok: r.ok, status: r.status, statusText: r.statusText, headers: respHeaders, resolved_url: url,
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
            const reportAiError = (err: any, phase: string) => {
              const ae: AiError = err instanceof AiError ? err : new AiError(0, "unknown", String(err?.message || err));
              log(`✗ IA falhou em ${phase}: HTTP ${ae.status || "?"} [${ae.code}] ${ae.detail.slice(0, 240)}`, "err");
              send("ai_error", { phase, code: ae.code, status: ae.status, detail: ae.detail.slice(0, 600) });
            };

            try {
              log(`▶ Iniciando auto-configuração com ${curls.length} cURL(s)…`, "info");
              if (instructions) log(`📝 Instruções: ${instructions.slice(0, 200)}`, "info");
              if (expected_output) log(`🎯 Output esperado fornecido (${expected_output.length} chars)`, "info");

              let plan: any;
              log(`🧠 IA analisando comandos e planejando servidor…`, "ai");
              try {
                const planRaw = await callAi([
                  { role: "system", content: SYS_PLAN },
                  { role: "user", content: `cURLs:\n${curls.map((c: string, i: number) => `# ${i + 1}\n${c}`).join("\n\n")}\n\nInstruções: ${instructions || "(nenhuma)"}\n\nOutput esperado:\n${expected_output || "(nenhum)"}` },
                ], true);
                try { plan = JSON.parse(planRaw); } catch { throw new Error("IA devolveu JSON inválido: " + planRaw.slice(0, 200)); }
              } catch (err: any) {
                reportAiError(err, "planejamento");
                log(`⚠ Gerando configuração local para não travar…`, "warn");
                plan = buildFallbackPlan(curls, instructions);
              }
              if (!Array.isArray(plan.endpoints) || plan.endpoints.length === 0) plan = buildFallbackPlan(curls, instructions);
              log(`✓ Plano: "${plan.server?.name}" com ${plan.endpoints?.length ?? 0} endpoint(s)`, "ok");
              if (plan.notes) log(`💡 ${plan.notes}`, "ai");
              send("plan", plan);

              const finalEndpoints: any[] = [];
              for (let i = 0; i < (plan.endpoints || []).length; i++) {
                let ep = plan.endpoints[i];
                log(`\n━━━ Endpoint ${i + 1}/${plan.endpoints.length}: ${ep.name} (${ep.method} ${ep.url})`, "info");

                // resolve placeholders for safety check using example values
                const _subs: Record<string, string> = {};
                for (const ui of (ep.user_inputs || [])) if (ui?.key && ui?.example != null) _subs[String(ui.key)] = String(ui.example);
                const _resolvedUrl = String(ep.url || "").replace(/\{\{([A-Z0-9_]+)\}\}/g, (_: string, k: string) => _subs[k] ?? "");
                if (!safeUrl(_resolvedUrl)) {
                  log(`✗ URL bloqueada/inválida: ${ep.url}${_resolvedUrl !== ep.url ? ` → ${_resolvedUrl}` : ""}`, "err");
                  finalEndpoints.push({ ...ep, _failed: "url" });
                  continue;
                }

                const attempts: any[] = [];
                let success = false;

                for (let attempt = 1; attempt <= max_retries + 1; attempt++) {
                  log(`$ curl -X ${ep.method} "${ep.url}"`, "info");
                  const exec = await execEndpoint(ep);
                  if ((exec as any).resolved_url && (exec as any).resolved_url !== ep.url) log(`  → ${(exec as any).resolved_url}`, "info");
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
                  try {
                    const fixRaw = await callAi([
                      { role: "system", content: SYS_FIX },
                      { role: "user", content: `Endpoint atual:\n${JSON.stringify(ep, null, 2)}\n\nResposta:\nstatus=${exec.status}\nheaders=${JSON.stringify(exec.headers || {}, null, 2).slice(0, 1000)}\nbody=${(exec.body || exec.error || "").slice(0, 2000)}\n\nOutput esperado: ${expected_output || ep.expected_contains || "(nenhum)"}\n\nTentativas anteriores: ${attempts.length}` },
                    ], true);
                    try {
                      const fix = JSON.parse(fixRaw);
                      if (fix.fix_notes) log(`💡 ${fix.fix_notes}`, "ai");
                      ep = { ...ep, ...fix };
                    } catch { log(`⚠ IA devolveu JSON inválido, repetindo igual`, "warn"); }
                  } catch (err: any) {
                    reportAiError(err, `correção endpoint ${i + 1}`);
                    break;
                  }
                }

                finalEndpoints.push({ ...ep, _success: success, _attempts: attempts.length });
              }

              let html: string | null = null;
              if (generate_html) {
                log(`\n🎨 IA gerando página HTML para a API…`, "ai");
                const htmlSys = `Você gera UMA landing-page/painel SaaS HTML COMPLETO, NÍVEL AWWWARDS, em pt-BR. Tailwind via CDN. Tema dark. Tem que parecer um produto premium real (estilo Linear, Vercel, Framer, Stripe), NÃO um formulário cru.

ESTÉTICA OBRIGATÓRIA (3D / SaaS premium):
 - Hero gigante: headline em gradient text com 3-4 cores, subtítulo, badge "API ativa" pulsando, 2-3 stats fake-ok (latência, requests, uptime).
 - Background animado: 3+ blobs (radial-gradient + filter:blur(80px)) flutuando com @keyframes float, ou aurora/mesh gradient.
 - Glassmorphism real: backdrop-filter: blur(20px), borda 1px rgba(255,255,255,.10), shadow profunda multi-layer.
 - Cards com tilt 3D no mousemove (perspective(1400px) rotateX/rotateY) + glow no hover.
 - Botões: gradient + box-shadow glow colorida + hover translateY(-2px) scale(1.02).
 - Tipografia bold tracking-tight nos títulos. Generous spacing (py-20+). Seções: Hero → Como funciona (3 steps com emoji) → Endpoints → Footer.
 - Terminal log preto com cores (ok=verde, err=vermelho, info=azul, warn=amarelo) mostrando cada request real ao vivo.

REGRAS ABSOLUTAS DE CONEXÃO — LEIA TUDO:

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
   - Se houver fluxo encadeado óbvio (extrair id → enviar comentário/msg N vezes), gere UM cartão principal unificado: input do link, input da mensagem, qty, delay (ms), botão "🚀 Disparar". Loop em JS chamando o endpoint final N vezes com contadores ao vivo (enviados/sucesso/falha). Endpoints individuais ficam numa seção "Avançado" recolhível.
   - Senão: 1 cartão por endpoint com nome, descrição, badge método+URL original (informativo, <code>), formulário com user_inputs, botão "Executar".
   - <script src="https://cdn.tailwindcss.com"></script> no <head>.
   - Mostre também um bloco "cURL para devs": curl -X POST "<origem>__SERVER_BASE__" -H "Content-Type: application/json" -d '{"action":"<key>","campo":"valor"}'

6. SAÍDA
   - Devolva APENAS o HTML cru. Sem markdown, sem \`\`\`, sem texto fora. Começa com <!doctype html>.`;
                try {
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
                } catch (err: any) {
                  reportAiError(err, "geração de HTML");
                  html = buildFallbackHtml(plan, finalEndpoints);
                  log(`⚠ Gerei uma página 3D local funcional (${html.length} chars).`, "warn");
                }
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
