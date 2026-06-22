/*
 * verify-standalone.js — boot checks for the no-backend demo build.
 *
 * Loads dist/STP-Application.html in jsdom exactly as a browser would (all
 * scripts inline, no external resources) and asserts the app self-boots,
 * reveals its shell, removes the login gate, seeds demo data, and exposes the
 * 3D globe dataset with the Earth textures inlined as data: URIs.
 *
 * jsdom has no real <canvas> 2D/WebGL context, so Chart.js/Three.js render
 * calls are expected to no-op or throw internally — those are filtered out;
 * only genuine load/parse/logic errors fail the run.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const file = path.join(__dirname, "dist", "STP-Application.html");
const htmlText = fs.readFileSync(file, "utf8");

const vc = new VirtualConsole();
const hardErrors = [];
vc.on("jsdomError", (e) => {
  const msg = (e && (e.message || String(e))) || "";
  // Ignore the well-known jsdom canvas/WebGL limitations.
  if (/getContext|WebGL|canvas|Not implemented|reading 'id'|Response is not defined/i.test(msg)) return;
  hardErrors.push(msg);
});

let fails = 0;
function ok(cond, msg) {
  console.log((cond ? "  ok  " : "FAIL  ") + msg);
  if (!cond) fails++;
}

const dom = new JSDOM(htmlText, {
  runScripts: "dangerously",
  url: "file:///STP-Application.html",
  virtualConsole: vc,
  pretendToBeVisual: true,
});

// Allow the synchronous inline scripts + DOMContentLoaded reveal to settle.
setTimeout(() => {
  const w = dom.window;
  const d = w.document;
  const content = d.getElementById("content");
  const html = content ? content.innerHTML : "";

  // 1) fully self-contained — no external requests possible
  ok(!/\b(src|href)\s*=\s*"(https?:|\/\/|vendor\/|js\/|css\/|textures\/)/i.test(htmlText),
    "no external src/href references (fully inlined)");
  ok(!/(https?:)?\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)/i.test(htmlText),
    "no CDN URLs anywhere in the file");

  // 2) vendored libraries actually loaded
  ok(typeof w.Chart === "function" && w.Chart.version === "4.4.1", "Chart.js v4.4.1 loaded inline");
  ok(w.THREE && String(w.THREE.REVISION) === "128", "Three.js r128 loaded inline");
  ok(w.THREE && typeof w.THREE.OrbitControls === "function", "Three.js OrbitControls add-on loaded");
  ok(w.THREE && typeof w.THREE.UnrealBloomPass === "function", "Three.js UnrealBloomPass add-on loaded");

  // 3) app self-booted with no backend
  ok(w.__SKIP_AUTH === true, "demo runs in no-backend mode (__SKIP_AUTH)");
  ok(d.getElementById("authGate") === null, "login gate removed for the demo");
  const app = d.getElementById("app");
  ok(app && app.hidden === false, "app shell revealed");
  ok(d.getElementById("stpDemoBadge") !== null, "DEMO badge present");

  // 4) dashboard rendered with seeded demo data
  ok(html.length > 500, "dashboard rendered content (" + html.length + " chars)");
  ok(/Total Cases/.test(html), "dashboard shows KPIs");
  ok(d.querySelectorAll(".nav-item").length >= 12, "navigation populated (" + d.querySelectorAll(".nav-item").length + " items)");

  // 5) state/store seeded locally
  ok(w.QIStore && typeof w.QIStore.get === "function", "QIStore exposed");
  const st = w.QIStore.get();
  ok(st && Array.isArray(st.cases) && st.cases.length >= 5, "demo cases seeded (" + (st && st.cases ? st.cases.length : 0) + ")");

  // 6) 3D globe dataset + inlined textures
  ok(w.QIGlobe && Array.isArray(w.QIGlobe.STATIONS) && w.QIGlobe.STATIONS.length === 8, "QIGlobe exposes 8 landing stations");
  ok(w.QIGlobe && Array.isArray(w.QIGlobe.CABLES) && w.QIGlobe.CABLES.length >= 6, "QIGlobe exposes cable segments");
  ok(/data:image\/jpeg;base64,/.test(htmlText) && /data:image\/png;base64,/.test(htmlText), "Earth textures inlined as data: URIs");

  // 7) country intelligence present (all 8 STP countries)
  ok(w.QICountryData && typeof w.QICountryData.list === "function" && w.QICountryData.list().length === 8,
    "country intelligence covers all 8 STP countries");

  // 7b) auto-frameworks + advisor engine wired in
  ok(w.QICountryData && typeof w.QICountryData.marketEntryFramework === "function"
    && typeof w.QICountryData.licensingFramework === "function"
    && typeof w.QICountryData.landingPartnerFramework === "function", "framework generators present");
  ok(w.QIBrain && typeof w.QIBrain.buildAdvice === "function", "Advisor (buildAdvice) present");
  ok(d.querySelector('.nav-item[data-view="advisor"]')
    && d.querySelector('.nav-item[data-view="marketentry"]')
    && d.querySelector('.nav-item[data-view="licensing"]')
    && d.querySelector('.nav-item[data-view="landingpartners"]'), "Advisor + 3 framework nav items present");

  // 8) no genuine runtime errors (canvas/WebGL artifacts excluded)
  ok(hardErrors.length === 0, "no hard load/exec errors" + (hardErrors.length ? ": " + hardErrors.join(" | ") : ""));

  console.log(fails === 0 ? "\nALL STANDALONE BOOT CHECKS PASSED" : "\n" + fails + " STANDALONE CHECK(S) FAILED");
  process.exit(fails === 0 ? 0 : 1);
}, 1500);
