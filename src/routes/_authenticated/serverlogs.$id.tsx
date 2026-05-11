import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/serverlogs/$id")({
  component: LogsPage,
});

type Log = {
  id: string; method: string | null; path: string | null; status: number | null;
  duration_ms: number | null; ip: string | null; created_at: string;
  request_body: string | null; response_body: string | null;
};

function LogsPage() {
  const { id } = Route.useParams();
  const [logs, setLogs] = useState<Log[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("request_logs").select("*").eq("server_id", id).order("created_at", { ascending: false }).limit(100);
    setLogs((data ?? []) as Log[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [id]);

  return (
    <main className="container mx-auto px-6 py-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <Link to="/servers/$id" params={{ id }} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="size-4" /> Configuração</Link>
        <button onClick={load} className="rounded-lg border border-border px-3 py-1.5 text-sm flex items-center gap-1 hover:bg-muted"><RefreshCw className="size-4" /> Atualizar</button>
      </div>
      <h1 className="text-2xl font-bold mb-4">Logs de requisições</h1>
      {loading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">Nenhuma requisição ainda. Faça uma chamada ao endpoint público.</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-[80px_60px_1fr_80px_120px_80px] gap-2 px-4 py-2 text-xs font-medium border-b border-border bg-muted/30">
            <div>Método</div><div>Status</div><div>IP</div><div>Tempo</div><div>Quando</div><div></div>
          </div>
          {logs.map((l) => (
            <div key={l.id} className="border-b border-border last:border-0">
              <div className="grid grid-cols-[80px_60px_1fr_80px_120px_80px] gap-2 px-4 py-2.5 text-sm items-center">
                <div className="font-mono text-xs">{l.method}</div>
                <div className={`font-mono text-xs ${(l.status ?? 0) < 400 ? "text-primary" : "text-destructive"}`}>{l.status}</div>
                <div className="font-mono text-xs text-muted-foreground truncate">{l.ip}</div>
                <div className="text-xs text-muted-foreground">{l.duration_ms}ms</div>
                <div className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleTimeString()}</div>
                <button onClick={() => setOpen(open === l.id ? null : l.id)} className="text-xs text-primary hover:underline">{open === l.id ? "Fechar" : "Ver"}</button>
              </div>
              {open === l.id && (
                <div className="px-4 py-3 bg-muted/30 grid md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="font-semibold mb-1">Request body</div>
                    <pre className="rounded bg-background p-2 overflow-auto max-h-48 whitespace-pre-wrap">{l.request_body || "(vazio)"}</pre>
                  </div>
                  <div>
                    <div className="font-semibold mb-1">Response body</div>
                    <pre className="rounded bg-background p-2 overflow-auto max-h-48 whitespace-pre-wrap">{l.response_body || "(vazio)"}</pre>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}