import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/dashboard" } });
        if (error) throw error;
        toast.success("Conta criada! Entrando...");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message || "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/dashboard" });
    if (result.error) {
      toast.error("Falha no login Google");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background px-6">
      <div className="w-full max-w-md">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Voltar</Link>
        <div className="mt-6 rounded-2xl border border-border bg-card p-8" style={{ boxShadow: "var(--shadow-glow)" }}>
          <h1 className="text-2xl font-bold">{mode === "signin" ? "Entrar" : "Criar conta"}</h1>
          <p className="text-sm text-muted-foreground mt-1">Endpointly · seus servidores na nuvem</p>

          <button onClick={handleGoogle} disabled={loading} className="mt-6 w-full rounded-lg border border-border bg-secondary hover:bg-muted py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition">
            <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.1 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.4l-6.5-5.5c-2 1.5-4.6 2.4-7.5 2.4-5.3 0-9.7-3.5-11.3-8.4l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.5 5.5C41.7 36 44 30.5 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            Continuar com Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border" /> ou <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg bg-input border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            <input type="password" required placeholder="Senha (mín. 6)" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg bg-input border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">
              {loading ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
            </button>
          </form>

          <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="mt-4 text-sm text-muted-foreground hover:text-foreground w-full text-center">
            {mode === "signin" ? "Não tem conta? Criar" : "Já tem conta? Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}