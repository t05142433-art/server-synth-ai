import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bot, CheckCircle2, KeyRound, Loader2, Save, SlidersHorizontal, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

const inputCls = "w-full rounded-lg bg-input border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [masked, setMasked] = useState("");
  const [form, setForm] = useState({
    mode: "auto",
    model: "google/gemini-3-flash-preview",
    base_url: "https://api.openai.com/v1",
    api_key: "",
    temperature: 0.2,
    max_rounds: 2,
    clear_api_key: false,
  });

  const authHeaders = async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  };

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/ai/settings", { headers: await authHeaders() });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        setMasked(data.api_key_masked || "");
        setForm((f) => ({
          ...f,
          mode: data.mode || "auto",
          model: data.model || f.model,
          base_url: data.base_url || f.base_url,
          temperature: data.temperature ?? 0.2,
          max_rounds: data.max_rounds ?? 2,
        }));
      } catch (e: any) {
        toast.error(e.message || "Falha ao carregar perfil");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(form),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setMasked(form.api_key ? `${form.api_key.slice(0, 4)}••••••${form.api_key.slice(-4)}` : form.clear_api_key ? "" : masked);
      setForm((f) => ({ ...f, api_key: "", clear_api_key: false }));
      toast.success("Configuração de IA salva!");
    } catch (e: any) {
      toast.error(e.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="container mx-auto px-6 py-10 text-muted-foreground">Carregando...</main>;

  return (
    <main className="container mx-auto px-6 py-8 max-w-4xl">
      <div className="mb-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground mb-3">
          <Bot className="size-3.5 text-primary" /> Perfil de IA
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Configuração da IA</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Use o modo automático por padrão. Se o provedor automático retornar quota, crédito ou indisponibilidade, configure uma API compatível com OpenAI para continuar gerando servidores.
        </p>
      </div>

      <section className="grid md:grid-cols-2 gap-4 mb-6">
        <button onClick={() => setForm({ ...form, mode: "auto" })} className={`rounded-xl border p-5 text-left transition ${form.mode === "auto" ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted/30"}`}>
          <Zap className="size-5 text-primary mb-3" />
          <div className="font-semibold">Automática Lovable AI</div>
          <div className="text-xs text-muted-foreground mt-1">Usa o gateway padrão e, se falhar, o sistema cria um plano local para não travar.</div>
        </button>
        <button onClick={() => setForm({ ...form, mode: "manual" })} className={`rounded-xl border p-5 text-left transition ${form.mode === "manual" ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted/30"}`}>
          <KeyRound className="size-5 text-primary mb-3" />
          <div className="font-semibold">Manual OpenAI-compatible</div>
          <div className="text-xs text-muted-foreground mt-1">Informe Base URL, modelo e sua API Key para usar outro provedor quando quiser.</div>
        </button>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="size-4 text-primary" /> Parâmetros</div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium">Modelo</label>
            <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className={inputCls + " mt-1 font-mono text-xs"} />
          </div>
          <div>
            <label className="text-xs font-medium">Rodadas de fallback</label>
            <input type="number" min={1} max={4} value={form.max_rounds} onChange={(e) => setForm({ ...form, max_rounds: Number(e.target.value) })} className={inputCls + " mt-1"} />
          </div>
          <div>
            <label className="text-xs font-medium">Temperatura</label>
            <input type="number" min={0} max={2} step={0.1} value={form.temperature} onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })} className={inputCls + " mt-1"} />
          </div>
          <div>
            <label className="text-xs font-medium">Chave salva</label>
            <div className="mt-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-mono text-muted-foreground">{masked || "nenhuma chave manual"}</div>
          </div>
        </div>

        {form.mode === "manual" && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div>
              <label className="text-xs font-medium">Base URL</label>
              <input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="https://api.openai.com/v1" className={inputCls + " mt-1 font-mono text-xs"} />
            </div>
            <div>
              <label className="text-xs font-medium">Nova API Key</label>
              <input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value, clear_api_key: false })} placeholder="Cole uma nova chave para substituir" className={inputCls + " mt-1 font-mono text-xs"} />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={form.clear_api_key} onChange={(e) => setForm({ ...form, clear_api_key: e.target.checked, api_key: e.target.checked ? "" : form.api_key })} />
              Apagar chave manual salva
            </label>
          </div>
        )}

        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground flex items-start gap-2">
          <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
          Mesmo sem resposta da IA, a aba cURL agora cai para um parser local e consegue montar servidor, endpoints e uma página 3D simples para você salvar e editar.
        </div>

        <div className="flex justify-end">
          <button onClick={save} disabled={saving} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <><Loader2 className="size-4 animate-spin" /> Salvando…</> : <><Save className="size-4" /> Salvar configuração</>}
          </button>
        </div>
      </section>
    </main>
  );
}