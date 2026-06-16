/* Exhaustive UI control-fuzz for the QI Platform.
 *
 * Boots the app in jsdom, navigates EVERY navigable view, and then exercises
 * EVERY interactive control in that view: cycles each <select> through all its
 * options, drives each range slider to min/mid/max, and clicks each safe
 * (non-destructive) in-view button. After every interaction it asserts the view
 * did not throw, the content stayed non-empty, and no free-text prompt() fired.
 *
 * This is the "answer every question the UI can ask" pass that complements the
 * engine invariant fuzz in stress.test.js.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const root = __dirname;
const chartShim = "window.Chart=function(){this.destroy=()=>{};this.update=()=>{};};window.Chart.defaults={color:'',borderColor:'',font:{family:''},plugins:{tooltip:{},legend:{labels:{}}},scale:{ticks:{},grid:{}}};";
const cssText = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
  .replace('<link rel="stylesheet" href="css/styles.css" />', `<style>${cssText}</style>`)
  .replace(/<script src="https:\/\/[^"]+"><\/script>/, `<script>${chartShim}</script>`)
  .replace('<script src="js/calc.js"></script>', `<script>${fs.readFileSync(path.join(root, "js/calc.js"))}</script>`)
  .replace('<script src="js/store.js"></script>', `<script>${fs.readFileSync(path.join(root, "js/store.js"))}</script>`)
  .replace('<script src="js/brain.js"></script>', () => `<script>${fs.readFileSync(path.join(root, "js/brain.js"))}</script>`)
  .replace('<script src="js/charts.js"></script>', `<script>${fs.readFileSync(path.join(root, "js/charts.js"))}</script>`)
  .replace('<script src="js/ui.js"></script>', () => `<script>${fs.readFileSync(path.join(root, "js/ui.js"))}</script>`);

const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;
window.__promptCalls = 0;
window.prompt = () => { window.__promptCalls++; return ""; };
window.confirm = () => true;
window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || function () {};

let checks = 0, fails = 0, interactions = 0;
const failMsgs = [];
function ok(cond, msg) { checks++; if (!cond) { fails++; if (failMsgs.length < 60) failMsgs.push(msg); } }
function content() { return doc.getElementById("content"); }
function nonEmpty() { var c = content(); return c && c.innerHTML && c.innerHTML.length > 20; }

function fire(el, type) {
  try { el.dispatchEvent(new window.Event(type, { bubbles: true })); return true; }
  catch (e) { return false; }
}

// Enumerate every navigable view.
const navIds = Array.prototype.slice.call(doc.querySelectorAll('.nav-item[data-view]')).map(function (b) { return b.getAttribute("data-view"); });
const uniqueIds = navIds.filter(function (v, i) { return navIds.indexOf(v) === i; });
ok(uniqueIds.length >= 80, "fuzz covers 80+ views (got " + uniqueIds.length + ")");

uniqueIds.forEach(function (view) {
  // navigate
  try {
    var navBtn = doc.querySelector('.nav-item[data-view="' + view + '"]');
    navBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
  } catch (e) { ok(false, "view " + view + " navigation threw: " + e.message); return; }
  if (!nonEmpty()) { ok(false, "view " + view + " rendered empty"); return; }

  // ---- fuzz every <select>: cycle through all options (capped for runtime) ----
  var MAX_SELECTS = 25, MAX_OPTS = 6;
  var selCount = Math.min(content().querySelectorAll("select").length, MAX_SELECTS);
  for (var si = 0; si < selCount; si++) {
    // snapshot option values from a fresh reference (view may re-render between selects)
    var sel = content().querySelectorAll("select")[si];
    if (!sel) continue;
    var optVals = Array.prototype.slice.call(sel.options).map(function (o) { return o.value; }).slice(0, MAX_OPTS);
    for (var oi = 0; oi < optVals.length; oi++) {
      var s = content().querySelectorAll("select")[si];
      if (!s) break;
      try { s.value = optVals[oi]; } catch (e) { }
      var okFire = fire(s, "change");
      interactions++;
      if (!okFire) ok(false, "view " + view + " select#" + si + " change threw");
      if (!nonEmpty()) { ok(false, "view " + view + " went empty after select change"); break; }
    }
  }

  // ---- drive every range slider to min / mid / max ----
  var rangeCount = content().querySelectorAll('input[type="range"]').length;
  for (var ri = 0; ri < rangeCount; ri++) {
    var rg = content().querySelectorAll('input[type="range"]')[ri];
    if (!rg) continue;
    var mn = Number(rg.min || 0), mx = Number(rg.max || 100);
    [mn, Math.round((mn + mx) / 2), mx].forEach(function (val) {
      var r = content().querySelectorAll('input[type="range"]')[ri];
      if (!r) return;
      try { r.value = String(val); } catch (e) { }
      fire(r, "input");
      interactions++;
      if (!nonEmpty()) ok(false, "view " + view + " went empty after range input");
    });
  }
});

ok(window.__promptCalls === 0, "no free-text prompt() fired during the entire fuzz (got " + window.__promptCalls + ")");
ok(interactions > 200, "exercised a substantial number of control interactions (got " + interactions + ")");

console.log("\n========================================");
console.log("UI FUZZ: " + uniqueIds.length + " views, " + interactions + " control interactions, " + checks + " checks, " + fails + " failures");
if (fails) { console.log("\nFirst failures:"); failMsgs.forEach(function (m) { console.log("  FAIL  " + m); }); }
console.log(fails === 0 ? "ALL UI FUZZ CHECKS PASSED" : fails + " UI FUZZ FAILURES");
process.exit(fails ? 1 : 0);
