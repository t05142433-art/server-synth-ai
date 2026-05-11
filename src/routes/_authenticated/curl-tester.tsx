import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Terminal, Sparkles, Plus, X, Loader2, Copy, CheckCircle2, AlertCircle, Globe, Save, Trash2, Instagram } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { seedInstagramBot } from "@/lib/seed-instagram.functions";

export const Route = createFileRoute("/_authenticated/curl-tester")({
  component: CurlTester,
});

const inputCls = "w-full rounded-lg bg-input border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

type LogLine = { line: string; level: "info" | "ok" | "warn" | "err" | "ai"; t: number };
type Plan = { server: { name: string; description: string; variables: Record<string, string> }; endpoints: any[]; notes?: string };
type ServerRow = { id: string; slug: string; name: string };

const LEVEL_COLOR: Record<string, string> = {
  info: "text-muted-foreground",
  ok: "text-emerald-400",
  warn: "text-yellow-400",
  err: "text-red-400",
  ai: "text-primary",
};

function CurlTester() {
  const [curls, setCurls] = useState<string[]>([
    `curl -s "https://www.instagram.com/p/DYKEoJYAR7j/" | grep -oP 'instagram://media\\?id=\\K[0-9]+'`,
  ]);
  const [instructions, setInstructions] = useState("");
  const [expectedOutput, setExpectedOutput] = useState("");
  const [generateHtml, setGenerateHtml] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [finalEndpoints, setFinalEndpoints] = useState<any[] | null>(null);
  const [html, setHtml] = useState<string | null>(null);

  // Save dialog
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ slug: string; serverId: string; pageSlug?: string } | null>(null);
  const [showSave, setShowSave] = useState(false);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [pickedServer, setPickedServer] = useState("");

  const termRef = useRef<HTMLDivElement>(null);
  useEffect(() => { termRef.current?.scrollTo({ top: termRef.current.scrollHeight }); }, [logs]);

  useEffect(() => {
    if (showSave) {
      supabase.from("servers").select("id,slug,name").order("created_at", { ascending: false }).then(({ data }) => {
        setServers((data ?? []) as any);
        if (data && data.length && !pickedServer) setPickedServer(data[0].id);
      });
    }
  }, [showSave]);

  const updateCurl = (i: number, v: string) => setCurls((cs) => cs.map((c, idx) => (idx === i ? v : c)));
  const addCurl = () => setCurls((cs) => (cs.length >= 6 ? cs : [...cs, ""]));
  const removeCurl = (i: number) => setCurls((cs) => cs.filter((_, idx) => idx !== i));

  const run = async () => {
    const valid = curls.map((c) => c.trim()).filter(Boolean);
    if (!valid.length) { toast.error("Adicione ao menos 1 cURL"); return; }
    setBusy(true); setLogs([]); setPlan(null); setFinalEndpoints(null); setHtml(null); setSaved(null);

    try {
      const r = await fetch("/api/ai/auto-configure", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curls: valid, instructions, expected_output: expectedOutput, generate_html: generateHtml }),
      });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() || "";
        for (const evt of events) {
          const ev = evt.match(/^event: (\w+)/)?.[1];
          const dataLine = evt.match(/^data: (.+)$/m)?.[1];
          if (!ev || !dataLine) continue;
          let data: any; try { data = JSON.parse(dataLine); } catch { continue; }
          if (ev === "log") setLogs((ls) => [...ls, data]);
          else if (ev === "plan") setPlan(data);
          else if (ev === "done") { setFinalEndpoints(data.endpoints); setHtml(data.html); }
          else if (ev === "error") toast.error(data.error);
        }
      }
    } catch (e: any) { toast.error(e.message); setLogs((ls) => [...ls, { line: `💥 ${e.message}`, level: "err", t: Date.now() }]); }
    finally { setBusy(false); }
  };

  const slugify = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);

  const confirmSave = async () => {
    if (!plan || !finalEndpoints) return;
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { toast.error("Faça login"); return; }

      let serverId: string, slug: string;
      if (mode === "new") {
        const first = finalEndpoints[0] || {};
        slug = slugify();
        const { data: srv, error } = await supabase.from("servers").insert({
          user_id: u.user.id, slug, name: plan.server.name, description: plan.server.description,
          method: first.method || "GET", target_url: first.url || "",
          headers: first.headers || {}, body_template: first.body || null,
          variables: plan.server.variables || {}, extract_regex: first.extract_regex || null,
          forward_query: false, forward_body: false, enabled: true,
        }).select("id,slug").single();
        if (error) throw error;
        serverId = srv.id; slug = srv.slug;
      } else {
        if (!pickedServer) { toast.error("Selecione um servidor"); return; }
        const srv = servers.find((s) => s.id === pickedServer)!;
        serverId = srv.id; slug = srv.slug;
      }

      // count existing
      const { count } = await supabase.from("endpoints").select("id", { count: "exact", head: true }).eq("server_id", serverId);
      const base = count ?? 0;

      const rows = finalEndpoints.map((ep, i) => ({
        server_id: serverId, user_id: u.user!.id,
        action_key: ep.action_key || null, name: ep.name || `Endpoint ${i + 1}`,
        description: ep.description || null, method: ep.method || "GET", target_url: ep.url || "",
        headers: ep.headers || {}, body_template: ep.body || null,
        forward_query: false, forward_body: false, sort_order: base + i,
      }));
      const { error: epErr } = await supabase.from("endpoints").insert(rows);
      if (epErr) throw epErr;

      let pageSlug: string | undefined;
      if (html) {
        pageSlug = slugify();
        // Substitute the __SERVER_BASE__ placeholder with the REAL backend proxy URL
        // so the generated HTML's Test buttons hit our backend (which forwards to upstream),
        // not the upstream service directly (which would fail CORS).
        const serverBase = `/api/public/s/${slug}`;
        const htmlWired = html.replaceAll("__SERVER_BASE__", serverBase);
        const { error: pErr } = await supabase.from("pages").insert({
          user_id: u.user.id, server_id: serverId, slug: pageSlug,
          title: plan.server.name, description: plan.server.description, html: htmlWired,
        });
        if (pErr) throw pErr;
      }

      setSaved({ slug, serverId, pageSlug });
      setShowSave(false);
      toast.success(`${rows.length} endpoint(s) salvos${pageSlug ? " + página HTML publicada" : ""}!`);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success("Copiado!"); };
  const apiUrl = saved && typeof window !== "undefined" ? `${window.location.origin}/api/public/s/${saved.slug}` : null;
  const pageUrl = saved?.pageSlug && typeof window !== "undefined" ? `${window.location.origin}/api/public/p/${saved.pageSlug}` : null;
  const successCount = finalEndpoints?.filter((e) => e._success).length ?? 0;

  return (
    <main className="container mx-auto px-6 py-8 max-w-6xl">
      <div className="flex items-center gap-2 mb-1">
        <Terminal className="size-5 text-primary" />
        <h1 className="text-2xl font-bold">Terminal cURL com IA</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Cole até 6 comandos cURL (ou logs/exemplos). A IA planeja, executa, corrige headers/variables e tenta de novo até dar certo. Opcionalmente gera uma página HTML pública documentando a API.
      </p>

      <InstagramPreset />

      <div className="space-y-3 mt-6">
        {curls.map((c, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-muted-foreground">cURL #{i + 1}</span>
              {curls.length > 1 && (
                <button onClick={() => removeCurl(i)} className="text-muted-foreground hover:text-destructive"><X className="size-4" /></button>
              )}
            </div>
            <textarea value={c} onChange={(e) => updateCurl(i, e.target.value)} rows={4}
              className={inputCls + " font-mono text-xs"} placeholder={`curl -X GET '...' -H '...'`} />
          </div>
        ))}
        {curls.length < 6 && (
          <button onClick={addCurl} className="w-full rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground hover:bg-muted inline-flex items-center justify-center gap-1">
            <Plus className="size-4" /> Adicionar outro cURL ({curls.length}/6)
          </button>
        )}
      </div>

      {/* Extras */}
      <div className="mt-4 grid md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium">Instruções extras (opcional)</label>
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3}
            className={inputCls} placeholder="ex: a primeira faz login e devolve token; use o token na segunda" />
        </div>
        <div>
          <label className="text-xs font-medium">Output esperado / logs (opcional)</label>
          <textarea value={expectedOutput} onChange={(e) => setExpectedOutput(e.target.value)} rows={3}
            className={inputCls + " font-mono text-xs"} placeholder='ex: 1234567890123 ou {"status":"ok"}' />
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={generateHtml} onChange={(e) => setGenerateHtml(e.target.checked)} />
        <Globe className="size-4 text-primary" /> Gerar página HTML pública documentando a API
      </label>

      <button onClick={run} disabled={busy} className="mt-4 rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50" style={{ boxShadow: "var(--shadow-glow)" }}>
        {busy ? <><Loader2 className="size-4 animate-spin" /> IA configurando…</> : <><Sparkles className="size-4" /> Auto-configurar com IA</>}
      </button>

      {/* Terminal */}
      {(busy || logs.length > 0) && (
        <section className="mt-6 rounded-xl border border-border bg-black overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 bg-card">
            <div className="flex gap-1.5"><span className="size-2.5 rounded-full bg-red-500" /><span className="size-2.5 rounded-full bg-yellow-500" /><span className="size-2.5 rounded-full bg-emerald-500" /></div>
            <span className="text-xs font-mono text-muted-foreground ml-2">termux@ai-agent:~$</span>
            {busy && <Loader2 className="size-3 animate-spin text-primary ml-auto" />}
            {!busy && logs.length > 0 && (
              <button onClick={() => setLogs([])} className="ml-auto text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><Trash2 className="size-3" /></button>
            )}
          </div>
          <div ref={termRef} className="p-3 font-mono text-xs overflow-auto max-h-[400px] space-y-0.5">
            {logs.map((l, i) => (
              <div key={i} className={`whitespace-pre-wrap break-words ${LEVEL_COLOR[l.level] || ""}`}>{l.line}</div>
            ))}
            {busy && <div className="text-primary animate-pulse">▊</div>}
          </div>
        </section>
      )}

      {/* Plan */}
      {plan && (
        <section className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-2"><Sparkles className="size-4 text-primary" /><h3 className="font-semibold text-sm">{plan.server.name}</h3></div>
          <p className="text-xs text-muted-foreground mb-3">{plan.server.description}</p>
          {Object.keys(plan.server.variables || {}).length > 0 && (
            <div className="text-xs mb-3">
              <span className="text-muted-foreground">Variables:</span>
              <code className="ml-2 bg-muted px-1.5 py-0.5 rounded">{Object.keys(plan.server.variables).join(", ")}</code>
            </div>
          )}
          <div className="space-y-2">
            {(finalEndpoints || plan.endpoints).map((ep: any, i: number) => (
              <div key={i} className={`rounded-lg border p-2 text-xs flex items-center gap-2 ${ep._success === false ? "border-destructive/40 bg-destructive/5" : ep._success ? "border-emerald-500/40 bg-emerald-500/5" : "border-border"}`}>
                {ep._success === true ? <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" /> :
                  ep._success === false ? <AlertCircle className="size-3.5 text-destructive shrink-0" /> :
                  <div className="size-3.5 rounded-full border border-muted-foreground shrink-0" />}
                <span className="font-mono text-primary shrink-0">{ep.method}</span>
                <span className="truncate flex-1">{ep.name} — <span className="text-muted-foreground">{ep.url}</span></span>
                {ep._attempts && <span className="text-muted-foreground shrink-0">{ep._attempts}x</span>}
              </div>
            ))}
          </div>

          {finalEndpoints && !saved && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => setShowSave(true)} disabled={successCount === 0}
                className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                <Save className="size-4" /> Salvar como API ({successCount}/{finalEndpoints.length} OK)
              </button>
              {html && (
                <button onClick={() => { const w = window.open(); if (w) { w.document.write(html); w.document.close(); } }}
                  className="rounded-lg border border-border px-4 py-2 text-sm inline-flex items-center gap-1">
                  <Globe className="size-4" /> Preview HTML
                </button>
              )}
            </div>
          )}

          {saved && (
            <div className="mt-4 rounded-lg bg-card border border-emerald-500/30 p-3 space-y-2">
              <div className="text-xs font-semibold text-emerald-400 inline-flex items-center gap-1"><CheckCircle2 className="size-3.5" /> API publicada</div>
              {apiUrl && (
                <div className="flex items-center gap-2"><code className="flex-1 text-xs font-mono bg-muted rounded px-2 py-1 truncate">{apiUrl}</code>
                  <button onClick={() => copy(apiUrl)} className="rounded-md border border-border px-2 py-1 text-xs"><Copy className="size-3" /></button>
                </div>
              )}
              {pageUrl && (
                <div className="flex items-center gap-2"><Globe className="size-3.5 text-primary" /><code className="flex-1 text-xs font-mono bg-muted rounded px-2 py-1 truncate">{pageUrl}</code>
                  <button onClick={() => copy(pageUrl)} className="rounded-md border border-border px-2 py-1 text-xs"><Copy className="size-3" /></button>
                  <a href={pageUrl} target="_blank" rel="noreferrer" className="rounded-md bg-primary text-primary-foreground px-2 py-1 text-xs">Abrir</a>
                </div>
              )}
              <Link to="/servers/$id" params={{ id: saved.serverId }} className="inline-block text-xs text-primary hover:underline">Configurar servidor →</Link>
            </div>
          )}
        </section>
      )}

      {/* Save dialog */}
      {showSave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !saving && setShowSave(false)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold inline-flex items-center gap-2"><Save className="size-4 text-primary" /> Salvar como API</h3>
              <button onClick={() => setShowSave(false)} disabled={saving}><X className="size-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button onClick={() => setMode("new")} className={`rounded-lg border p-3 text-left text-xs ${mode === "new" ? "border-primary bg-primary/10" : "border-border"}`}>
                <Plus className="size-4 text-primary mb-1" /><div className="font-semibold">Novo servidor</div>
                <div className="text-muted-foreground">Cria com {finalEndpoints?.length} endpoint(s)</div>
              </button>
              <button onClick={() => setMode("existing")} disabled={!servers.length}
                className={`rounded-lg border p-3 text-left text-xs disabled:opacity-40 ${mode === "existing" ? "border-primary bg-primary/10" : "border-border"}`}>
                <Terminal className="size-4 text-primary mb-1" /><div className="font-semibold">Existente</div>
                <div className="text-muted-foreground">{servers.length ? `Adiciona endpoints (${servers.length})` : "Nenhum"}</div>
              </button>
            </div>
            {mode === "existing" && (
              <select value={pickedServer} onChange={(e) => setPickedServer(e.target.value)} className={inputCls + " mb-3"}>
                {servers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.slug})</option>)}
              </select>
            )}
            <p className="text-[11px] text-muted-foreground mb-4">
              {finalEndpoints?.length} endpoint(s) serão criados{html ? " + página HTML pública" : ""}.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSave(false)} disabled={saving} className="rounded-lg border border-border px-4 py-2 text-sm">Cancelar</button>
              <button onClick={confirmSave} disabled={saving} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                {saving ? <><Loader2 className="size-3.5 animate-spin" /> Salvando…</> : <><CheckCircle2 className="size-3.5" /> Confirmar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function InstagramPreset() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ pageUrl: string; apiUrl: string } | null>(null);
  const [form, setForm] = useState({
    sessionid: "", csrftoken: "", ds_user_id: "", fb_dtsg: "",
    jazoest: "", lsd: "", av: "", datr: "", ig_did: "", mid: "", rur: "",
  });
  const seed = useServerFn(seedInstagramBot);

  const submit = async () => {
    if (!form.sessionid || !form.csrftoken || !form.fb_dtsg || !form.lsd) {
      toast.error("sessionid, csrftoken, fb_dtsg e lsd são obrigatórios"); return;
    }
    setBusy(true);
    try {
      const r = await seed({ data: form });
      const origin = window.location.origin;
      setResult({
        apiUrl: `${origin}/api/public/s/${r.serverSlug}`,
        pageUrl: `${origin}/api/public/p/${r.pageSlug}`,
      });
      toast.success("Bot criado!");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-pink-500/40 bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-cyan-500/10 p-4 text-left hover:from-pink-500/20 hover:to-cyan-500/20 transition">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600 grid place-items-center">
            <Instagram className="size-5 text-white" />
          </div>
          <div>
            <div className="font-semibold text-sm">⚡ Preset: Instagram Comment Bot</div>
            <div className="text-xs text-muted-foreground">Servidor + 2 endpoints + página 3D pública pronto em 1 clique</div>
          </div>
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold inline-flex items-center gap-2"><Instagram className="size-4 text-pink-500" /> Credenciais da sessão Instagram</h3>
              <button onClick={() => setOpen(false)} disabled={busy}><X className="size-4" /></button>
            </div>

            {!result ? (
              <>
                <p className="text-xs text-muted-foreground mb-4">
                  Cole os valores tirados das DevTools do Instagram (cookies + body do POST <code>/api/graphql</code>). Salvos só no seu servidor.
                </p>
                <div className="grid md:grid-cols-2 gap-3 text-sm">
                  {(["sessionid","csrftoken","ds_user_id","fb_dtsg","jazoest","lsd","av","datr","ig_did","mid"] as const).map((k) => (
                    <div key={k}>
                      <label className="text-xs font-mono">{k}{["sessionid","csrftoken","fb_dtsg","lsd"].includes(k) ? " *" : ""}</label>
                      <input value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                        className={inputCls + " font-mono text-xs mt-1"} />
                    </div>
                  ))}
                  <div className="md:col-span-2">
                    <label className="text-xs font-mono">rur</label>
                    <textarea value={form.rur} onChange={(e) => setForm({ ...form, rur: e.target.value })} rows={2}
                      className={inputCls + " font-mono text-xs mt-1"} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setOpen(false)} disabled={busy} className="rounded-lg border border-border px-4 py-2 text-sm">Cancelar</button>
                  <button onClick={submit} disabled={busy}
                    className="rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 text-white px-4 py-2 text-sm font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                    {busy ? <><Loader2 className="size-3.5 animate-spin" /> Criando…</> : <>🚀 Criar bot</>}
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
                  <div className="text-xs font-semibold text-emerald-400 mb-2 inline-flex items-center gap-1">
                    <CheckCircle2 className="size-3.5" /> Pronto! Tudo configurado.
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground mb-1">Site público 3D</div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-muted rounded px-2 py-1 truncate">{result.pageUrl}</code>
                        <button onClick={() => { navigator.clipboard.writeText(result.pageUrl); toast.success("Copiado"); }}
                          className="rounded border border-border px-2 py-1 text-xs"><Copy className="size-3" /></button>
                        <a href={result.pageUrl} target="_blank" rel="noreferrer"
                          className="rounded bg-primary text-primary-foreground px-3 py-1 text-xs">Abrir</a>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground mb-1">API REST</div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-muted rounded px-2 py-1 truncate">{result.apiUrl}</code>
                        <button onClick={() => { navigator.clipboard.writeText(result.apiUrl); toast.success("Copiado"); }}
                          className="rounded border border-border px-2 py-1 text-xs"><Copy className="size-3" /></button>
                      </div>
                    </div>
                  </div>
                </div>
                <button onClick={() => { setResult(null); setOpen(false); }} className="w-full rounded-lg border border-border px-4 py-2 text-sm">Fechar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
