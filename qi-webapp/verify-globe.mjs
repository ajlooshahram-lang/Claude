/*
 * verify-globe.mjs — real-browser visual verification of the 3D globe under
 * the production strict Content-Security-Policy.
 *
 * WHY THIS EXISTS
 * ---------------
 * The headless jsdom suites (smoke.js, verify-standalone.js) cover data,
 * routing, CRUD and the globe's *API surface*, but jsdom has no WebGL — it
 * can never prove the globe actually paints. This script fills that gap:
 *
 *   1. Serves the SERVED product (index.html + external vendor/ + js/ + css/)
 *      over HTTP with the EXACT security headers from nginx/nginx.conf,
 *      including the strict CSP (`script-src 'self'`, no 'unsafe-inline',
 *      no CDN, `img-src 'self' data:`). This is the real CSP-served app — NOT
 *      the inlined dist/ demo (which would need 'unsafe-inline').
 *   2. Boots the app with no backend (__SKIP_AUTH) in real Chromium.
 *   3. Opens the 3D Network Map view (auto-calls QIGlobe.init).
 *   4. Asserts the self-hosted Three.js + add-ons loaded, init() succeeded,
 *      every vendor/texture request returned 200, and ZERO CSP violations or
 *      page errors fired.
 *   5. Reads back the rendered canvas pixels and asserts it is genuinely
 *      non-blank (a real Earth was drawn), then saves a screenshot to the
 *      gitignored .artifacts/ folder for human review.
 *
 * This is opt-in (`npm run verify:globe`) because it needs a Chromium binary
 * (`npx playwright install chromium`); it is intentionally NOT part of the
 * default `npm test` so the core suite stays dependency-light.
 */
"use strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* The EXACT strict CSP + security headers served at the edge (nginx/nginx.conf). */
const CSP =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; " +
  "img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; " +
  "base-uri 'self'; frame-ancestors 'none'; form-action 'self'; " +
  "manifest-src 'self'; worker-src 'self';";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
};

let fails = 0;
function ok(cond, msg) {
  console.log((cond ? "  ok  " : "FAIL  ") + msg);
  if (!cond) fails++;
}

