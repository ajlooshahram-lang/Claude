#!/usr/bin/env node
/* Build a single, self-contained STP-Application.html that opens by double-click.
 *
 * Why: the normal app boots behind a server-backed login gate and loads CSS/JS/
 * textures as separate files. A non-technical stakeholder who just wants to SEE
 * the Submarine Telecom Project Application can't run a server or log in. This
 * build inlines EVERYTHING (CSS, all JS modules, Three.js + add-ons, Chart.js,
 * and the Earth textures as data URIs) and sets window.__SKIP_AUTH so the file
 * opens straight into the app — no server, no login, works offline.
 *
 * It NEVER contains any secret/backend code: only the static front-end. The
 * real, login-gated, server-backed deployment is unchanged (docker-compose).
 *
 * Usage:  node build-standalone.js
 * Output: dist/STP-Application.html
 */
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, "dist");
const OUT_FILE = path.join(OUT_DIR, "STP-Application.html");

// External libs to inline (kept identical to index.html versions).
const CDN = [
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/CopyShader.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/LuminosityHighPassShader.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/FXAAShader.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/EffectComposer.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/RenderPass.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/ShaderPass.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/UnrealBloomPass.js"
];

// Local JS modules in the exact load order used by index.html.
const JS_MODULES = [
  "js/auth.js", "js/sync.js", "js/calc.js", "js/store.js", "js/country-data.js",
  "js/brain.js", "js/charts.js", "js/globe.js", "js/ui.js"
];

const TEXTURES = {
  day: "textures/earth_day.jpg",
  normal: "textures/earth_normal.jpg",
  specular: "textures/earth_specular.jpg",
  clouds: "textures/earth_clouds.png",
  lights: "textures/earth_lights.png"
};

// ---- demo-only "attract" intro splash (game title-screen opening) ----------
// Injected by this build into the standalone demo ONLY. The secure server build
// (index.html) never includes it. Auto-dismisses, skippable, reduced-motion aware.
const ATTRACT_HTML = `
<div id="stpAttract" class="stp-attract" role="dialog" aria-label="Submarine Telecom Project">
  <div class="stp-attract-inner">
    <div class="stp-attract-mark">QI</div>
    <div class="stp-attract-word">SUBMARINE TELECOM PROJECT</div>
    <div class="stp-attract-sub">Programme Intelligence Platform &middot; $1.3B Asia Fiber Network</div>
    <div class="stp-attract-bar"><span></span></div>
    <div class="stp-attract-hint">Click anywhere to enter</div>
  </div>
</div>`;

const ATTRACT_CSS = `<style id="stpAttractCss">
.stp-attract{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;cursor:pointer;
  background:
    radial-gradient(40% 50% at 18% 16%,rgba(34,225,230,.22),transparent 70%),
    radial-gradient(45% 55% at 84% 86%,rgba(255,63,164,.20),transparent 70%),
    radial-gradient(60% 60% at 50% 50%,rgba(155,107,255,.16),transparent 75%),
    linear-gradient(135deg,#04060d 0%,#070d1c 45%,#0a1230 100%);
  transition:opacity .55s ease}
.stp-attract::after{content:"";position:absolute;inset:0;pointer-events:none;
  background-image:linear-gradient(rgba(122,162,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(122,162,255,.06) 1px,transparent 1px);
  background-size:46px 46px;-webkit-mask-image:radial-gradient(circle at 50% 45%,#000 50%,transparent 100%);mask-image:radial-gradient(circle at 50% 45%,#000 50%,transparent 100%)}
.stp-attract.hide{opacity:0;pointer-events:none}
.stp-attract-inner{position:relative;text-align:center;padding:24px;animation:stpIn .9s cubic-bezier(.2,.7,.2,1) both}
.stp-attract-mark{width:96px;height:96px;margin:0 auto 22px;border-radius:22px;display:grid;place-items:center;
  font:800 42px/1 'Orbitron',"Segoe UI",system-ui,sans-serif;color:#04101f;
  background:linear-gradient(135deg,#22e1e6,#9b6bff);box-shadow:0 0 30px rgba(34,225,230,.6),0 0 60px rgba(155,107,255,.35);
  animation:stpPulse 2.4s ease-in-out infinite}
.stp-attract-word{font:800 30px/1.15 'Orbitron',"Segoe UI",system-ui,sans-serif;letter-spacing:.14em;
  background:linear-gradient(90deg,#22e1e6,#3aa0ff,#ff3fa4);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  text-shadow:0 0 22px rgba(34,225,230,.25)}
.stp-attract-sub{margin-top:12px;font:500 13px/1.5 "Segoe UI",system-ui,sans-serif;letter-spacing:.06em;color:#9fb6e0;text-transform:uppercase}
.stp-attract-bar{width:240px;max-width:70vw;height:3px;margin:26px auto 0;border-radius:3px;background:rgba(122,162,255,.18);overflow:hidden}
.stp-attract-bar>span{display:block;height:100%;width:40%;border-radius:3px;background:linear-gradient(90deg,#22e1e6,#3aa0ff);box-shadow:0 0 10px rgba(34,225,230,.7);animation:stpLoad 2.6s ease-in-out forwards}
.stp-attract-hint{margin-top:22px;font:600 11px/1 "Segoe UI",system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#6f86b6;animation:stpBlink 1.4s steps(2) infinite}
@keyframes stpIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
@keyframes stpPulse{0%,100%{box-shadow:0 0 26px rgba(34,225,230,.5),0 0 52px rgba(155,107,255,.3)}50%{box-shadow:0 0 40px rgba(34,225,230,.85),0 0 80px rgba(155,107,255,.45)}}
@keyframes stpLoad{0%{width:6%}70%{width:88%}100%{width:100%}}
@keyframes stpBlink{0%{opacity:.4}50%{opacity:1}}
@media (prefers-reduced-motion: reduce){.stp-attract-inner,.stp-attract-mark,.stp-attract-bar>span,.stp-attract-hint{animation:none}}
@media print{.stp-attract{display:none!important}}
</style>`;

