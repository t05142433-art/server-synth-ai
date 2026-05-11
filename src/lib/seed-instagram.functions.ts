import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const slugify = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);

const COOKIE_STR =
  'datr={{DATR}}; ig_did={{IG_DID}}; ps_l=1; ps_n=1; mid={{MID}}; ig_nrcb=1; csrftoken={{CSRFTOKEN}}; ds_user_id={{DS_USER_ID}}; dpr=2.20; wd=489x920; sessionid={{SESSIONID}}; rur={{RUR}}';

const POST_HEADERS = {
  "x-csrftoken": "{{CSRFTOKEN}}",
  "x-fb-lsd": "{{LSD}}",
  "x-ig-app-id": "1217981644879628",
  "x-ig-max-touch-points": "5",
  "x-asbd-id": "359341",
  "x-fb-friendly-name": "PolarisPostCommentInputRevampedMutation",
  "sec-ch-ua": '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": '"Android"',
  "sec-ch-ua-model": '"SM-A155M"',
  "sec-ch-ua-platform-version": '"16.0.0"',
  "sec-ch-ua-full-version-list":
    '"Google Chrome";v="147.0.7727.138", "Not.A/Brand";v="8.0.0.0", "Chromium";v="147.0.7727.138"',
  "sec-ch-prefers-color-scheme": "light",
  "user-agent":
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
  "content-type": "application/x-www-form-urlencoded",
  accept: "*/*",
  origin: "https://www.instagram.com",
  "sec-fetch-site": "same-origin",
  "sec-fetch-mode": "cors",
  "sec-fetch-dest": "empty",
  referer: "https://www.instagram.com/p/{{SHORTCODE}}/comments/",
  "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "accept-encoding": "identity",
  cookie: COOKIE_STR,
  priority: "u=1, i",
};

const GET_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "accept-encoding": "identity",
  "sec-ch-ua": '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": '"Android"',
  "sec-fetch-site": "none",
  "sec-fetch-mode": "navigate",
  "sec-fetch-dest": "document",
  cookie: COOKIE_STR,
};

const POST_BODY = [
  "av={{AV}}",
  "__d=www",
  "__user=0",
  "__a=1",
  "__req=2x",
  "__hs=20583.HYP%3Ainstagram_web_pkg.2.1...0",
  "dpr=3",
  "__ccg=EXCELLENT",
  "__rev=1039188831",
  "__s=99u1du%3A1yvvug%3Acgmcnq",
  "__hsi=7638253056136698762",
  "__comet_req=7",
  "fb_dtsg={{FB_DTSG_ENC}}",
  "jazoest={{JAZOEST}}",
  "lsd={{LSD}}",
  "__spin_r=1039188831",
  "__spin_b=trunk",
  "__spin_t=1778419375",
  "__crn=comet.igweb.PolarisMobileAllCommentsRouteNext",
  "fb_api_caller_class=RelayModern",
  "fb_api_req_friendly_name=PolarisPostCommentInputRevampedMutation",
  "server_timestamps=true",
  'variables=%7B%22connections%22%3A%5B%22client%3Aroot%3A__PolarisPostComments__xdt_api__v1__media__media_id__comments__connection_connection(data%3A%7B%7D%2Cmedia_id%3A%5C%22{{MEDIA_ID}}%5C%22%2Csort_order%3A%5C%22popular%5C%22)%22%5D%2C%22data%22%3A%7B%22comment_text%22%3A%22{{COMMENT_TEXT}}%22%2C%22media_id%22%3A%22{{MEDIA_ID}}%22%7D%7D',
  "doc_id=26986625270944666",
].join("&");

