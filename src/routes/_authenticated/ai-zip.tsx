import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Sparkles, Download, FileArchive } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ai-zip")({
  component: AiZip,
});

function AiZip() {
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; filename: string; summary: string } | null>(null);

  const submit = async () => {
    if (!file || !prompt.trim()) { toast.error("Envie o ZIP e descreva a alteração"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("ZIP máximo 5MB"); return; }
    setBusy(true); setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch("/api/ai/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.session?.access_token}` },
        body: JSON.stringify({ filename: file.name, zipBase64: b64, prompt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha");
      const bin = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bin], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      setResult({ url, filename: json.filename, summary: json.summary });
      toast.success("ZIP processado!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container mx-auto px-6 py-10 max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Modo IA · ZIP</h1>
      <p className="text-muted-foreground mt-1">Envie um ZIP de código + descreva a alteração. A IA edita os arquivos de texto e devolve o ZIP modificado.</p>

      <div className="mt-8 space-y-4">
        <label className="block rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center cursor-pointer hover:border-primary/50 transition">
          <input type="file" accept=".zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
          {file ? (
            <div className="flex items-center justify-center gap-3"><FileArchive className="size-6 text-primary" /><span className="font-medium">{file.name}</span><span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)}KB</span></div>
          ) : (
            <div className="text-muted-foreground"><Upload className="size-8 mx-auto mb-2" /><div>Clique para enviar um arquivo .zip (máx 5MB)</div></div>
          )}
        </label>

        <div>
          <label className="block text-sm font-medium mb-1.5">Prompt</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} placeholder="Ex.: Adicione tratamento de erro nas funções fetch e troque o endpoint para https://api.novo.com" className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>

        <button onClick={submit} disabled={busy} className="rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold flex items-center gap-2 hover:opacity-90 disabled:opacity-50">
          <Sparkles className="size-4" /> {busy ? "Processando com IA..." : "Processar ZIP"}
        </button>

        {result && (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-3">
            <p className="text-sm whitespace-pre-wrap">{result.summary}</p>
            <a href={result.url} download={result.filename} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold">
              <Download className="size-4" /> Baixar {result.filename}
            </a>
          </div>
        )}
      </div>
    </main>
  );
}