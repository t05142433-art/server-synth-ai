import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-max-age": "86400",
};
const HOP_BY_HOP_HEADERS = new Set(["host", "connection", "content-length", "transfer-encoding", "upgrade", "proxy-authenticate", "proxy-authorization", "te", "trailer"]);
const PRIVATE_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

const buckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(key: string, perMin: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) { buckets.set(key, { count: 1, resetAt: now + 60_000 }); return true; }
  if (b.count >= perMin) return false;
  b.count++; return true;
}

function tpl(input: string, vars: Record<string, string>): string {
  return input.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/gi, (_, k) => {
    const key = String(k).toUpperCase();
    // Dynamic per-request helpers (mimic shell $RANDOM, $OFFLINE_ID, uuids, timestamps)
    if (key === "RANDOM") return String(Math.floor(Math.random() * 32768));
    if (key === "RANDOM_BIG" || key === "RANDOM_LARGE")
      return String(Math.floor(Math.random() * 1e18));
    if (key === "OFFLINE_ID")
      return "745" + Math.floor(Math.random() * 1e18).toString();
    if (key === "TIMESTAMP" || key === "NOW") return String(Date.now());
    if (key === "TIMESTAMP_S") return String(Math.floor(Date.now() / 1000));
    if (key === "UUID") return crypto.randomUUID();
    if (key === "NONCE") return Math.random().toString(36).slice(2) + Date.now().toString(36);
    const m = key.match(/^RANDOM_(\d+)$/);
    if (m) {
      const n = Math.min(parseInt(m[1], 10) || 8, 64);
      let s = "";
      for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
      return s;
    }
    return vars[k] ?? vars[key] ?? "";
  });
}
function tplObj(obj: Record<string, string>, vars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k).trim();
    if (!key || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    out[key] = tpl(String(v ?? ""), vars);
  }
  return out;
}
function getDeep(obj: any, path: string): any {
  return path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}
function safeJson(s: string) { try { return JSON.parse(s); } catch { return null; } }
function safeForm(s: string) { try { return new URLSearchParams(s); } catch { return null; } }
function isSafeTarget(target: string) {
  try {
    const u = new URL(target);
    const host = u.hostname.toLowerCase();
    const isPrivateIp = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/.test(host);
    return (u.protocol === "https:" || u.protocol === "http:") && !PRIVATE_HOSTS.has(host) && !isPrivateIp && !host.endsWith(".local");
  } catch { return false; }
}