/* ---- tiny static server that mirrors the production security headers ---- */
function startServer(rootDir) {
  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      let rel = urlPath === "/" ? "/index.html" : urlPath;
      const filePath = path.normalize(path.join(rootDir, rel));
      // contain within rootDir
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404).end("not found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const body = fs.readFileSync(filePath);
      res.writeHead(200, {
        "Content-Type": TYPES[ext] || "application/octet-stream",
        "Content-Security-Policy": CSP,
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "interest-cohort=()",
      });
      res.end(body);
    } catch (e) {
      res.writeHead(500).end("error: " + e.message);
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (e) {
    console.error("Playwright not installed. Run: npm i && npx playwright install chromium");
    process.exit(2);
  }

  const root = __dirname;
  const server = await startServer(root);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  // Capture CSP violations from inside the page (the authoritative signal).
  await page.addInitScript(() => {
    window.__SKIP_AUTH = true;
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__csp.push({
        directive: e.violatedDirective,
        blockedURI: e.blockedURI,
        line: e.lineNumber,
      });
    });
  });

  const pageErrors = [];
  const failedRequests = [];
  page.on("pageerror", (e) => pageErrors.push(String(e && e.message ? e.message : e)));
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (/\/(vendor|js|css|textures)\//.test(u)) failedRequests.push(u + " — " + (r.failure() && r.failure().errorText));
  });
  // Browser-reported CSP blocks also surface as console errors — capture them too.
  const consoleCSP = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/content security policy|refused to (load|execute|apply)/i.test(t)) consoleCSP.push(t);
  });

  await page.goto(base + "/index.html", { waitUntil: "networkidle" });

  // The served app gates behind login; QIBoot() under __SKIP_AUTH renders the
  // shell but (by design) only a successful login reveals it. Simulate the
  // logged-in state a real user sees so the globe mounts into a *visible*
  // stage (otherwise display:none gives the canvas a zero-size fallback).
  await page.evaluate(() => {
    const a = document.getElementById("app");
    const g = document.getElementById("authGate");
    if (a) a.hidden = false;
    if (g) g.hidden = true;
  });

  // App must self-boot (nav built, a view rendered) and the shell be visible.
  const booted = await page.evaluate(() => {
    const app = document.getElementById("app");
    const content = document.getElementById("content");
    const navCount = document.querySelectorAll(".nav-item").length;
    const visible = !!app && app.hidden === false && getComputedStyle(app).display !== "none";
    return { visible, navCount, contentLen: content ? content.innerHTML.length : 0 };
  });
  ok(booted.visible && booted.navCount >= 12 && booted.contentLen > 200,
    "app shell booted & visible (nav " + booted.navCount + " items, content " + booted.contentLen + " chars)");

  // Regression guard: the `hidden` attribute must actually hide overlays.
  // .modal-overlay sets display:flex, which can override UA [hidden]{display:none};
  // a global [hidden]{display:none!important} guard must win, otherwise an empty
  // modal scrim covers the topbar on boot (the "empty white box" bug).
  const overlays = await page.evaluate(() => {
    const check = (id) => {
      const el = document.getElementById(id);
      if (!el) return { id, missing: true };
      return { id, hiddenAttr: el.hidden, display: getComputedStyle(el).display };
    };
    return ["modalOverlay", "toast"].map(check);
  });
  const overlayBug = overlays.find((o) => !o.missing && o.hiddenAttr && o.display !== "none");
  ok(!overlayBug,
    "hidden overlays are display:none on boot (no empty modal scrim over topbar)" +
      (overlayBug ? ": #" + overlayBug.id + " is " + overlayBug.display : ""));

  // Navigate to the 3D Network Map view (auto-calls QIGlobe.init).
  await page.evaluate(() => {
    const btn = document.querySelector('.nav-item[data-view="globe3d"]');
    if (btn) btn.dispatchEvent(new Event("click", { bubbles: true }));
  });

  // Wait for the WebGL canvas to mount inside the stage and become visible.
  const canvasAppeared = await page
    .waitForSelector("#globeStage canvas", { state: "visible", timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  ok(canvasAppeared, "WebGL canvas mounted & visible inside #globeStage");

  // Give the renderer a few animation frames to paint the Earth + bloom.
  await page.waitForTimeout(2500);

  // Vendor libraries actually loaded under strict script-src 'self'.
  const libs = await page.evaluate(() => ({
    three: window.THREE ? String(window.THREE.REVISION) : null,
    orbit: !!(window.THREE && typeof window.THREE.OrbitControls === "function"),
    bloom: !!(window.THREE && typeof window.THREE.UnrealBloomPass === "function"),
    chart: typeof window.Chart === "function" ? window.Chart.version : null,
    globeOk: !!(window.QIGlobe && document.querySelector("#globeStage canvas")),
    fallbackHidden: (function () {
      const fb = document.getElementById("globeFallback");
      return !fb || fb.style.display === "none";
    })(),
    canvasSize: (function () {
      const c = document.querySelector("#globeStage canvas");
      return c ? { w: c.width, h: c.height } : null;
    })(),
  }));
  ok(libs.three === "128", "self-hosted Three.js r128 loaded under script-src 'self' (got r" + libs.three + ")");
  ok(libs.orbit, "self-hosted OrbitControls add-on loaded");
  ok(libs.bloom, "self-hosted UnrealBloomPass add-on loaded");
  ok(libs.chart === "4.4.1", "self-hosted Chart.js v4.4.1 loaded (got " + libs.chart + ")");
  ok(!!libs.canvasSize && libs.canvasSize.w > 0 && libs.canvasSize.h > 0,
    "canvas has real dimensions (" + (libs.canvasSize ? libs.canvasSize.w + "x" + libs.canvasSize.h : "none") + ")");
  ok(libs.fallbackHidden, "2D fallback is hidden — real WebGL globe initialised");

  // No failed vendor/texture requests under the strict CSP.
  ok(failedRequests.length === 0,
    "no failed vendor/js/css/texture requests" + (failedRequests.length ? ": " + failedRequests.join(" | ") : ""));

  // Zero CSP violations (page-reported and console-reported).
  const cspViolations = await page.evaluate(() => window.__csp || []);
  ok(cspViolations.length === 0,
    "zero CSP violations from the page" +
      (cspViolations.length ? ": " + cspViolations.map((v) => v.directive + " <- " + v.blockedURI).join(" | ") : ""));
  ok(consoleCSP.length === 0,
    "zero CSP refusals in the console" + (consoleCSP.length ? ": " + consoleCSP.slice(0, 3).join(" | ") : ""));

  // No uncaught page errors.
  ok(pageErrors.length === 0, "no uncaught page errors" + (pageErrors.length ? ": " + pageErrors.slice(0, 3).join(" | ") : ""));

  // ---- Pixel readback: prove the globe genuinely painted (non-blank) ----
  const box = await page.evaluate(() => {
    const c = document.querySelector("#globeStage canvas");
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  let shot = null;
  if (box && box.width > 2 && box.height > 2) {
    // Use a page screenshot clipped to the canvas — robust against the
    // elementHandle visibility/stability heuristic for flex-filling canvases.
    shot = await page.screenshot({
      clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.width, height: box.height },
    });
  }
  let pixelStats = { distinct: 0, nonBlackFrac: 0 };
  if (shot) {
    const dataUrl = "data:image/png;base64," + shot.toString("base64");
    pixelStats = await page.evaluate(async (url) => {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = url;
      });
      const cv = document.createElement("canvas");
      const N = 64;
      cv.width = N;
      cv.height = N;
      const ctx = cv.getContext("2d");
      ctx.drawImage(img, 0, 0, N, N);
      const data = ctx.getImageData(0, 0, N, N).data;
      const seen = new Set();
      let nonBlack = 0;
      const total = N * N;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // quantise to ignore tiny AA noise
        seen.add((r >> 3) + "," + (g >> 3) + "," + (b >> 3));
        if (r + g + b > 24) nonBlack++;
      }
      return { distinct: seen.size, nonBlackFrac: nonBlack / total };
    }, dataUrl);

    // Persist a full-resolution screenshot for human review (gitignored).
    const outDir = path.join(root, ".artifacts");
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, "globe-verify.png");
    fs.writeFileSync(outFile, shot);
    console.log("       screenshot saved -> " + path.relative(root, outFile));
  }
  ok(pixelStats.distinct >= 24,
    "canvas painted a rich image — " + pixelStats.distinct + " distinct colours (blank would be ~1)");
  ok(pixelStats.nonBlackFrac >= 0.15,
    "canvas is not mostly black — " + Math.round(pixelStats.nonBlackFrac * 100) + "% lit pixels (the Earth is visible)");

  // ---- A–Z deployment / build-sequence animation -------------------------
  const deployBarVisible = await page.evaluate(() => {
    const b = document.getElementById("globeDeploy");
    return !!b && b.hidden === false;
  });
  ok(deployBarVisible, "build-sequence controls (play + scrubber) are visible on the 3D map");

  // Scrub the build to 0 / 50 / 100% and read the engine's reported state.
  const dz = await page.evaluate(() => {
    const out = {};
    window.QIGlobe.setDeployment(0);   out.zero = window.QIGlobe.deployState();
    window.QIGlobe.setDeployment(50);  out.half = window.QIGlobe.deployState();
    window.QIGlobe.setDeployment(100); out.full = window.QIGlobe.deployState();
    return out;
  });
  ok(dz.zero && dz.zero.mode === true && dz.zero.pct === 0 && dz.zero.laid === 0,
    "build at 0% — nothing laid yet, build mode engaged");
  ok(dz.half && dz.half.laid > 0 && dz.half.laid < dz.half.total && dz.half.online > 0,
    "build at 50% — some cables laid, some countries online (" + (dz.half ? dz.half.laid + "/" + dz.half.total + " cables" : "") + ")");
  ok(dz.full && dz.full.laid === dz.full.total && dz.full.online === dz.full.stations,
    "build at 100% — all cables laid & all " + (dz.full ? dz.full.stations : "?") + " countries online");

  // The plain-language UI must reflect the build state (label + scrubber).
  const ui100 = await page.evaluate(() => ({
    phase: document.getElementById("globeDeployPhase").textContent,
    range: document.getElementById("globeDeployRange").value,
  }));
  ok(/complete/i.test(ui100.phase) && ui100.range === "100",
    "build UI shows completion + scrubber pinned to 100% (phase: " + JSON.stringify(ui100.phase) + ")");

  // Dragging the scrubber drives the build (no typing — slider only).
  const ui30 = await page.evaluate(() => {
    const r = document.getElementById("globeDeployRange");
    r.value = "30";
    r.dispatchEvent(new Event("input", { bubbles: true }));
    return { phase: document.getElementById("globeDeployPhase").textContent, st: window.QIGlobe.deployState() };
  });
  ok(ui30.st.pct === 30 && /laying|online|complete|building/i.test(ui30.phase),
    "scrubbing to 30% updates the build state + phase label (" + JSON.stringify(ui30.phase) + ")");

  // Auto-play must advance the build over time, then pause cleanly.
  await page.evaluate(() => { window.QIGlobe.setDeployment(0); window.QIGlobe.playDeployment(); });
  const playing = await page.evaluate(() => window.QIGlobe.isDeploying());
  await page.waitForTimeout(1600);
  const advanced = await page.evaluate(() => { const p = window.QIGlobe.deployState().pct; window.QIGlobe.pauseDeployment(); return p; });
  ok(playing === true, "play starts the automatic A–Z build");
  ok(advanced > 0, "the automatic build advances over time (reached " + advanced + "%)");

  // Exiting returns to the normal live network view.
  const exited = await page.evaluate(() => { window.QIGlobe.exitDeployment(); return window.QIGlobe.inDeployMode(); });
  ok(exited === false, "exit returns to the live network view");

  // The build animation must not have introduced any errors/CSP violations.
  const cspAfter = await page.evaluate(() => (window.__csp || []).length);
  ok(pageErrors.length === 0 && cspAfter === 0 && consoleCSP.length === 0,
    "no page errors / CSP violations during the build animation");

  await browser.close();
  server.close();

  console.log(fails === 0 ? "\nALL GLOBE VISUAL CHECKS PASSED" : "\n" + fails + " GLOBE VISUAL CHECK(S) FAILED");
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("verify-globe crashed:", e);
  process.exit(1);
});
