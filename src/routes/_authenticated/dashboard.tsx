import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Server, Activity, Copy, ExternalLink, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type ServerRow = {
  id: string; slug: string; name: string; description: string | null;
  logo_url: string | null; method: string; enabled: boolean; created_at: string;
};

function Dashboard() {
  const navigate = useNavigate();
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("servers").select("id,slug,name,description,logo_url,method,enabled,created_at").order("created_at", { ascending: false });
    if (error) toast.error(error.message); else setServers((data ?? []) as ServerRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    const slug = Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("servers").insert({
      name: name.trim(), slug, user_id: u.user!.id, method: "GET", target_url: "",
    }).select().single();
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Servidor criado!");
    setName(""); setShowForm(false);
    navigate({ to: "/servers/$id", params: { id: data.id } });
  };

  const aiCreateMany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch("/api/ai/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.session?.access_token}` },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha na IA");
      const endpoints: any[] = json.endpoints ?? [];
      if (endpoints.length === 0) throw new Error("Nenhum endpoint extraído");

      const { data: u } = await supabase.auth.getUser();
      const slug = Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
      const { data: srv, error: srvErr } = await supabase.from("servers").insert({
        user_id: u.user!.id,
        slug,
        name: json.server?.name || "Servidor IA",
        description: json.server?.description || null,
        method: "POST",
        target_url: "",
        variables: json.variables || {},
        ai_prompt: aiPrompt,
      }).select().single();
      if (srvErr) throw new Error(srvErr.message);

      const rows = endpoints.map((ep, i) => ({
        server_id: srv.id,
        user_id: u.user!.id,
        action_key: ep.action_key ?? null,
        name: ep.name || `Endpoint ${i + 1}`,
        description: ep.description || null,
        method: ep.method || "GET",
        target_url: ep.target_url || "",
        headers: ep.headers || {},
        body_template: ep.body_template ?? null,
        forward_query: ep.forward_query !== false,
        forward_body: ep.forward_body !== false,
        extract_token_path: ep.extract_token_path ?? null,
        extract_token_var: ep.extract_token_var ?? null,
        extract_token_prefix: ep.extract_token_prefix ?? null,
        sort_order: i,
      }));
      const { error: epErr } = await supabase.from("endpoints").insert(rows);
      if (epErr) throw new Error(epErr.message);
      toast.success(`Servidor criado com ${rows.length} endpoint(s)!`);
      setAiPrompt(""); setAiOpen(false);
      navigate({ to: "/servers/$id", params: { id: srv.id } });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <main className="container mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Seus servidores</h1>
          <p className="text-muted-foreground mt-1">Endpoints públicos prontos para usar.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setAiOpen((v) => !v)} className="rounded-lg border border-primary/40 bg-primary/10 text-primary px-4 py-2 text-sm font-semibold flex items-center gap-2 hover:bg-primary/20 transition">
            <Sparkles className="size-4" /> Criar com IA
          </button>
          <button onClick={() => setShowForm(true)} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition" style={{ boxShadow: "var(--shadow-glow)" }}>
            <Plus className="size-4" /> Novo servidor
          </button>
        </div>
      </div>

      {aiOpen && (
        <form onSubmit={aiCreateMany} className="mb-6 rounded-xl border border-primary/30 bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" /> Modo IA — descreva 1 ou vários endpoints
          </div>
          <textarea
            autoFocus
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder={`Ex: Crie 3 endpoints na API SevenTV:\n1) POST https://seventvpainel.top/api/auth/login\n2) POST https://seventvpainel.top/api/customers (criar cliente)\n3) DELETE https://seventvpainel.top/api/customers/:id\nUse Authorization Bearer 222507|... e os headers de navegador.`}
            rows={8}
            className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="flex gap-2">
            <button disabled={aiBusy} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
              {aiBusy ? <><Loader2 className="size-4 animate-spin" /> Gerando...</> : <><Sparkles className="size-4" /> Gerar e criar</>}
            </button>
            <button type="button" onClick={() => setAiOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancelar</button>
          </div>
          <p className="text-xs text-muted-foreground">A IA cria 1 servidor por rota detectada. Você pode editar cada um depois.</p>
        </form>
      )}

      {showForm && (
        <form onSubmit={create} className="mb-6 rounded-xl border border-border bg-card p-4 flex gap-3">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do servidor (ex: Auth Proxy)" className="flex-1 rounded-lg bg-input border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          <button disabled={creating} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50">{creating ? "Criando..." : "Criar"}</button>
          <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancelar</button>
        </form>
      )}

      {loading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : servers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <Server className="size-10 mx-auto text-muted-foreground" />
          <h3 className="mt-4 font-semibold">Nenhum servidor ainda</h3>
          <p className="text-sm text-muted-foreground mt-1">Crie seu primeiro endpoint público.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers.map((s) => {
            const url = `${typeof window !== "undefined" ? window.location.origin : ""}/api/public/s/${s.slug}`;
            return (
              <div key={s.id} className="rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition group">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {s.logo_url ? (
                      <img src={s.logo_url} alt={s.name} className="size-10 rounded-lg object-cover" />
                    ) : (
                      <div className="size-10 rounded-lg bg-muted grid place-items-center text-lg font-bold text-primary">{s.name[0]?.toUpperCase()}</div>
                    )}
                    <div>
                      <h3 className="font-semibold leading-tight">{s.name}</h3>
                      <span className="text-xs text-muted-foreground">{s.method} · {s.enabled ? "ativo" : "pausado"}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted px-2 py-1.5 text-xs font-mono text-muted-foreground">
                  <span className="truncate">/api/public/s/{s.slug}</span>
                  <button onClick={() => { navigator.clipboard.writeText(url); toast.success("Link copiado!"); }} className="ml-auto p-1 hover:text-foreground"><Copy className="size-3.5" /></button>
                  <a href={url} target="_blank" rel="noreferrer" className="p-1 hover:text-foreground"><ExternalLink className="size-3.5" /></a>
                </div>
                <div className="mt-4 flex gap-2">
                  <Link to="/servers/$id" params={{ id: s.id }} className="flex-1 text-center rounded-lg bg-secondary hover:bg-muted px-3 py-2 text-sm font-medium transition">Configurar</Link>
                  <Link to="/serverlogs/$id" params={{ id: s.id }} className="rounded-lg border border-border hover:bg-muted px-3 py-2 text-sm flex items-center gap-1"><Activity className="size-3.5" /> Logs</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}