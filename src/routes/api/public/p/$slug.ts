import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/p/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { data, error } = await supabaseAdmin.from("pages").select("html,title").eq("slug", params.slug).maybeSingle();
        if (error || !data) return new Response("Página não encontrada", { status: 404 });
        return new Response(data.html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
        });
      },
    },
  },
});
