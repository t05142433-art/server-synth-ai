import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Zap, Shield, Bot, Globe, Sparkles, FileArchive } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="container mx-auto flex items-center justify-between py-6 px-6">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-xl bg-[image:var(--gradient-hero)] grid place-items-center font-bold text-primary-foreground">E</div>
          <span className="font-semibold tracking-tight text-lg">Endpointly</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition">Entrar</Link>
          <Link to="/login" className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition" style={{ boxShadow: "var(--shadow-glow)" }}>Começar grátis</Link>
        </nav>
      </header>

      <section className="container mx-auto px-6 pt-16 pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground mb-6">
          <Sparkles className="size-3" /> Modo IA + Proxy real para qualquer API
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight max-w-4xl mx-auto leading-[1.05]">
          Crie servidores de API <span className="bg-clip-text text-transparent bg-[image:var(--gradient-hero)]">em segundos</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Crie um endpoint, configure método, headers e URL alvo, copie o link público e use no seu bot, site ou integração.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Link to="/login" className="rounded-lg bg-primary text-primary-foreground px-6 py-3 font-medium hover:opacity-90 transition" style={{ boxShadow: "var(--shadow-glow)" }}>Criar meu primeiro servidor</Link>
          <a href="#features" className="rounded-lg border border-border px-6 py-3 font-medium hover:bg-card transition">Ver recursos</a>
        </div>
      </section>

      <section id="features" className="container mx-auto px-6 pb-24 grid md:grid-cols-3 gap-4">
        {[
          { icon: Globe, title: "Endpoint público", desc: "URL única tipo /api/public/s/abc — chame de qualquer lugar via GET, POST, PUT, DELETE." },
          { icon: Shield, title: "Auth + Rate limit", desc: "Exija API key, limite requisições por minuto e proteja contra abuso." },
          { icon: Zap, title: "Proxy real", desc: "Encaminha sua chamada para qualquer URL alvo com headers e body customizados." },
          { icon: Bot, title: "Login Google", desc: "Entre com Google ou email/senha. Seus servidores ficam salvos." },
          { icon: Sparkles, title: "Modo IA", desc: "Descreva em linguagem natural e a IA configura seu servidor pra você." },
          { icon: FileArchive, title: "ZIP + IA", desc: "Envie um ZIP com código + prompt. A IA edita e devolve o ZIP modificado." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-border bg-card p-6 hover:border-primary/50 transition">
            <f.icon className="size-6 text-primary" />
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
