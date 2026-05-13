import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Save, Trash2, Copy, RefreshCw, Activity, Plus, ChevronDown, ChevronRight, Play, Terminal, Wrench, Ban } from "lucide-react";

export const Route = createFileRoute("/_authenticated/servers/$id")({
  component: ConfigureServer,
});

type ServerFull = {
  id: string; slug: string; name: string; description: string | null; logo_url: string | null;
  variables: Record<string, string>;
  require_api_key: boolean; api_key: string | null; rate_limit_per_min: number; enabled: boolean;
  maintenance_mode: boolean; maintenance_message: string | null;
  banned_ips: string[];
};
type PageRow = { id: string; slug: string; title: string; maintenance_mode: boolean; maintenance_message: string | null };
type Endpoint = {
  id: string; server_id: string; user_id: string;
  action_key: string | null; name: string; description: string | null;
  method: string; target_url: string; headers: Record<string, string>;
  body_template: string | null; forward_query: boolean; forward_body: boolean;
  extract_token_path: string | null; extract_token_var: string | null; extract_token_prefix: string | null;
  extract_regex: string | null; chain_to_action: string | null;
  sort_order: number;
};

const inputCls = "w-full rounded-lg bg-input border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

function ConfigureServer() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [s, setS] = useState<ServerFull | null>(null);
  const [eps, setEps] = useState<Endpoint[]>([]);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [varPairs, setVarPairs] = useState<{ k: string; v: string }[]>([]);
  const [testing, setTesting] = useState<string | null>(null);
  const [testOut, setTestOut] = useState<Record<string, { status: number; body: string }>>({});
  const [testBodies, setTestBodies] = useState<Record<string, string>>({});

  const reload = async () => {
    const [{ data: srv }, { data: e }, { data: p }] = await Promise.all([
      supabase.from("servers").select("*").eq("id", id).maybeSingle(),
      supabase.from("endpoints").select("*").eq("server_id", id).order("sort_order"),
      supabase.from("pages").select("id,slug,title,maintenance_mode,maintenance_message").eq("server_id", id),
    ]);
    if (!srv) { toast.error("Servidor não encontrado"); navigate({ to: "/dashboard" }); return; }
    const row = srv as any as ServerFull;
    setS(row);
    setVarPairs(Object.entries(row.variables ?? {}).map(([k, v]) => ({ k, v: String(v) })));
    setEps((e ?? []) as any);
    setPages((p ?? []) as any);
    setLoading(false);
  };
  useEffect(() => { reload(); }, [id]);

  if (loading || !s) return <div className="container mx-auto px-6 py-10 text-muted-foreground">Carregando...</div>;
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/api/public/s/${s.slug}`;

  const saveServer = async () => {
    const variables: Record<string, string> = {};
    varPairs.forEach(({ k, v }) => { if (k.trim()) variables[k.trim()] = v; });
    const { error } = await supabase.from("servers").update({
      name: s.name, description: s.description, logo_url: s.logo_url,
      variables, require_api_key: s.require_api_key, api_key: s.api_key,
      rate_limit_per_min: s.rate_limit_per_min, enabled: s.enabled,
      maintenance_mode: s.maintenance_mode, maintenance_message: s.maintenance_message,
      banned_ips: s.banned_ips ?? [],
      updated_at: new Date().toISOString(),
    }).eq("id", s.id);
    if (error) toast.error(error.message); else toast.success("Servidor salvo!");
  };

  const removeServer = async () => {
    if (!confirm("Excluir o servidor inteiro (e todos seus endpoints)?")) return;
    await supabase.from("servers").delete().eq("id", s.id);
    toast.success("Excluído"); navigate({ to: "/dashboard" });
  };

  const addEndpoint = async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("endpoints").insert({
      server_id: s.id, user_id: u.user!.id,
      name: "Novo endpoint", method: "GET", target_url: "",
      sort_order: eps.length,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setEps([...eps, data as any]);
    setOpen((data as any).id);
  };

  const saveEndpoint = async (ep: Endpoint) => {
    const { error } = await supabase.from("endpoints").update({
      action_key: ep.action_key || null, name: ep.name, description: ep.description,
      method: ep.method, target_url: ep.target_url, headers: ep.headers,
      body_template: ep.body_template, forward_query: ep.forward_query, forward_body: ep.forward_body,
      extract_token_path: ep.extract_token_path || null,
      extract_token_var: ep.extract_token_var || null,
      extract_token_prefix: ep.extract_token_prefix || null,
      extract_regex: ep.extract_regex || null,
      chain_to_action: ep.chain_to_action || null,
      updated_at: new Date().toISOString(),
    }).eq("id", ep.id);
    if (error) toast.error(error.message); else toast.success("Endpoint salvo!");
  };

  const removeEndpoint = async (epId: string) => {
    if (!confirm("Excluir este endpoint?")) return;
    await supabase.from("endpoints").delete().eq("id", epId);
    setEps(eps.filter((e) => e.id !== epId));
  };

  const updEp = (epId: string, patch: Partial<Endpoint>) => setEps(eps.map((e) => e.id === epId ? { ...e, ...patch } : e));

  const defaultTestBody = (ep: Endpoint): string => {
    if (ep.method === "GET" || ep.method === "HEAD") return "";
    // Try to merge action + parsed body_template (if JSON)
    if (ep.body_template) {
      try {
        const parsed = JSON.parse(ep.body_template);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return JSON.stringify(ep.action_key ? { action: ep.action_key, ...parsed } : parsed, null, 2);
        }
      } catch {
        // raw body (urlencoded etc.) — wrap with action + rawBody
        if (ep.action_key) return JSON.stringify({ action: ep.action_key, rawBody: ep.body_template }, null, 2);
        return ep.body_template;
      }
    }
    return ep.action_key ? JSON.stringify({ action: ep.action_key }, null, 2) : "";
  };

  const buildCurl = (ep: Endpoint): string => {
    const body = testBodies[ep.id] ?? defaultTestBody(ep);
    const method = ep.method === "GET" ? "GET" : "POST";
    const lines = [`curl -X ${method} '${url}'`];
    lines.push(`-H 'Content-Type: application/json'`);
    if (s.require_api_key && s.api_key) lines.push(`-H 'x-api-key: ${s.api_key}'`);
    if (body && method !== "GET") lines.push(`--data-raw '${body.replace(/'/g, "'\\''")}'`);
    return lines.join(" \\\n  ");
  };

  const runTest = async (ep: Endpoint) => {
    setTesting(ep.id);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (s.require_api_key && s.api_key) headers["x-api-key"] = s.api_key;
      const body: string | undefined = testBodies[ep.id] ?? defaultTestBody(ep);
      const r = await fetch(url, { method: ep.method === "GET" ? "GET" : "POST", headers, body: ep.method === "GET" ? undefined : body });
      const text = await r.text();
      setTestOut({ ...testOut, [ep.id]: { status: r.status, body: text.slice(0, 5000) } });
      // refresh variables in case of token extraction
      reload();
    } catch (e: any) {
      setTestOut({ ...testOut, [ep.id]: { status: 0, body: e.message } });
    } finally {
      setTesting(null);
    }
  };

  return (
    <main className="container mx-auto px-6 py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="size-4" /> Voltar</Link>
        <div className="flex gap-2">
          <button onClick={removeServer} className="rounded-lg border border-border px-3 py-1.5 text-sm flex items-center gap-1 hover:border-destructive hover:text-destructive transition"><Trash2 className="size-4" /> Excluir</button>
          <button onClick={saveServer} className="rounded-lg bg-primary text-primary-foreground px-4 py-1.5 text-sm font-semibold flex items-center gap-1 hover:opacity-90 transition"><Save className="size-4" /> Salvar servidor</button>
        </div>
      </div>

      <input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} className="text-2xl font-bold bg-transparent w-full focus:outline-none" />
      <textarea value={s.description ?? ""} onChange={(e) => setS({ ...s, description: e.target.value })} placeholder="Descrição..." rows={1} className="text-sm text-muted-foreground bg-transparent w-full focus:outline-none mt-1 resize-none" />

      <div className="mt-3 flex items-center gap-2 rounded-lg bg-card border border-border px-3 py-2 text-xs font-mono">
        <span className="text-muted-foreground">URL pública:</span>
        <span className="truncate">{url}</span>
        <button onClick={() => { navigator.clipboard.writeText(url); toast.success("Copiado!"); }} className="ml-auto p-1 hover:text-primary"><Copy className="size-3.5" /></button>
        <Link to="/serverlogs/$id" params={{ id: s.id }} className="p-1 hover:text-primary"><Activity className="size-3.5" /></Link>
      </div>

      {/* Variables */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Variáveis compartilhadas</h2>
          <button onClick={() => setVarPairs([...varPairs, { k: "", v: "" }])} className="text-xs text-primary hover:underline">+ Adicionar</button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Use <code className="bg-muted px-1 rounded">{"{{NOME}}"}</code> em headers, URL ou body. Tokens extraídos das respostas atualizam aqui automaticamente.</p>
        <div className="space-y-2 rounded-xl border border-border bg-card p-3">
          {varPairs.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma variável.</p>}
          {varPairs.map((v, i) => (
            <div key={i} className="flex gap-2">
              <input value={v.k} onChange={(e) => { const x = [...varPairs]; x[i].k = e.target.value; setVarPairs(x); }} placeholder="TOKEN" className={inputCls + " font-mono text-xs flex-1"} />
              <input value={v.v} onChange={(e) => { const x = [...varPairs]; x[i].v = e.target.value; setVarPairs(x); }} placeholder="valor atual" className={inputCls + " font-mono text-xs flex-[2]"} />
              <button onClick={() => setVarPairs(varPairs.filter((_, j) => j !== i))} className="px-2 text-muted-foreground hover:text-destructive">✕</button>
            </div>
          ))}
        </div>
      </section>

      {/* Endpoints */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Endpoints ({eps.length})</h2>
          <button onClick={addEndpoint} className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1"><Plus className="size-4" /> Endpoint</button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">O proxy escolhe o endpoint pela chave <code className="bg-muted px-1 rounded">action</code> no body JSON. Ex: <code className="bg-muted px-1 rounded">{`{"action":"auth", ...}`}</code>.</p>

        <div className="space-y-2">
          {eps.map((ep) => (
            <div key={ep.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <button onClick={() => setOpen(open === ep.id ? null : ep.id)} className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition">
                {open === ep.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary font-bold">{ep.method}</span>
                <span className="font-medium text-sm">{ep.name}</span>
                {ep.action_key && <span className="text-xs font-mono text-muted-foreground">action="{ep.action_key}"</span>}
                <span className="ml-auto text-xs text-muted-foreground truncate max-w-xs">{ep.target_url}</span>
              </button>

              {open === ep.id && (
                <div className="p-4 border-t border-border space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <input value={ep.name} onChange={(e) => updEp(ep.id, { name: e.target.value })} placeholder="Nome" className={inputCls} />
                    <input value={ep.action_key ?? ""} onChange={(e) => updEp(ep.id, { action_key: e.target.value })} placeholder='action_key (ex: "auth")' className={inputCls + " font-mono text-xs"} />
                    <select value={ep.method} onChange={(e) => updEp(ep.id, { method: e.target.value })} className={inputCls}>
                      {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <input value={ep.target_url} onChange={(e) => updEp(ep.id, { target_url: e.target.value })} placeholder="https://api.exemplo.com/recurso (use :id e {{VAR}})" className={inputCls + " font-mono text-xs"} />

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium">Headers</label>
                      <button onClick={() => updEp(ep.id, { headers: { ...ep.headers, "": "" } })} className="text-xs text-primary hover:underline">+ Header</button>
                    </div>
                    <div className="space-y-1.5">
                      {Object.entries(ep.headers).map(([k, v], i) => (
                        <div key={i} className="flex gap-1">
                          <input value={k} onChange={(e) => { const h = { ...ep.headers }; const val = h[k]; delete h[k]; h[e.target.value] = val; updEp(ep.id, { headers: h }); }} placeholder="Header" className={inputCls + " font-mono text-xs flex-1"} />
                          <input value={String(v)} onChange={(e) => updEp(ep.id, { headers: { ...ep.headers, [k]: e.target.value } })} placeholder="valor (ex: Bearer {{TOKEN}})" className={inputCls + " font-mono text-xs flex-[2]"} />
                          <button onClick={() => { const h = { ...ep.headers }; delete h[k]; updEp(ep.id, { headers: h }); }} className="px-2 text-muted-foreground hover:text-destructive">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium">Body template</label>
                    <textarea value={ep.body_template ?? ""} onChange={(e) => updEp(ep.id, { body_template: e.target.value })} rows={4} placeholder='{"username":"{{USERNAME}}"}' className={inputCls + " font-mono text-xs"} />
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-background p-3">
                    <div className="col-span-3 text-xs font-medium">🔑 Auto-extrair valor da resposta (token, id, etc.)</div>
                    <input value={ep.extract_token_path ?? ""} onChange={(e) => updEp(ep.id, { extract_token_path: e.target.value })} placeholder="Caminho na resposta (ex: token, data.access_token)" className={inputCls + " font-mono text-xs col-span-2"} />
                    <input value={ep.extract_token_var ?? ""} onChange={(e) => updEp(ep.id, { extract_token_var: e.target.value })} placeholder="Salvar em variável (ex: TOKEN)" className={inputCls + " font-mono text-xs"} />
                    <input value={ep.extract_token_prefix ?? ""} onChange={(e) => updEp(ep.id, { extract_token_prefix: e.target.value })} placeholder='Prefixo opcional (ex: "Bearer ")' className={inputCls + " font-mono text-xs col-span-3"} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-background p-3">
                    <div className="col-span-2 text-xs font-medium">🪄 Regex + Encadeamento automático</div>
                    <input value={ep.extract_regex ?? ""} onChange={(e) => updEp(ep.id, { extract_regex: e.target.value })} placeholder="extract_regex (ex: instagram://media\?id=([0-9]+))" className={inputCls + " font-mono text-xs col-span-2"} />
                    <input value={ep.chain_to_action ?? ""} onChange={(e) => updEp(ep.id, { chain_to_action: e.target.value })} placeholder="Após extrair, chamar action_key… (ex: send_msg)" className={inputCls + " font-mono text-xs col-span-2"} />
                    <p className="col-span-2 text-[11px] text-muted-foreground">Se preenchido, o backend extrai o valor da resposta e automaticamente chama o próximo endpoint passando-o como {"{{ID}}"} / {"{{VALUE}}"} no body_template/headers/url do endpoint encadeado.</p>
                  </div>

                  <div className="flex gap-4 text-xs">
                    <label className="inline-flex items-center gap-1"><input type="checkbox" checked={ep.forward_query} onChange={(e) => updEp(ep.id, { forward_query: e.target.checked })} /> Encaminhar query</label>
                    <label className="inline-flex items-center gap-1"><input type="checkbox" checked={ep.forward_body} onChange={(e) => updEp(ep.id, { forward_body: e.target.checked })} /> Encaminhar body</label>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => saveEndpoint(ep)} className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1"><Save className="size-4" /> Salvar endpoint</button>
                    <button onClick={() => removeEndpoint(ep.id)} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-destructive hover:text-destructive inline-flex items-center gap-1"><Trash2 className="size-4" /> Remover</button>
                  </div>

                  <div className="rounded-lg border border-border bg-background p-3 space-y-2">
                    <div className="text-xs font-medium">Testar este endpoint</div>
                    <textarea value={testBodies[ep.id] ?? defaultTestBody(ep)} onChange={(e) => setTestBodies({ ...testBodies, [ep.id]: e.target.value })} rows={5} className={inputCls + " font-mono text-xs"} />
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => runTest(ep)} disabled={testing === ep.id} className="rounded-lg border border-primary/40 bg-primary/10 text-primary px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                        <Play className="size-3.5" /> {testing === ep.id ? "Enviando..." : "Testar"}
                      </button>
                      <button onClick={() => { navigator.clipboard.writeText(buildCurl(ep)); toast.success("cURL copiado!"); }} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1 hover:border-primary">
                        <Terminal className="size-3.5" /> Copiar cURL
                      </button>
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver cURL gerado</summary>
                      <pre className="mt-2 rounded bg-muted p-2 overflow-auto text-[11px] whitespace-pre-wrap break-all">{buildCurl(ep)}</pre>
                    </details>
                    {testOut[ep.id] && (
                      <div>
                        <div className="text-xs text-muted-foreground">Status: <span className={testOut[ep.id].status < 400 ? "text-primary" : "text-destructive"}>{testOut[ep.id].status}</span></div>
                        <pre className="mt-1 rounded bg-muted p-2 text-xs overflow-auto max-h-60 whitespace-pre-wrap break-words">{testOut[ep.id].body}</pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {eps.length === 0 && <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border p-6 text-center">Nenhum endpoint. Clique em "+ Endpoint" para criar.</p>}
        </div>
      </section>

      {/* Security */}
      <section className="mt-8">
        <h2 className="font-semibold mb-3">Segurança</h2>
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />
            Servidor ativo
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.require_api_key} onChange={(e) => setS({ ...s, require_api_key: e.target.checked })} />
            Exigir <code className="bg-muted px-1 rounded">x-api-key</code>
          </label>
          <div className="flex gap-2">
            <input value={s.api_key ?? ""} readOnly placeholder="(nenhuma)" className={inputCls + " font-mono text-xs"} />
            <button onClick={() => setS({ ...s, api_key: "sk_" + crypto.randomUUID().replace(/-/g, "") })} className="rounded-lg border border-border px-3 text-sm hover:bg-muted">Gerar</button>
          </div>
          <div>
            <label className="text-xs">Limite por minuto (por IP)</label>
            <input type="number" min={1} max={10000} value={s.rate_limit_per_min} onChange={(e) => setS({ ...s, rate_limit_per_min: Number(e.target.value) })} className={inputCls + " w-32"} />
          </div>
          <button onClick={() => { const slug = Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6); setS({ ...s, slug }); supabase.from("servers").update({ slug }).eq("id", s.id).then(() => toast.success("Novo slug gerado")); }} className="rounded-lg border border-border px-3 py-1.5 text-sm inline-flex items-center gap-1"><RefreshCw className="size-3.5" /> Gerar novo slug</button>
        </div>
      </section>

      {/* Maintenance */}
      <section className="mt-8">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Wrench className="size-4" /> Modo manutenção</h2>
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.maintenance_mode} onChange={(e) => setS({ ...s, maintenance_mode: e.target.checked })} />
            Ativar página de manutenção (retorna 503 com HTML para GET, JSON para POST)
          </label>
          <textarea value={s.maintenance_message ?? ""} onChange={(e) => setS({ ...s, maintenance_message: e.target.value })} rows={2} placeholder="Mensagem mostrada na página de manutenção..." className={inputCls + " text-sm"} />
        </div>
      </section>

      {/* IP Ban */}
      <section className="mt-8 mb-12">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Ban className="size-4" /> IPs bloqueados ({(s.banned_ips ?? []).length})</h2>
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs text-muted-foreground">Veja os IPs que acessaram em <Link to="/serverlogs/$id" params={{ id: s.id }} className="text-primary underline">Logs</Link>. Adicione um IP por linha. Salve para aplicar.</p>
          <textarea
            value={(s.banned_ips ?? []).join("\n")}
            onChange={(e) => setS({ ...s, banned_ips: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })}
            rows={4}
            placeholder="203.0.113.42&#10;198.51.100.7"
            className={inputCls + " font-mono text-xs"}
          />
        </div>
      </section>

      {/* Páginas HTML públicas — modo manutenção */}
      {pages.length > 0 && (
        <section className="mt-2 mb-12">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><Wrench className="size-4" /> Páginas HTML ({pages.length})</h2>
          <div className="space-y-3">
            {pages.map((pg, idx) => (
              <div key={pg.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <code className="font-mono text-xs bg-muted rounded px-2 py-1 truncate flex-1">{typeof window !== "undefined" ? window.location.origin : ""}/api/public/p/{pg.slug}</code>
                  <a href={`/api/public/p/${pg.slug}`} target="_blank" rel="noreferrer" className="rounded-md bg-primary text-primary-foreground px-2 py-1 text-xs">Abrir</a>
                </div>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={pg.maintenance_mode} onChange={(e) => {
                    const next = [...pages]; next[idx] = { ...pg, maintenance_mode: e.target.checked }; setPages(next);
                  }} />
                  Modo manutenção (página HTML retorna 503)
                </label>
                <textarea value={pg.maintenance_message ?? ""} onChange={(e) => {
                  const next = [...pages]; next[idx] = { ...pg, maintenance_message: e.target.value }; setPages(next);
                }} rows={2} placeholder="Mensagem de manutenção..." className={inputCls + " text-sm"} />
                <div className="flex gap-2">
                  <button onClick={async () => {
                    const { error } = await supabase.from("pages").update({ maintenance_mode: pg.maintenance_mode, maintenance_message: pg.maintenance_message }).eq("id", pg.id);
                    if (error) toast.error(error.message); else toast.success("Página atualizada!");
                  }} className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1"><Save className="size-4" /> Salvar página</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
