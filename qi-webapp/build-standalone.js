/*
 * build-standalone.js — generates a single self-contained HTML file:
 *   dist/STP-Application.html
 *
 * This is the NO-BACKEND DEMO build, intended purely for viewing the app by
 * double-clicking the file (works over file://, fully offline). It:
 *   - inlines css/styles.css, every vendored library, and every app module,
 *   - sets window.__SKIP_AUTH so the app boots straight to the dashboard with
 *     locally-seeded demo data (no login / server required),
 *   - inlines the Earth textures as data: URIs so the 3D globe renders without
 *     any external requests (and without file:// canvas-taint issues),
 *   - reveals the app shell, removes the login gate, and adds a small DEMO
 *     badge so viewers know data is local-only.
 *
 * The secure, server-backed deployment (index.html + server/ + nginx) remains
 * the real product. This file is a read-only showcase. Regenerate with:
 *   node build-standalone.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = __dirname;

// Build identifier so a viewer can tell a fresh file from a stale download.
function buildId() {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let sha = "";
  try {
    sha = execSync("git rev-parse --short HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch (e) {
    sha = "";
  }
  return sha ? date + " (" + sha + ")" : date;
}
const BUILD_ID = buildId();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const readB64 = (p) => fs.readFileSync(path.join(root, p)).toString("base64");

// Neutralise any literal "</script" so inlined code can't close the tag early.
const safe = (js) => js.replace(/<\/script/gi, "<\\/script");

// ---- Earth textures -> data: URIs (keyed by the exact paths used in globe.js) ----
const TEXTURES = {
  "textures/earth_day.jpg": "data:image/jpeg;base64," + readB64("textures/earth_day.jpg"),
  "textures/earth_normal.jpg": "data:image/jpeg;base64," + readB64("textures/earth_normal.jpg"),
  "textures/earth_specular.jpg": "data:image/jpeg;base64," + readB64("textures/earth_specular.jpg"),
  "textures/earth_clouds.png": "data:image/png;base64," + readB64("textures/earth_clouds.png"),
  "textures/earth_lights.png": "data:image/png;base64," + readB64("textures/earth_lights.png"),
};

// ---- vendored libraries (load order matters: three core before its add-ons) ----
const VENDOR = [
  "vendor/chartjs/chart.umd.min.js",
  "vendor/three/three.min.js",
  "vendor/three/examples/js/controls/OrbitControls.js",
  "vendor/three/examples/js/shaders/CopyShader.js",
  "vendor/three/examples/js/shaders/LuminosityHighPassShader.js",
  "vendor/three/examples/js/shaders/FXAAShader.js",
  "vendor/three/examples/js/postprocessing/EffectComposer.js",
  "vendor/three/examples/js/postprocessing/RenderPass.js",
  "vendor/three/examples/js/postprocessing/ShaderPass.js",
  "vendor/three/examples/js/postprocessing/UnrealBloomPass.js",
];

// ---- app modules (same order as index.html) ----
const APP = [
  "js/auth.js",
  "js/sync.js",
  "js/calc.js",
  "js/store.js",
  "js/country-data.js",
  "js/brain.js",
  "js/charts.js",
  "js/globe.js",
  "js/ui.js",
];

// Inline globe.js with textures swapped for data: URIs.
function inlineModule(p) {
  let src = read(p);
  if (p === "js/globe.js") {
    Object.keys(TEXTURES).forEach((rel) => {
      src = src.split('"' + rel + '"').join('"' + TEXTURES[rel] + '"');
    });
  }
  return src;
}

const css = read("css/styles.css");

const vendorScripts = VENDOR.map((p) => `<script>${safe(read(p))}</script>`).join("\n");

const appScripts = APP.map((p) => {
  let src = inlineModule(p);
  // auth.js: skip the backend auth gate entirely for the demo.
  if (p === "js/auth.js") src = "window.__SKIP_AUTH=true;\n" + src;
  return `<script>${safe(src)}</script>`;
}).join("\n");

// Reveal the app, remove the login gate, and add a DEMO badge.
const bootDemo = `<script>
(function () {
  var BUILD_ID = ${JSON.stringify(BUILD_ID)};
  function hideStrayOverlays() {
    // Defensive: an empty modal scrim / toast must never paint over the app.
    ["modalOverlay", "toast"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.hidden = true; el.style.display = "none"; }
    });
  }
  function reveal() {
    var gate = document.getElementById("authGate");
    if (gate && gate.parentNode) gate.parentNode.removeChild(gate);
    var app = document.getElementById("app");
    if (app) app.hidden = false;
    if (window.QIBoot) { try { window.QIBoot(); } catch (e) {} }
    hideStrayOverlays();
    if (!document.getElementById("stpDemoBadge")) {
      var b = document.createElement("div");
      b.id = "stpDemoBadge";
      b.textContent = "DEMO — local data only \\u00b7 no backend \\u00b7 build " + BUILD_ID;
      b.title = "Offline showcase build " + BUILD_ID + ". Changes are saved only in this browser.";
      b.setAttribute("style", [
        "position:fixed", "bottom:12px", "right:12px", "z-index:99999",
        "background:#c00000", "color:#fff", "font:600 11px/1 system-ui,Segoe UI,Arial,sans-serif",
        "letter-spacing:.04em", "padding:7px 11px", "border-radius:999px",
        "box-shadow:0 4px 14px rgba(0,0,0,.35)", "pointer-events:none", "opacity:.92"
      ].join(";"));
      document.body.appendChild(b);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", reveal);
  else reveal();
})();
</script>`;

// Assemble from index.html: inline stylesheet, replace external scripts.
let htmlOut = read("index.html").replace(
  '<link rel="stylesheet" href="css/styles.css" />',
  `<style>\n${css}\n</style>`
);

// Drop the entire external-script block (from the first vendor <script> to ui.js)
// and replace it with the fully inlined vendor + app + demo-boot scripts.
const firstScriptIdx = htmlOut.indexOf("<script");
const closeBodyIdx = htmlOut.indexOf("</body>");
if (firstScriptIdx === -1 || closeBodyIdx === -1) {
  throw new Error("build-standalone: could not locate the script block in index.html");
}
htmlOut =
  htmlOut.slice(0, firstScriptIdx) +
  vendorScripts + "\n" + appScripts + "\n" + bootDemo + "\n  " +
  htmlOut.slice(closeBodyIdx);

// Make the demo nature obvious in the tab title.
htmlOut = htmlOut.replace(
  "<title>QI Intelligence Platform</title>",
  "<title>QI Intelligence Platform — STP Demo</title>"
);

const outDir = path.join(root, "dist");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "STP-Application.html");
fs.writeFileSync(outFile, htmlOut, "utf8");

const bytes = Buffer.byteLength(htmlOut, "utf8");
console.log("Wrote " + outFile);
console.log("Build: " + BUILD_ID);
console.log("Size: " + (bytes / 1024 / 1024).toFixed(2) + " MB");
console.log("Inlined: " + VENDOR.length + " vendor libs, " + APP.length + " app modules, " + Object.keys(TEXTURES).length + " textures");
