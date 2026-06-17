/*
 * verify-demo.mjs — real-browser verification of the SINGLE-FILE demo
 * (dist/STP-Application.html) opened exactly how a user opens it: from file://,
 * no server, no test hooks.
 *
 * WHY THIS EXISTS
 * ---------------
 * The dist is assembled by build-standalone.js, which injects a small inline
 * boot script (reveal/demo-badge/hideStrayOverlays) that does NOT exist in the
 * served app. Neither smoke.js (jsdom, module JS) nor verify-globe.mjs (serves
 * index.html) exercises that inline boot script — so a bug living there can ship
 * undetected. Exactly that happened: hideStrayOverlays() set an inline
 * style.display="none" on #modalOverlay and #toast, which permanently overrode
 * the CSS and made EVERY modal and EVERY toast invisible ("nothing happens when
 * I press + New Case"). This script guards the real artifact against that class
 * of regression by asserting modals/toasts actually become VISIBLE (computed
 * display), not merely present in the DOM.
 *
 * Opt-in: `npm run verify:demo` (needs a Chromium binary).
 */
"use strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
function ok(cond, msg) { console.log((cond ? "  ok  " : "FAIL  ") + msg); if (!cond) fails++; }

async function main() {
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch (e) { console.error("Playwright not installed. Run: npm i && npx playwright install chromium"); process.exit(2); }

  const distPath = path.join(__dirname, "dist", "STP-Application.html");
  if (!fs.existsSync(distPath)) { console.error("dist/STP-Application.html missing — run `npm run build:standalone` first."); process.exit(2); }
  const fileUrl = "file://" + distPath;

  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e && e.message ? e.message : e)));

  await page.goto(fileUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const vis = (el) => !!el && el.hidden === false && getComputedStyle(el).display !== "none";

  // App boots with no auth gate and the shell visible.
  const boot = await page.evaluate(() => {
    const app = document.getElementById("app");
    return {
      appVisible: !!app && app.hidden === false && getComputedStyle(app).display !== "none",
      navCount: document.querySelectorAll(".nav-item").length,
    };
  });
  ok(boot.appVisible && boot.navCount >= 12, "demo boots: app shell visible, nav populated (" + boot.navCount + " items)");

  // On boot the stray overlay/toast must be HIDDEN (the original white-box guard)
  // AND carry no inline display style (the regression that broke reveal).
  const onBoot = await page.evaluate((visSrc) => {
    const vis = eval(visSrc);
    const ov = document.getElementById("modalOverlay"), t = document.getElementById("toast");
    return {
      overlayHidden: !vis(ov),
      toastHidden: !vis(t),
      overlayInline: ov.getAttribute("style") || "",
      toastInline: t.getAttribute("style") || "",
    };
  }, "(" + vis.toString() + ")");
  ok(onBoot.overlayHidden && onBoot.toastHidden, "on boot the modal scrim + toast are hidden (no empty white box over the app)");
  ok(!/display\s*:\s*none/.test(onBoot.overlayInline) && !/display\s*:\s*none/.test(onBoot.toastInline),
    "no inline display:none left on the modal/toast (so they can be shown later)");

  // '+ New Case' opens a VISIBLE modal with the form.
  const newCase = await page.evaluate((visSrc) => {
    const vis = eval(visSrc);
    document.getElementById("navAddCase").click();
    const ov = document.getElementById("modalOverlay");
    const r = { visible: vis(ov), hasForm: /New case|f_problem/.test(document.getElementById("modal").innerHTML) };
    const c = document.querySelector("#modal [data-act=cancel]"); if (c) c.click();
    r.closed = !vis(ov);
    return r;
  }, "(" + vis.toString() + ")");
  ok(newCase.visible && newCase.hasForm, "'+ New Case' opens a VISIBLE form (the reported 'nothing happens' bug is fixed)");
  ok(newCase.closed, "closing the form hides the modal again");

  // The floating '+' (FAB) opens the same VISIBLE form.
  const fab = await page.evaluate((visSrc) => {
    const vis = eval(visSrc);
    document.getElementById("fab").click();
    const ov = document.getElementById("modalOverlay");
    const r = { visible: vis(ov) };
    const c = document.querySelector("#modal [data-act=cancel]"); if (c) c.click();
    return r;
  }, "(" + vis.toString() + ")");
  ok(fab.visible, "the floating '+' button also opens a VISIBLE form");

  // A toast notification actually becomes VISIBLE (it was also broken).
  const toast = await page.evaluate((visSrc) => {
    const vis = eval(visSrc);
    document.getElementById("btnExport").click();  // exportJSON toasts "Backup exported."
    const t = document.getElementById("toast");
    return { visible: vis(t), text: (t.textContent || "").slice(0, 40) };
  }, "(" + vis.toString() + ")");
  ok(toast.visible, "a toast notification becomes VISIBLE (" + JSON.stringify(toast.text) + ")");

  ok(pageErrors.length === 0, "no uncaught page errors in the demo" + (pageErrors.length ? ": " + pageErrors.slice(0, 3).join(" | ") : ""));

  await browser.close();
  console.log(fails === 0 ? "\nALL DEMO CHECKS PASSED" : "\n" + fails + " DEMO CHECK(S) FAILED");
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error("verify-demo crashed:", e); process.exit(1); });