function build3DHtml(slug: string) {
  return `<!doctype html><html lang="pt-br"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Instagram Comment Bot 3D</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body{background:#05060d;color:#e7ecff;font-family:ui-sans-serif,system-ui;overflow-x:hidden}
  .scene{perspective:1400px}
  .card3d{transform-style:preserve-3d;transition:transform .25s ease-out;background:linear-gradient(135deg,rgba(99,102,241,.18),rgba(34,211,238,.10));backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.10);box-shadow:0 40px 100px -30px rgba(99,102,241,.55),0 0 0 1px rgba(255,255,255,.04) inset}
  .gradient-text{background:linear-gradient(135deg,#a78bfa,#22d3ee,#f472b6);-webkit-background-clip:text;background-clip:text;color:transparent}
  .glow{box-shadow:0 0 40px rgba(167,139,250,.45),0 0 80px rgba(34,211,238,.20)}
  .blob{position:absolute;border-radius:50%;filter:blur(80px);opacity:.55;animation:float 12s ease-in-out infinite}
  @keyframes float{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(40px,-30px) scale(1.15)}}
  .term{background:#000;border:1px solid #222;border-radius:14px;font-family:ui-monospace,Menlo,monospace}
  .ok{color:#34d399}.err{color:#f87171}.warn{color:#fbbf24}.info{color:#a5b4fc}
  input,textarea{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10);color:#fff}
  input:focus,textarea:focus{outline:none;border-color:#a78bfa;box-shadow:0 0 0 3px rgba(167,139,250,.25)}
  .btn-primary{background:linear-gradient(135deg,#7c3aed,#06b6d4);transition:transform .15s}
  .btn-primary:hover{transform:translateY(-2px) scale(1.02)}
  .stat{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px}
</style></head><body class="min-h-screen relative">
<div class="blob" style="background:#7c3aed;width:480px;height:480px;top:-120px;left:-120px"></div>
<div class="blob" style="background:#06b6d4;width:520px;height:520px;bottom:-160px;right:-160px;animation-delay:-4s"></div>
<div class="blob" style="background:#ec4899;width:380px;height:380px;top:40%;right:20%;animation-delay:-8s"></div>

<main class="relative z-10 max-w-3xl mx-auto px-5 py-10 scene">
  <header class="text-center mb-8">
    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs mb-4">
      <span class="size-2 rounded-full bg-emerald-400 animate-pulse"></span> API ativa
    </div>
    <h1 class="text-5xl md:text-6xl font-black gradient-text leading-tight">Comment Bot</h1>
    <p class="text-white/60 mt-3">Cole o link do reel, escreva o comentário, defina a quantidade. A IA dispara.</p>
  </header>

  <section id="card" class="card3d rounded-3xl p-6 md:p-8">
    <label class="text-xs font-semibold text-white/70">Link do Reel/Post</label>
    <input id="link" type="url" placeholder="https://www.instagram.com/reel/DYIoDNPE9Bk/..."
      class="mt-2 w-full rounded-xl px-4 py-3 text-sm font-mono"/>

    <div class="grid md:grid-cols-3 gap-4 mt-5">
      <div class="md:col-span-2">
        <label class="text-xs font-semibold text-white/70">Comentário</label>
        <textarea id="comment" rows="3" placeholder="Oiee 🔥"
          class="mt-2 w-full rounded-xl px-4 py-3 text-sm"></textarea>
      </div>
      <div>
        <label class="text-xs font-semibold text-white/70">Quantidade</label>
        <input id="qty" type="number" min="1" max="500" value="5"
          class="mt-2 w-full rounded-xl px-4 py-3 text-sm"/>
        <label class="text-xs font-semibold text-white/70 mt-3 block">Delay (ms)</label>
        <input id="delay" type="number" min="0" max="60000" value="1500"
          class="mt-2 w-full rounded-xl px-4 py-3 text-sm"/>
      </div>
    </div>

    <button id="fire" class="mt-6 w-full btn-primary text-white font-bold py-4 rounded-xl glow">
      🚀 Disparar comentários
    </button>

    <div id="stats" class="grid grid-cols-3 gap-3 mt-5 hidden">
      <div class="stat p-3 text-center"><div class="text-xs text-white/50">Enviados</div><div id="s-sent" class="text-2xl font-bold gradient-text">0</div></div>
      <div class="stat p-3 text-center"><div class="text-xs text-white/50">Sucesso</div><div id="s-ok" class="text-2xl font-bold text-emerald-400">0</div></div>
      <div class="stat p-3 text-center"><div class="text-xs text-white/50">Falhas</div><div id="s-err" class="text-2xl font-bold text-red-400">0</div></div>
    </div>

    <div id="term" class="term mt-5 p-4 text-xs h-72 overflow-auto hidden"></div>
  </section>

  <p class="text-center text-xs text-white/30 mt-8">⚡ Powered by Lovable AI</p>
</main>

<script>
const API = location.origin + "/api/public/s/${slug}";
const $ = (id)=>document.getElementById(id);
const card = $("card");

document.addEventListener("mousemove",(e)=>{
  const r = card.getBoundingClientRect();
  const x = ((e.clientX - r.left)/r.width - .5)*2;
  const y = ((e.clientY - r.top)/r.height - .5)*2;
  card.style.transform = \`rotateY(\${x*6}deg) rotateX(\${-y*6}deg)\`;
});

const term = $("term");
function log(msg, cls="info"){
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = "› " + msg;
  term.appendChild(d); term.scrollTop = term.scrollHeight;
}

function extractShortcode(url){
  const m = String(url).match(/\\/(?:p|reel|tv)\\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

let sent=0, ok=0, err=0;
function bump(){ $("s-sent").textContent=sent; $("s-ok").textContent=ok; $("s-err").textContent=err; }

$("fire").addEventListener("click", async ()=>{
  const link = $("link").value.trim();
  const comment = $("comment").value.trim();
  const qty = Math.max(1, Math.min(500, parseInt($("qty").value,10)||1));
  const delay = Math.max(0, parseInt($("delay").value,10)||0);
  if(!link || !comment){ alert("Preencha link e comentário"); return; }
  const shortcode = extractShortcode(link);
  if(!shortcode){ alert("Link inválido"); return; }

  $("stats").classList.remove("hidden");
  $("term").classList.remove("hidden");
  sent=ok=err=0; bump(); term.innerHTML="";
  $("fire").disabled = true; $("fire").textContent = "⏳ Disparando...";

  log("Extraindo media_id de " + shortcode + "…", "info");
  let mediaId = null;
  try{
    const r = await fetch(API, { method:"POST", headers:{"content-type":"application/json"},
      body: JSON.stringify({ action:"extract_id", shortcode }) });
    const txt = await r.text();
    const m = txt.match(/instagram:\\/\\/media\\?id=(\\d+)/) || txt.match(/"media_id"\\s*:\\s*"(\\d+)"/) || txt.match(/"media_id":(\\d+)/);
    if(!m) throw new Error("regex sem match (HTTP " + r.status + ")");
    mediaId = m[1];
    log("media_id = " + mediaId, "ok");
  }catch(e){ log("Falha ao extrair: " + e.message, "err"); $("fire").disabled=false; $("fire").textContent="🚀 Disparar comentários"; return; }

  for(let i=1;i<=qty;i++){
    sent++; bump();
    log("[" + i + "/" + qty + "] enviando…", "info");
    try{
      const r = await fetch(API, { method:"POST", headers:{"content-type":"application/json"},
        body: JSON.stringify({ action:"post_comment", shortcode, media_id: mediaId,
          comment_text: encodeURIComponent(comment) }) });
      const txt = await r.text();
      if(r.ok && txt.includes("xig_comment_create")){ ok++; log("  ✓ OK", "ok"); }
      else { err++; log("  ✗ HTTP " + r.status + " " + txt.slice(0,180), "err"); }
    }catch(e){ err++; log("  ✗ " + e.message, "err"); }
    bump();
    if(i<qty) await new Promise(r=>setTimeout(r, delay));
  }
  log("Concluído: " + ok + " sucesso / " + err + " falha", ok>err?"ok":"warn");
  $("fire").disabled = false; $("fire").textContent = "🚀 Disparar comentários";
});
</script>
</body></html>`;
}

