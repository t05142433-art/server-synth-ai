import { createFileRoute, Outlet, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, LayoutDashboard, Sparkles, Terminal, UserCog } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate({ to: "/login" });
      else setEmail(session.user.email ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/login" });
      else { setEmail(data.session.user.email ?? null); setReady(true); }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  if (!ready) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando...</div>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-[image:var(--gradient-hero)] grid place-items-center font-bold text-primary-foreground text-sm">E</div>
            <span className="font-semibold tracking-tight">Endpointly</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link to="/dashboard" className="px-3 py-1.5 rounded-md hover:bg-muted flex items-center gap-2" activeProps={{ className: "px-3 py-1.5 rounded-md bg-muted flex items-center gap-2" }}>
              <LayoutDashboard className="size-4" /> Servidores
            </Link>
            <Link to="/ai-zip" className="px-3 py-1.5 rounded-md hover:bg-muted flex items-center gap-2" activeProps={{ className: "px-3 py-1.5 rounded-md bg-muted flex items-center gap-2" }}>
              <Sparkles className="size-4" /> Modo IA ZIP
            </Link>
            <Link to="/curl-tester" className="px-3 py-1.5 rounded-md hover:bg-muted flex items-center gap-2" activeProps={{ className: "px-3 py-1.5 rounded-md bg-muted flex items-center gap-2" }}>
              <Terminal className="size-4" /> cURL
            </Link>
            <Link to="/profile" className="px-3 py-1.5 rounded-md hover:bg-muted flex items-center gap-2" activeProps={{ className: "px-3 py-1.5 rounded-md bg-muted flex items-center gap-2" }}>
              <UserCog className="size-4" /> Perfil
            </Link>
            <span className="text-xs text-muted-foreground mx-3 hidden md:inline">{email}</span>
            <button onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/login" }); }} className="px-3 py-1.5 rounded-md hover:bg-muted flex items-center gap-2 text-muted-foreground" title="Sair">
              <LogOut className="size-4" />
            </button>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}