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
    "</script>";
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
    "})();</script>";

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

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  process.stdout.write("\nWrote " + path.relative(ROOT, OUT_FILE) + " (" + kb + " KB)\n");
}

main().catch((e) => { console.error("build failed:", e); process.exit(1); });
