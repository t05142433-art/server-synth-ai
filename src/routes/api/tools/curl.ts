import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "*",
};

const HOP = new Set(["host", "connection", "content-length", "transfer-encoding", "upgrade", "proxy-authenticate", "proxy-authorization", "te", "trailer"]);
const PRIVATE_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function isSafeTarget(target: string) {
  try {
    const u = new URL(target);
    const host = u.hostname.toLowerCase();
    const priv = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/.test(host);
    return (u.protocol === "https:" || u.protocol === "http:") && !PRIVATE_HOSTS.has(host) && !priv && !host.endsWith(".local");
  } catch { return false; }
}

// Lightweight curl-command parser. Supports: -X, --request, -H/--header, -d/--data/--data-raw/--data-binary/--data-urlencode,
// --url, single/double quotes, line continuations (\\\n), and trailing positional URL.
function tokenize(src: string): string[] {
  const s = src.replace(/\\\r?\n/g, " ").trim();
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    if (c === "'" || c === '"') {
      const q = c;
      let j = i + 1;
      let buf = "";
      while (j < s.length && s[j] !== q) {
        if (s[j] === "\\" && q === '"' && j + 1 < s.length) { buf += s[j + 1]; j += 2; continue; }
        buf += s[j]; j++;
      }
      out.push(buf);
      i = j + 1;
    } else {
      let j = i; let buf = "";
      while (j < s.length && !/[\s'"]/.test(s[j])) {
        if (s[j] === "\\" && j + 1 < s.length) { buf += s[j + 1]; j += 2; continue; }
        buf += s[j]; j++;
      }
      out.push(buf);
      i = j;
    }
  }
  return out;
}

function parseCurl(src: string): { method: string; url: string; headers: Record<string, string>; body?: string; error?: string } {
  let cleaned = src.trim();
  if (cleaned.toLowerCase().startsWith("curl")) cleaned = cleaned.slice(4);
  const tokens = tokenize(cleaned);
  let method = ""; let url = ""; let body = ""; const headers: Record<string, string> = {};
  const dataParts: string[] = [];
  const urlencParts: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "-X" || t === "--request") { method = (tokens[++i] || "").toUpperCase(); continue; }
    if (t === "-H" || t === "--header") {
      const h = tokens[++i] || "";
      const idx = h.indexOf(":");
      if (idx > 0) {
        const k = h.slice(0, idx).trim();
        const v = h.slice(idx + 1).trim();
        if (k && !HOP.has(k.toLowerCase())) headers[k] = v;
      }
      continue;
    }
    if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary") {
      dataParts.push(tokens[++i] || "");
      continue;
    }
    if (t === "--data-urlencode") {
      urlencParts.push(tokens[++i] || "");
      continue;
    }
    if (t === "--url") { url = tokens[++i] || url; continue; }
    if (t === "-i" || t === "-v" || t === "-s" || t === "-S" || t === "-L" || t === "-k" || t === "--insecure" || t === "--compressed" || t === "--location" || t === "--silent" || t === "--include" || t === "--verbose") continue;
    if (t === "-A" || t === "--user-agent") { headers["User-Agent"] = tokens[++i] || ""; continue; }
    if (t === "-e" || t === "--referer") { headers["Referer"] = tokens[++i] || ""; continue; }
    if (t === "-b" || t === "--cookie") { headers["Cookie"] = tokens[++i] || ""; continue; }
    if (t === "-o" || t === "--output" || t === "--max-time" || t === "--connect-timeout" || t === "-m") { i++; continue; }
    if (t.startsWith("-")) continue; // ignore unknown flags
    if (!url && /^https?:\/\//i.test(t)) url = t;
  }

  if (dataParts.length) body = dataParts.join("&");
  if (urlencParts.length) {
    const enc = urlencParts.map((p) => {
      const eq = p.indexOf("=");
      if (eq > 0) return `${encodeURIComponent(p.slice(0, eq))}=${encodeURIComponent(p.slice(eq + 1))}`;
      return encodeURIComponent(p);
    }).join("&");
    body = body ? body + "&" + enc : enc;
  }

  if (!method) method = body ? "POST" : "GET";
  if (!url) return { method, url, headers, body, error: "URL não encontrada no comando cURL" };
  if (body && !Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  return { method, url, headers, body: body || undefined };
}

export const Route = createFileRoute("/api/tools/curl")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let payload: any;
        try { payload = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
        const cmd = String(payload?.curl ?? payload?.command ?? "").trim();
        if (!cmd) return Response.json({ error: "Campo 'curl' obrigatório" }, { status: 400 });
        if (cmd.length > 500_000) return Response.json({ error: "cURL muito grande (>500k)" }, { status: 413 });
        const parsed = parseCurl(cmd);
        if (parsed.error) return Response.json({ error: parsed.error, parsed }, { status: 400 });
        if (!isSafeTarget(parsed.url)) return Response.json({ error: "URL bloqueada (privada/inválida)", parsed }, { status: 400 });

        const start = Date.now();
        try {
          const r = await fetch(parsed.url, {
            method: parsed.method,
            headers: parsed.headers,
            body: ["GET", "HEAD"].includes(parsed.method) ? undefined : parsed.body,
            redirect: "follow",
          });
          const text = await r.text();
          const respHeaders: Record<string, string> = {};
          r.headers.forEach((v, k) => { respHeaders[k] = v; });
          return new Response(JSON.stringify({
            ok: true,
            request: { method: parsed.method, url: parsed.url, headers: parsed.headers, body: parsed.body ?? null },
            response: {
              status: r.status,
              statusText: r.statusText,
              headers: respHeaders,
              body: text.slice(0, 200_000),
              truncated: text.length > 200_000,
              size: text.length,
            },
            duration_ms: Date.now() - start,
          }), { status: 200, headers: { "content-type": "application/json", ...CORS } });
        } catch (e: any) {
          return Response.json({ error: "Falha ao executar requisição", details: e?.message || String(e), request: parsed, duration_ms: Date.now() - start }, { status: 502 });
        }
      },
    },
  },
});
