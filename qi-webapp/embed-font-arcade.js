#!/usr/bin/env node
/* One-off: embed the Orbitron display font (SIL OFL) into styles.css as base64
 * data-URI @font-face rules so the app (and the offline standalone) get a
 * game-grade display face with NO network/CSP dependency. Idempotent. */
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");

const CSS = path.join(__dirname, "css", "styles.css");
const WEIGHTS = [
  { w: 600, url: "https://cdn.jsdelivr.net/npm/@fontsource/orbitron@5/files/orbitron-latin-600-normal.woff2" },
  { w: 800, url: "https://cdn.jsdelivr.net/npm/@fontsource/orbitron@5/files/orbitron-latin-800-normal.woff2" }
];
const MARKER = "/* == ARCADE DISPLAY FONT (Orbitron, SIL OFL, base64-embedded) == */";

function fetchBuffer(url, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
        res.resume(); return resolve(fetchBuffer(res.headers.location, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode + " for " + url)); }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

async function main() {
  let css = fs.readFileSync(CSS, "utf8");
  if (css.indexOf(MARKER) !== -1) { console.log("Already embedded — nothing to do."); return; }

  let faces = MARKER + "\n";
  for (const { w, url } of WEIGHTS) {
    const buf = await fetchBuffer(url);
    const b64 = buf.toString("base64");
    faces += "@font-face{font-family:'Orbitron';font-style:normal;font-weight:" + w +
      ";font-display:swap;src:url(data:font/woff2;base64," + b64 + ") format('woff2')}\n";
    console.log("  embedded Orbitron " + w + " (" + buf.length + " bytes -> " + b64.length + " b64)");
  }

  // Apply the display face to headings / KPIs / brand only (NOT body or tables).
  const usage =
    ":root{--font-display:'Orbitron','Segoe UI',system-ui,Arial,sans-serif}\n" +
    ".topbar h1,.kpi .value,.card-head h3,.brand-text strong,.auth-brand h1,.nav-sep,.globe-stat-val{" +
    "font-family:var(--font-display);letter-spacing:.02em}\n" +
    ".kpi .value{letter-spacing:.01em}\n";

  fs.writeFileSync(CSS, css + "\n\n" + faces + usage);
  console.log("Wrote @font-face + usage to css/styles.css");
}
main().catch(e => { console.error("font embed failed:", e.message); process.exit(1); });