export const seedInstagramBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      sessionid: string;
      csrftoken: string;
      ds_user_id: string;
      fb_dtsg: string;
      jazoest: string;
      lsd: string;
      av: string;
      datr?: string;
      ig_did?: string;
      mid?: string;
      rur?: string;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const slug = slugify();
    const pageSlug = slugify();

    const variables: Record<string, string> = {
      SESSIONID: data.sessionid,
      CSRFTOKEN: data.csrftoken,
      DS_USER_ID: data.ds_user_id,
      FB_DTSG: data.fb_dtsg,
      FB_DTSG_ENC: encodeURIComponent(data.fb_dtsg),
      JAZOEST: data.jazoest,
      LSD: data.lsd,
      AV: data.av,
      DATR: data.datr || "",
      IG_DID: data.ig_did || "",
      MID: data.mid || "",
      RUR: data.rur || "",
    };

    const { data: srv, error: srvErr } = await supabase
      .from("servers")
      .insert({
        user_id: userId,
        slug,
        name: "Instagram Comment Bot",
        description: "Extrai media_id de um shortcode e dispara comentários via GraphQL",
        method: "POST",
        target_url: "https://www.instagram.com/api/graphql",
        headers: {},
        variables,
        forward_query: false,
        forward_body: false,
        enabled: true,
      })
      .select("id,slug")
      .single();
    if (srvErr) throw new Error(srvErr.message);

    const endpoints = [
      {
        server_id: srv.id,
        user_id: userId,
        action_key: "extract_id",
        name: "Extrair media_id do shortcode",
        description: "GET na página do post + regex pra pegar o id numérico",
        method: "GET",
        target_url: "https://www.instagram.com/p/{{SHORTCODE}}/",
        headers: GET_HEADERS,
        body_template: null,
        forward_query: false,
        forward_body: false,
        sort_order: 0,
      },
      {
        server_id: srv.id,
        user_id: userId,
        action_key: "post_comment",
        name: "Postar comentário",
        description: "POST GraphQL PolarisPostCommentInputRevampedMutation",
        method: "POST",
        target_url: "https://www.instagram.com/api/graphql",
        headers: POST_HEADERS,
        body_template: POST_BODY,
        forward_query: false,
        forward_body: false,
        sort_order: 1,
      },
    ];
    const { error: epErr } = await supabase.from("endpoints").insert(endpoints);
    if (epErr) throw new Error(epErr.message);

    const html = build3DHtml(srv.slug);
    const { error: pgErr } = await supabase.from("pages").insert({
      user_id: userId,
      server_id: srv.id,
      slug: pageSlug,
      title: "Instagram Comment Bot",
      description: "Painel 3D público pra disparar comentários",
      html,
    });
    if (pgErr) throw new Error(pgErr.message);

    return { serverId: srv.id, serverSlug: srv.slug, pageSlug };
  });
