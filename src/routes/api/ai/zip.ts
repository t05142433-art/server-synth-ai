import { createFileRoute } from "@tanstack/react-router";
import JSZip from "jszip";

const TEXT_EXTS = new Set([
  "ts","tsx","js","jsx","mjs","cjs","json","md","txt","html","htm","css","scss","sass","less",
  "py","rb","go","rs","java","kt","swift","c","cc","cpp","h","hpp","cs","php","sh","bash","zsh",
  "yml","yaml","toml","ini","env","sql","graphql","gql","vue","svelte","astro","xml","csv",
  "lua","r","ex","exs","dart","clj","cljs","elm","fs","fsx","groovy","pl","pm","tcl","dockerfile","gitignore"
]);
const MAX_FILE = 200_000; // 200KB per text file fed to AI

function extOf(name: string) {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m?.[1] ?? "";
}

async function callAi(messages: any[]) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, response_format: { type: "json_object" } }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return JSON.parse(data?.choices?.[0]?.message?.content || "{}");
}

export const Route = createFileRoute("/api/ai/zip")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization");
          if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

          const { filename, zipBase64, prompt } = await request.json();
          if (!zipBase64 || !prompt) return Response.json({ error: "Missing zip or prompt" }, { status: 400 });
          if (zipBase64.length > 7_500_000) return Response.json({ error: "ZIP too large (max ~5MB)" }, { status: 400 });

          const zipBytes = Uint8Array.from(atob(zipBase64), (c) => c.charCodeAt(0));
          const zip = await JSZip.loadAsync(zipBytes);

          // Collect text files
          const textFiles: { path: string; content: string }[] = [];
          const binaryPaths: string[] = [];
          const entries = Object.values(zip.files).filter((f) => !f.dir);
          for (const f of entries) {
            const ext = extOf(f.name);
            if (TEXT_EXTS.has(ext) || /\/(?:Dockerfile|Makefile|README)$/i.test(f.name) || ["dockerfile","makefile","readme","license","gitignore"].includes(f.name.toLowerCase().split("/").pop()!)) {
              const content = await f.async("string");
              if (content.length <= MAX_FILE) textFiles.push({ path: f.name, content });
              else binaryPaths.push(f.name);
            } else {
              binaryPaths.push(f.name);
            }
          }

          if (textFiles.length === 0) return Response.json({ error: "Nenhum arquivo de texto editável encontrado no ZIP" }, { status: 400 });

          // Build manifest for AI
          const manifest = textFiles.map((f) => ({ path: f.path, content: f.content }));

          const sys = `You are an expert code editor. The user provides a ZIP project as JSON manifest of files. Apply ONLY the user's requested change. Do not remove or rewrite unrelated code. Preserve formatting where possible.

Return STRICT JSON:
{
  "summary": "<2-4 sentence summary in Portuguese describing what changed>",
  "files": [ { "path": "<original path>", "content": "<full new file content>" }, ... ]
}

Only include files you actually changed. Use the exact original path. If you cannot make safe changes, return files: [] and explain in summary.`;

          const userMsg = `User instructions:\n${prompt}\n\nProject files (JSON):\n${JSON.stringify(manifest)}`;
          const aiResult = await callAi([
            { role: "system", content: sys },
            { role: "user", content: userMsg },
          ]);

          const changed: { path: string; content: string }[] = Array.isArray(aiResult.files) ? aiResult.files : [];
          const summary: string = aiResult.summary || "Concluído.";

          // Apply changes
          for (const c of changed) {
            if (typeof c.path === "string" && typeof c.content === "string") {
              zip.file(c.path, c.content);
            }
          }

          const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
          // base64 encode
          let bin = "";
          for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]);
          const b64 = btoa(bin);

          const baseName = (filename || "project.zip").replace(/\.zip$/i, "");
          return Response.json({
            zipBase64: b64,
            filename: `${baseName}-modified.zip`,
            summary: `${summary}\n\nArquivos alterados: ${changed.length}/${textFiles.length} editáveis. Binários preservados: ${binaryPaths.length}.`,
          });
        } catch (e: any) {
          return Response.json({ error: e.message || "Falha" }, { status: 500 });
        }
      },
    },
  },
});