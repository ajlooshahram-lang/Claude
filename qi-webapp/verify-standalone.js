#!/usr/bin/env node
/* Verify dist/STP-Application.html actually boots into the app (no server, no
 * login) by loading it in jsdom and running its inlined scripts for real. */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  ok  " + msg); } else { fail++; console.log("FAIL  " + msg); } }

const file = path.join(__dirname, "dist", "STP-Application.html");
const html = fs.readFileSync(file, "utf8");

// --- static structure checks (cheap, catch packaging mistakes) ---
ok(/window\.__SKIP_AUTH\s*=\s*true/.test(html), "sets __SKIP_AUTH (no login gate)");
ok(/window\.QIGLOBE_TEXTURES\s*=\s*\{[^]*data:image\/jpeg;base64,/.test(html), "inlines Earth textures as data URIs");
ok(html.indexOf('id="stpAttract"') !== -1, "standalone embeds the attract intro splash (demo only)");
ok(/@font-face[^}]*Orbitron[^}]*base64/.test(html.replace(/\n/g, " ")), "standalone embeds the Orbitron display font (offline, no CDN)");
ok(!/<script\s+src=/i.test(html), "no external <script src> tags remain (fully self-contained)");
ok(html.indexOf("THREE") !== -1 && html.indexOf("OrbitControls") !== -1, "Three.js + add-ons inlined");
ok(html.indexOf("/* js/ui.js */") !== -1 && html.indexOf("/* js/globe.js */") !== -1, "app modules inlined");

// --- live boot check ---
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true });
const { window } = dom;
// jsdom has no WebGL/2D canvas; globe.init() must detect this and no-op gracefully.
try { window.HTMLCanvasElement.prototype.getContext = function () { return null; }; } catch (e) {}

setTimeout(() => {
  const doc = window.document;
  ok(window.__SKIP_AUTH === true, "runtime: __SKIP_AUTH is true");
  ok(window.QIStore && typeof window.QIStore.load === "function", "runtime: QIStore booted");
  ok(window.QIGlobe && Array.isArray(window.QIGlobe.STATIONS) && window.QIGlobe.STATIONS.length === 8, "runtime: QIGlobe dataset present (8 stations)");
  ok(typeof window.QIGLOBE_TEXTURES === "object" && /^data:image\/jpeg/.test(window.QIGLOBE_TEXTURES.day), "runtime: inlined day texture is a JPEG data URI");

  const app = doc.getElementById("app");
  const gate = doc.getElementById("authGate");
  ok(app && app.hidden === false, "runtime: app shell is visible (gate bypassed)");
  ok(gate && gate.style.display === "none", "runtime: login gate is hidden");

  const navItems = doc.querySelectorAll(".nav-item");
  ok(navItems.length > 10, "runtime: navigation rendered (" + navItems.length + " items)");
  const globeNav = doc.querySelector('.nav-item[data-view="globe3d"]');
  ok(!!globeNav, "runtime: 3D Network Map nav item present");

  let threw = false;
  try {
    globeNav.dispatchEvent(new window.Event("click", { bubbles: true }));
  } catch (e) { threw = true; console.log("    (globe click error: " + e.message + ")"); }
  ok(!threw, "runtime: opening the 3D Network Map view does not throw");
  ok(!!doc.getElementById("globeStage"), "runtime: 3D Network Map stage rendered");

  // attract splash present on load, and dismissable
  const splash = doc.getElementById("stpAttract");
  ok(!!splash, "runtime: attract intro splash present on load");
  if (splash) { splash.dispatchEvent(new window.Event("click", { bubbles: true })); }
  ok(!splash || splash.classList.contains("hide"), "runtime: attract splash dismisses on click");

  console.log("\n" + (fail ? "FAILED " + fail + " / " + (pass + fail) : "ALL STANDALONE CHECKS PASSED (" + pass + ")"));
  process.exit(fail ? 1 : 0);
}, 600);
