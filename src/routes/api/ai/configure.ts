import { createFileRoute } from "@tanstack/react-router";

async function callAi(prompt: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const sys = `You configure ONE proxy server with MANY internal endpoints for a tool called Endpointly. Read the user's prompt (any language, ANY length) and produce REAL config (no mocks). Be EXTREMELY thorough — extract EVERY header, EVERY cookie, EVERY body field, EVERY URL EXACTLY as given. NEVER truncate, NEVER summarize, NEVER skip fields.

Return STRICT JSON in this exact shape:
{
  "server": {
    "name": "<short name in user's language>",
    "description": "<1-2 sentences>"
  },
  "variables": { "<NAME>": "<initial value>", ... },
  "endpoints": [
    {
      "name": "<short name e.g. 'Login', 'Criar Cliente', 'Excluir Cliente'>",
      "description": "<1 sentence>",
      "action_key": "<short slug used in client body 'action' field, e.g. 'auth' | 'create' | 'delete'>",
      "method": "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      "target_url": "<full URL — may contain {{VAR}} placeholders and :id for path params from body>",
      "headers": { "<header-name>": "<value or value with {{VAR}}>" },
      "body_template": "<raw body, may contain {{VAR}}>" | null,
      "forward_query": true,
      "forward_body": true,
      "extract_token_path": "<dot path inside JSON response to read, e.g. 'token' or 'data.access_token' — null if none>",
      "extract_token_var": "<variable name to store the extracted value into, e.g. 'TOKEN' — null if none>",
      "extract_token_prefix": "<optional prefix when storing, e.g. 'Bearer ' — null if none>"
    }
  ]
}

KEY RULES:
- Build ONE server. EVERY route in the prompt becomes an entry in "endpoints".
- "action_key" must be a short slug. The proxy will route incoming requests by reading body.action; pick distinct keys per endpoint (e.g. auth, create, delete, refresh).
- Use {{VAR}} placeholders for values that change at runtime (e.g. Authorization: "Bearer {{TOKEN}}"). Put their initial values in "variables".
- For login/refresh endpoints that RETURN a token, fill extract_token_path + extract_token_var so subsequent calls automatically use the new token. Example: login returns {"token":"abc"} -> extract_token_path="token", extract_token_var="TOKEN", extract_token_prefix=null. Then other endpoints use "Authorization":"Bearer {{TOKEN}}".
- For DELETE on dynamic id like /api/customers/[CUSTOMER_ID], set target_url to "https://.../api/customers/:id" — proxy substitutes :id from body.id or query.
- Include EVERY header the user listed verbatim (Sec-Ch-Ua, Baggage, Sentry-Trace, Cookie, etc).
- For Authorization, if a token literal is given AND there's also a login endpoint, set the variable initial value to that token AND have the login endpoint refresh it.
- forward_body=true for POST/PUT/PATCH; false for GET/DELETE/HEAD.
- For GET, body_template must be null.
- Only use URLs explicitly given in the prompt.

DYNAMIC RUNTIME PLACEHOLDERS (the proxy auto-generates these per request — DO NOT put them in "variables"):
- {{RANDOM}}        -> shell-like $RANDOM (0-32767)
- {{RANDOM_BIG}}    -> very large random integer (mimics $((RANDOM*RANDOM*...)) up to 1e18)
- {{RANDOM_N}}      -> N random digits (e.g. {{RANDOM_15}} = 15-digit number)
- {{OFFLINE_ID}}    -> Instagram-style "745" + 18-digit random (replaces the typical OFFLINE_ID="745$(($RANDOM%...))" pattern)
- {{UUID}}          -> RFC4122 UUID v4
- {{TIMESTAMP}}     -> Date.now() in ms
- {{TIMESTAMP_S}}   -> unix seconds
- {{NONCE}}         -> short random string

SHELL → PLACEHOLDER CONVERSION (CRITICAL):
When the prompt contains a shell command (curl/bash) that defines or interpolates variables like $OFFLINE_ID, $RANDOM, $((...)), $(date +%s), or "$VAR" — REPLACE every shell interpolation in the URL/headers/body with the matching placeholder above. For example:
- OFFLINE_ID="745$(($RANDOM%1000000000000000000))" then "...offline_threading_id%22%3A%22$OFFLINE_ID%22..."  ⇒  put {{OFFLINE_ID}} where $OFFLINE_ID appeared and DO NOT define OFFLINE_ID in variables.
- $(date +%s)  ⇒  {{TIMESTAMP_S}}
- $RANDOM      ⇒  {{RANDOM}}
- $(uuidgen)   ⇒  {{UUID}}
Preserve URL-encoding around the placeholder exactly as in the original (e.g. %22{{OFFLINE_ID}}%22).
Keep the FULL --data-raw / --data body verbatim in body_template (with placeholders substituted). Do NOT shorten, do NOT pretty-print, do NOT drop fields.
If Content-Type is application/x-www-form-urlencoded, body_template must be the exact urlencoded string (not JSON).

- Output JSON ONLY, no markdown.

ADDITIONAL DEEP-INTELLIGENCE RULES (apply ALWAYS):
1. ACTION_KEY is MANDATORY for every endpoint — even if there's only one. Pick a short slug from the user's intent: "login"->auth, "send message"->send, "create"->create, "delete"->delete, "list"->list, "get reel id"->reel_id. Two endpoints MUST never share the same action_key.
2. body_template MUST contain the FULL body verbatim from the user's curl/spec, with shell variables replaced by {{PLACEHOLDERS}}. NEVER abbreviate. If user pasted 5000 chars of urlencoded body, output all 5000 chars.
3. AUTO-DETECT runtime values that change per request and replace them inline with the correct placeholder:
   - any "offline_threading_id", "client_context", "client_id" Instagram-style -> {{OFFLINE_ID}}
   - "nonce", "request_id", "trace_id" -> {{NONCE}} or {{UUID}}
   - "timestamp", "ts", "_t", "epoch" -> {{TIMESTAMP}} (ms) or {{TIMESTAMP_S}} (seconds)
   - generic "id" fields that look like 18+ digit random ints -> {{RANDOM_BIG}}
   - any shell interpolations like \\$RANDOM, \\$OFFLINE_ID, \\$(date +%s), \\$(uuidgen)
4. VARIABLES: for every literal the user might want to change (USERNAME, PASSWORD, TOKEN, COOKIE, CSRF, USER_AGENT, etc.), extract into "variables" with UPPERCASE name and reference via {{VAR}} in headers/url/body. NEVER hardcode tokens/cookies/csrf/user-agents directly.
5. If the prompt mentions "repeat N times", "send X messages", "loop", STILL generate ONE endpoint — repetition is the client's job. Do NOT duplicate endpoints.
6. If the user mentions Instagram reel/post by shortcode or "get video id from link", create a GET endpoint to https://www.instagram.com/p/{{SHORTCODE}}/?__a=1&__d=dis with browser headers, extract_token_path="items.0.pk", extract_token_var="MEDIA_ID".
7. If the user mentions encryption/decryption (AES/RSA/base64/hmac/sha256), set Content-Type appropriately and pass the encrypted payload AS-IS in body_template. For required HMAC signature headers, use {{SIGNATURE}} and note in description that the user must compute it.
8. extract_token_path supports nested paths ("data.user.token"). Set it whenever the response returns a value reused later (token, session, csrf, id, cursor).
9. NEVER output "TODO", "example.com", "your-token". If user didn't provide a value, leave the variable EMPTY in "variables" but keep the {{VAR}} reference.
10. Produce VALID JSON only. No trailing commas. Newlines in strings must be \\n. URL-encoded bodies must remain a single string. No comments.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);

  const server = {
    name: typeof parsed?.server?.name === "string" ? parsed.server.name : "Servidor",
    description: typeof parsed?.server?.description === "string" ? parsed.server.description : "",
  };
  const variables = parsed?.variables && typeof parsed.variables === "object" ? parsed.variables : {};
  const endpointsRaw = Array.isArray(parsed?.endpoints) ? parsed.endpoints : [];
  const endpoints = endpointsRaw
    .filter((e: any) => e && typeof e === "object")
    .map((e: any, i: number) => ({
      name: typeof e.name === "string" ? e.name : `Endpoint ${i + 1}`,
      description: typeof e.description === "string" ? e.description : "",
      action_key: typeof e.action_key === "string" ? e.action_key : null,
      method: typeof e.method === "string" ? e.method.toUpperCase() : "GET",
      target_url: typeof e.target_url === "string" ? e.target_url : "",
      headers: e.headers && typeof e.headers === "object" ? e.headers : {},
      body_template: e.body_template ?? null,
      forward_query: e.forward_query !== false,
      forward_body: e.forward_body !== false,
      extract_token_path: typeof e.extract_token_path === "string" ? e.extract_token_path : null,
      extract_token_var: typeof e.extract_token_var === "string" ? e.extract_token_var : null,
      extract_token_prefix: typeof e.extract_token_prefix === "string" ? e.extract_token_prefix : null,
      sort_order: i,
    }));

  return { server, variables, endpoints };
}

export const Route = createFileRoute("/api/ai/configure")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization");
          if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
          const { prompt } = await request.json();
          if (!prompt || typeof prompt !== "string") {
            return Response.json({ error: "Invalid prompt" }, { status: 400 });
          }
          const result = await callAi(prompt);
          if (result.endpoints.length === 0) {
            return Response.json({ error: "A IA não conseguiu extrair nenhum endpoint do prompt." }, { status: 422 });
          }
          return Response.json(result);
        } catch (e: any) {
          return Response.json({ error: e.message || "Failed" }, { status: 500 });
        }
      },
    },
  },
});
