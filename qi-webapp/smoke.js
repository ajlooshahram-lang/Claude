/* Headless smoke test: boot the app in jsdom, render every view, exercise CRUD. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
  // drop the CDN Chart.js (offline); charts guard for undefined Chart
  .replace(/<script src="https:\/\/[^"]+"><\/script>/, "<script>window.Chart=undefined;</script>")
  // inline local scripts so jsdom executes them without fetching
  .replace('<script src="js/calc.js"></script>', `<script>${fs.readFileSync(path.join(root, "js/calc.js"))}</script>`)
  .replace('<script src="js/store.js"></script>', `<script>${fs.readFileSync(path.join(root, "js/store.js"))}</script>`)
  .replace('<script src="js/charts.js"></script>', `<script>${fs.readFileSync(path.join(root, "js/charts.js"))}</script>`)
  .replace('<script src="js/ui.js"></script>', `<script>${fs.readFileSync(path.join(root, "js/ui.js"))}</script>`);

const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;

let fails = 0;
function ok(cond, msg) { console.log((cond ? "  ok  " : "FAIL  ") + msg); if (!cond) fails++; }

// 1) booted on dashboard
ok(/Total Cases/.test(doc.getElementById("content").innerHTML), "dashboard renders KPIs");
ok(doc.querySelectorAll(".nav-item").length >= 12, "nav has all items");

// 2) navigate every view (simulate clicks)
const views = ["dashboard","cases","pm","kanban","timeline","risks","fmea","sigma","pdca","log","stakeholders","budget","ai","health","audit","config","help"];
views.forEach(v => {
  const btn = doc.querySelector(`.nav-item[data-view="${v}"]`);
  try { btn.dispatchEvent(new window.Event("click", { bubbles: true })); }
  catch (e) { ok(false, `view ${v} threw: ${e.message}`); return; }
  const c = doc.getElementById("content").innerHTML;
  ok(c && c.length > 20, `view ${v} renders (${c.length} chars)`);
});

// 3) data integrity via exposed globals
const S = window.QIStore;
ok(S.validCases().length === 6, "6 seed cases");
ok(S.kpis().crit === 5, "5 critical");
ok(S.kpis().estTotal === 42500, "budget est total 42500");

// 4) add a case -> appears everywhere
const before = S.validCases().length;
S.addCase({ problem: "Smoke test case", category: "Quality / Defects", priority: "1-CRITICAL", sev: 9, occ: 9, det: 9, owner: "PM", leanMethod: "PDCA", target: "x", startDate: "2026-06-01", status: "OPEN", percent: 0, dateLogged: "2026-06-01", costCat: "Other", estCost: 1000, actCost: 0 });
ok(S.validCases().length === before + 1, "addCase increases count");
const top = S.topRisks(1)[0];
ok(top.rpn === 729 && top.problem === "Smoke test case", "new high-RPN case tops the queue (RPN 729)");

// 5) AI view reflects new case
doc.querySelector('.nav-item[data-view="ai"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(/Smoke test case/.test(doc.getElementById("content").innerHTML), "AI queue shows new case");

// 6) delete it back
S.deleteCase(top.id);
ok(S.validCases().length === before, "deleteCase restores count");

// 7) new features: kanban renders columns, audit logged, snapshot round-trip
doc.querySelector('.nav-item[data-view="kanban"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelectorAll(".kcol").length === 6, "kanban shows 6 status columns");
ok(S.auditList().length > 0, "audit log has entries");
const cnt = S.validCases().length;
const sp = S.takeSnapshot("smoke snap");
S.addCase({ problem: "temp", category: "Process / Flow", priority: "4-LOW", sev: 1, occ: 1, det: 1, owner: "PM", leanMethod: "5S", target: "x", startDate: "2026-06-01", status: "OPEN", percent: 0 });
S.restoreSnapshot(sp.id);
ok(S.validCases().length === cnt, "snapshot restore reverts changes");
doc.querySelector('.nav-item[data-view="audit"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(/Change history/.test(doc.getElementById("content").innerHTML), "audit view renders history");
ok(typeof S.paretoRPN === "function" && S.paretoRPN().length >= 0, "pareto available");
ok(S.controlChartData().mean !== undefined, "control chart data available");

console.log(fails === 0 ? "\nALL SMOKE TESTS PASSED" : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