const ATTRACT_JS = `<script>(function(){
  var a = document.getElementById("stpAttract"); if (!a) return;
  var reduce = false; try { reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch(e){}
  var done = false;
  function dismiss(){ if(done) return; done = true; a.classList.add("hide");
    setTimeout(function(){ if(a && a.parentNode) a.parentNode.removeChild(a); }, 650); }
  a.addEventListener("click", dismiss);
  function onKey(e){ document.removeEventListener("keydown", onKey); dismiss(); }
  document.addEventListener("keydown", onKey);
  setTimeout(dismiss, reduce ? 900 : 3000);
})();</script>`;

function fetchText(url, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
        res.resume();
        return resolve(fetchText(res.headers.location, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode + " for " + url)); }
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { data += c; });
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

// Neutralise any literal </script> inside inlined code so it can't close the host tag.
function safeScript(body) {
  return String(body).replace(/<\/(script)/gi, "<\\/$1");
}

function dataUri(file) {
  const buf = fs.readFileSync(path.join(ROOT, file));
  const ext = path.extname(file).toLowerCase();
  const mime = ext === ".png" ? "image/png" : (ext === ".jpg" || ext === ".jpeg") ? "image/jpeg" : "application/octet-stream";
  return "data:" + mime + ";base64," + buf.toString("base64");
}

async function main() {
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "css/styles.css"), "utf8");

  // 1) inline the stylesheet
  html = html.replace(
    /<link rel="stylesheet" href="css\/styles\.css"\s*\/?>/,
    "<style>\n" + css + "\n</style>"
  );

  // 2) inject bootstrap config in <head>: skip auth + inline textures + a demo banner.
  const textureObj = {};
  for (const k of Object.keys(TEXTURES)) textureObj[k] = dataUri(TEXTURES[k]);
  const bootstrap =
    "<script>\n" +
    "window.__SKIP_AUTH = true;            /* standalone demo: no server-backed login */\n" +
    "window.QIGLOBE_TEXTURES = " + safeScript(JSON.stringify(textureObj)) + ";\n" +
    "</script>\n" + ATTRACT_CSS;
  html = html.replace("</head>", bootstrap + "\n</head>");

  // 3) fetch + inline the external libraries (fall back to CDN tag if offline)
  const libBlocks = [];
  for (const url of CDN) {
    try {
      const code = await fetchText(url);
      libBlocks.push("<script>/* " + url + " */\n" + safeScript(code) + "\n</script>");
      process.stdout.write("  inlined " + url.split("/").pop() + " (" + code.length + " bytes)\n");
    } catch (e) {
      libBlocks.push('<script src="' + url + '"></script>');
      process.stdout.write("  WARN keeping CDN tag for " + url + " (" + e.message + ")\n");
    }
  }

  // 4) inline local JS modules
  const appBlocks = [];
  for (const m of JS_MODULES) {
    const code = fs.readFileSync(path.join(ROOT, m), "utf8");
    appBlocks.push("<script>/* " + m + " */\n" + safeScript(code) + "\n</script>");
  }

  // 5) after boot, reveal the app and hide the (unused) login gate
  const reveal =
    "<script>(function(){\n" +
    "  var g = document.getElementById('authGate'); if (g) g.style.display = 'none';\n" +
    "  var a = document.getElementById('app'); if (a) a.hidden = false;\n" +
    "})();</script>\n" + ATTRACT_JS;

  // 6) replace the entire original <script ...> tail with our inlined blocks
  const firstScript = html.indexOf('<script src="https://cdn.jsdelivr.net/npm/chart.js');
  const bodyClose = html.lastIndexOf("</body>");
  if (firstScript === -1 || bodyClose === -1) throw new Error("could not locate script block to replace");
  html = html.slice(0, firstScript) +
         libBlocks.join("\n") + "\n" + appBlocks.join("\n") + "\n" + reveal + "\n" +
         html.slice(bodyClose);

  // tidy a couple of cosmetic labels for the demo build
  html = html.replace("<title>QI Intelligence Platform</title>",
    "<title>Submarine Telecom Project Application</title>");

  // attract intro splash (demo only) — injected right after <body>
  html = html.replace("<body>", "<body>\n" + ATTRACT_HTML);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  process.stdout.write("\nWrote " + path.relative(ROOT, OUT_FILE) + " (" + kb + " KB)\n");
}

main().catch((e) => { console.error("build failed:", e); process.exit(1); });