async function handle(slug: string, request: Request) {
  const start = Date.now();
  const { data: server, error } = await supabaseAdmin.from("servers").select("*").eq("slug", slug).maybeSingle();
  if (error || !server) return json({ error: "Server not found" }, 404);

  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

  // Banned IPs
  const banned: string[] = Array.isArray((server as any).banned_ips) ? (server as any).banned_ips : [];
  if (banned.includes(ip)) {
    await log(server, request, ip, "", "banned", 403, Date.now() - start);
    return json({ error: "Acesso bloqueado" }, 403);
  }

  // Maintenance mode → branded HTML page on GET, JSON on others
  if ((server as any).maintenance_mode) {
    const msg = (server as any).maintenance_message || "Estamos em manutenção. Volte em breve.";
    if (request.method === "GET") {
      return new Response(maintenanceHtml(server.name, msg), {
        status: 503,
        headers: { "content-type": "text/html; charset=utf-8", ...CORS_HEADERS },
      });
    }
    return json({ error: "maintenance", message: msg }, 503);
  }

  if (!server.enabled) return json({ error: "Server disabled" }, 503);

  if (!rateLimit(`${slug}:${ip}`, server.rate_limit_per_min)) return json({ error: "Rate limit exceeded" }, 429);

  if (server.require_api_key) {
    const provided = request.headers.get("x-api-key");
    if (!provided || provided !== server.api_key) return json({ error: "Invalid or missing API key" }, 401);
  }

  // Load endpoints
  const { data: endpoints } = await supabaseAdmin
    .from("endpoints").select("*").eq("server_id", server.id).order("sort_order", { ascending: true });
  const eps = endpoints ?? [];

  // GET on root with no endpoints/no match → status payload
  if (request.method === "GET" && eps.length === 0) {
    return json({ status: "online", message: "Aguardando comando POST", server: server.name });
  }

  // Read body
  let incomingBody = "";
  if (request.method !== "GET" && request.method !== "HEAD") incomingBody = await request.text();
  const bodyParsed = incomingBody ? safeJson(incomingBody) : null;
  const formParsed = !bodyParsed && incomingBody ? safeForm(incomingBody) : null;
  const url = new URL(request.url);
  const action =
    (bodyParsed && typeof bodyParsed === "object" ? bodyParsed.action : null) ||
    formParsed?.get("action") ||
    url.searchParams.get("action") ||
    request.headers.get("x-action");

  // Pick endpoint
  let ep: any = null;
  if (action) ep = eps.find((e) => e.action_key && e.action_key === action) || null;
  if (!ep) ep = eps.find((e) => e.method === request.method) || null;
  if (!ep && eps.length === 1) ep = eps[0];
  if (!ep) {
    if (request.method === "GET") return json({ status: "online", message: "Aguardando comando POST", endpoints: eps.map((e) => ({ action: e.action_key, method: e.method, name: e.name })) });
    return json({ error: "No matching endpoint", hint: "Send body with 'action' matching one of: " + eps.map((e) => e.action_key).filter(Boolean).join(", ") }, 404);
  }

  const vars: Record<string, string> = { ...((server.variables as Record<string, string>) || {}) };

  // Merge body / query fields into vars so {{KEY}} placeholders work per-request.
  // Server-defined variables take precedence (security: client can't override secrets).
  const mergeVar = (k: string, v: unknown) => {
    if (typeof v !== "string" && typeof v !== "number") return;
    const upper = String(k).toUpperCase();
    if (upper === "ACTION") return;
    if (vars[upper] === undefined && vars[k] === undefined) vars[upper] = String(v);
  };
  if (bodyParsed && typeof bodyParsed === "object") for (const [k, v] of Object.entries(bodyParsed)) mergeVar(k, v);
  if (formParsed) for (const [k, v] of formParsed.entries()) mergeVar(k, v);
  for (const [k, v] of url.searchParams.entries()) mergeVar(k, v);

  // Substitute :id from body or query
  let target = tpl(ep.target_url, vars);
  if (target.includes(":id")) {
    const idVal = (bodyParsed && (bodyParsed.id || bodyParsed.customer_id)) || formParsed?.get("id") || url.searchParams.get("id") || "";
    target = target.replace(/:id/g, encodeURIComponent(String(idVal)));
  }
  if (!isSafeTarget(target)) return json({ error: "Invalid or blocked target URL" }, 400);

  if (ep.forward_query) {
    const q = url.search;
    if (q) target += (target.includes("?") ? "&" : "?") + q.slice(1);
  }

  const fwdHeaders: Record<string, string> = tplObj((ep.headers as Record<string, string>) || {}, vars);

  // Compute body
  let bodyToSend: string | undefined;
  if (ep.method !== "GET" && ep.method !== "HEAD") {
    if (ep.forward_body && bodyParsed && typeof bodyParsed === "object") {
      const { action: _a, _rawBody, rawBody, body, ...rest } = bodyParsed;
      if (typeof _rawBody === "string" || typeof rawBody === "string") {
        bodyToSend = tpl(String(_rawBody ?? rawBody), vars);
      } else if (typeof body === "string") {
        bodyToSend = tpl(body, vars);
      } else if (Object.keys(rest).length) {
        const contentType = Object.entries(fwdHeaders).find(([k]) => k.toLowerCase() === "content-type")?.[1]?.toLowerCase() ?? "";
        bodyToSend = contentType.includes("application/x-www-form-urlencoded")
          ? new URLSearchParams(Object.entries(rest).map(([k, v]) => [k, typeof v === "string" ? tpl(v, vars) : JSON.stringify(v)])).toString()
          : JSON.stringify(rest);
      } else {
        bodyToSend = ep.body_template ? tpl(ep.body_template, vars) : undefined;
      }
    } else if (ep.forward_body && incomingBody) {
      bodyToSend = incomingBody;
    } else if (ep.body_template) {
      bodyToSend = tpl(ep.body_template, vars);
    }
    if (bodyToSend && !fwdHeaders["Content-Type"] && !fwdHeaders["content-type"]) {
      fwdHeaders["Content-Type"] = "application/json";
    }
  }

  let upstreamStatus = 0; let upstreamText = ""; let upstreamCT = "application/json";
  try {
    const r = await fetch(target, { method: ep.method, headers: fwdHeaders, body: bodyToSend, redirect: "follow" });
    upstreamStatus = r.status;
    upstreamCT = r.headers.get("content-type") || "application/json";
    upstreamText = await r.text();
  } catch (e: any) {
    const errResp = { error: "Upstream fetch failed", details: e?.message || String(e), target };
    await log(server, request, ip, incomingBody, JSON.stringify(errResp), 502, Date.now() - start);
    return json(errResp, 502);
  }

  // Auto-extract token / variable from response and persist into server.variables
  if (ep.extract_token_path && ep.extract_token_var && upstreamStatus < 400) {
    const respJson = safeJson(upstreamText);
    if (respJson) {
      const found = getDeep(respJson, ep.extract_token_path);
      if (typeof found === "string" && found.length > 0) {
        const stored = (ep.extract_token_prefix || "") + found;
        const newVars = { ...vars, [ep.extract_token_var]: stored };
        await supabaseAdmin.from("servers").update({ variables: newVars, updated_at: new Date().toISOString() }).eq("id", server.id);
      }
    }
  }

  // Per-endpoint extract_regex (preferred), falls back to server-level regex.
  // When matched, returns { ok, value, status } so HTML / next-step can read .value.
  const regexStr: string | null = (ep as any).extract_regex || server.extract_regex || null;
  let extractedValue: string | null = null;
  if (regexStr && upstreamStatus < 400) {
    try {
      const m = upstreamText.match(new RegExp(regexStr));
      extractedValue = m ? (m[1] ?? m[0]) : null;
    } catch {}
  }

  // Auto-chain: if this endpoint has chain_to_action, immediately call that endpoint
  // forwarding extracted value + remaining vars. Returns combined result.
  const chainTo: string | null = (ep as any).chain_to_action || null;
  if (chainTo && extractedValue != null) {
    const nextEp: any = eps.find((e) => e.action_key === chainTo);
    if (nextEp) {
      const chainVars: Record<string, string> = { ...vars, ID: extractedValue, VALUE: extractedValue, EXTRACTED: extractedValue };
      let nextTarget = tpl(nextEp.target_url, chainVars).replace(/:id/g, encodeURIComponent(extractedValue));
      const nextHeaders = tplObj((nextEp.headers as Record<string, string>) || {}, chainVars);
      let nextBody: string | undefined;
      if (nextEp.body_template) nextBody = tpl(nextEp.body_template, chainVars);
      if (nextBody && !nextHeaders["Content-Type"] && !nextHeaders["content-type"]) nextHeaders["Content-Type"] = "application/json";
      try {
        const r2 = await fetch(nextTarget, { method: nextEp.method, headers: nextHeaders, body: nextBody, redirect: "follow" });
        const t2 = await r2.text();
        const combined = JSON.stringify({ ok: r2.ok, extracted: extractedValue, chained_action: chainTo, chained_status: r2.status, chained_response: t2.slice(0, 4000) });
        await log(server, request, ip, incomingBody, combined, r2.status, Date.now() - start);
        return new Response(combined, { status: r2.status, headers: { "content-type": "application/json", ...CORS_HEADERS } });
      } catch (e: any) {
        const errOut = JSON.stringify({ ok: false, extracted: extractedValue, chain_error: e?.message || String(e) });
        await log(server, request, ip, incomingBody, errOut, 502, Date.now() - start);
        return new Response(errOut, { status: 502, headers: { "content-type": "application/json", ...CORS_HEADERS } });
      }
    }
  }

  if (extractedValue != null) {
    const out = JSON.stringify({ ok: true, value: extractedValue, status: upstreamStatus });
    await log(server, request, ip, incomingBody, out, upstreamStatus, Date.now() - start);
    return new Response(out, { status: 200, headers: { "content-type": "application/json", ...CORS_HEADERS } });
  }

  await log(server, request, ip, incomingBody, upstreamText, upstreamStatus, Date.now() - start);

  return new Response(upstreamText, {
    status: upstreamStatus,
    headers: { "content-type": upstreamCT, ...CORS_HEADERS },
  });
}

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...CORS_HEADERS } });
}
function maintenanceHtml(name: string, msg: string) {
  const safe = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe(name)} — Manutenção</title><style>
:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:radial-gradient(1200px 600px at 50% -10%,#3b82f655,transparent),linear-gradient(180deg,#0b1020,#05060d);color:#e7ecff}
.card{max-width:540px;padding:42px 36px;border-radius:24px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);box-shadow:0 30px 80px -20px #0007,0 0 0 1px #ffffff05 inset;text-align:center;backdrop-filter:blur(12px)}
.icon{width:64px;height:64px;margin:0 auto 18px;border-radius:18px;background:linear-gradient(135deg,#6366f1,#22d3ee);display:grid;place-items:center;font-size:30px;box-shadow:0 10px 30px -10px #6366f1aa}
h1{margin:0 0 6px;font-size:26px}p{margin:8px 0;color:#a4b1d6;line-height:1.5}small{color:#6b779b}</style></head><body><div class="card"><div class="icon">🛠️</div><h1>${safe(name)}</h1><p>${safe(msg)}</p><small>HTTP 503 • em manutenção</small></div></body></html>`;
}
async function log(server: any, request: Request, ip: string, reqBody: string, respBody: string, status: number, ms: number) {
  try {
    const url = new URL(request.url);
    await supabaseAdmin.from("request_logs").insert({
      server_id: server.id, user_id: server.user_id,
      method: request.method, path: url.pathname + url.search,
      status, duration_ms: ms, ip,
      request_body: reqBody.slice(0, 4000),
      response_body: respBody.slice(0, 4000),
    });
  } catch { /* ignore */ }
}

export const Route = createFileRoute("/api/public/s/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handle(params.slug, request),
      POST: async ({ request, params }) => handle(params.slug, request),
      PUT: async ({ request, params }) => handle(params.slug, request),
      PATCH: async ({ request, params }) => handle(params.slug, request),
      DELETE: async ({ request, params }) => handle(params.slug, request),
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
    },
  },
});
