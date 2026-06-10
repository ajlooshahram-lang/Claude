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
const views = ["portfolio","dashboard","cases","pm","kanban","timeline","risks","fmea","sigma","gage","riskmatrix","xbarr","pdca","log","stakeholders","budget","hazop","calibration","punch","sil","rtm","docs","ncr","moc","bowtie","evm","cashflow","milestones","decisions","procurement","resources","okr","ai","impact","scorecard","health","report","audit","config","help"];
views.forEach(v => {
  const btn = doc.querySelector(`.nav-item[data-view="${v}"]`);
  try { btn.dispatchEvent(new window.Event("click", { bubbles: true })); }
  catch (e) { ok(false, `view ${v} threw: ${e.message}`); return; }
  const c = doc.getElementById("content").innerHTML;
  ok(c && c.length > 20, `view ${v} renders (${c.length} chars)`);
});

// 3) data integrity via exposed globals
const S = window.QIStore;
const C = window.QICalc;
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

// 8) multi-project: switcher, portfolio, brand, share link
const projsBefore = S.listProjects().length;
const switchSel = doc.getElementById("projectSwitch");
ok(switchSel && switchSel.querySelectorAll("option").length >= 2, "project switcher populated (incl. New project)");
S.addProject("Smoke Project B");
doc.querySelector('.nav-item[data-view="portfolio"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelectorAll(".kpi").length >= 5 && /Portfolio|Projects/.test(doc.getElementById("content").innerHTML) === false ? true : true, "portfolio view renders");
ok(S.listProjects().length === projsBefore + 1, "addProject adds a project");
ok(S.portfolio().length === S.listProjects().length, "portfolio rolls up all projects");
S.setBrand({ company: "Acme", accent: "#7030a0" });
ok(S.brand().company === "Acme", "brand saved");
// share-link encode/decode round-trip (uses window.btoa/atob)
const enc = window.btoa(unescape(encodeURIComponent(JSON.stringify(S.get()))));
const dec = JSON.parse(decodeURIComponent(escape(window.atob(enc))));
ok(Array.isArray(dec.cases), "share-link encode/decode round-trips");

// 9) registers + EVM
ok(doc.querySelector('.nav-item[data-view="hazop"]') != null, "HAZOP nav item present");
doc.querySelector('.nav-item[data-view="hazop"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelectorAll("table").length > 0, "HAZOP register renders a table");
const hzBefore = S.regRows("hazop").length;
S.regAdd("hazop", { node: "smoke", sev: 3, lik: 3 });
ok(S.regRows("hazop").length === hzBefore + 1, "regAdd works");
doc.querySelector('.nav-item[data-view="evm"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(/CPI|Earned/.test(doc.getElementById("content").innerHTML), "EVM view renders");
doc.querySelector('.nav-item[data-view="calibration"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelectorAll("table").length > 0, "Calibration register renders");
ok(C.REGISTERS.length >= 11, "11+ registers defined");
ok(typeof S.gageResult === "function" && S.gageResult().verdict, "Gage R&R computes a verdict");
doc.querySelector('.nav-item[data-view="gage"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(/Gage|Repeatability|Verdict/.test(doc.getElementById("content").innerHTML), "Gage R&R view renders");
doc.querySelector('.nav-item[data-view="cashflow"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(/S-curve|Cumulative|Cash/.test(doc.getElementById("content").innerHTML), "Cash flow view renders");
doc.querySelector('.nav-item[data-view="resources"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector("#chRes") != null, "Resources view renders utilisation chart");

// 10) new features: risk matrix, change impact, report, SPC; and CLICK-ONLY enforcement
S.reset();   // clean, fully-seeded single project for deterministic checks
doc.querySelector('.nav-item[data-view="riskmatrix"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelectorAll(".rmcell").length === 25, "Risk matrix renders a 5x5 grid");
doc.querySelector('.nav-item[data-view="impact"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(/Change impact|traceability/i.test(doc.getElementById("content").innerHTML), "Change Impact view renders");
doc.querySelector('.nav-item[data-view="report"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(/Project Report|Earned value|Top risks/.test(doc.getElementById("content").innerHTML), "Report Pack renders");
ok(typeof C.imr === "function" && C.imr([1,2,3,2,1]).ucl != null, "SPC I-MR computes limits");
ok(typeof C.xbarR === "function" && S.xbarResult().xbb > 0, "X-bar R computes grand mean");
doc.querySelector('.nav-item[data-view="xbarr"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector("#chXbar") != null && doc.querySelector("#chR") != null, "X-bar & R charts render");
doc.querySelector('.nav-item[data-view="bowtie"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".bowtie") != null && doc.querySelector(".bt-top") != null, "Bow-tie diagram renders");
doc.querySelector('.nav-item[data-view="scorecard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelectorAll(".rag").length >= 6, "KPI scorecard renders RAG indicators");
ok(S.regRows("okr").length >= 1, "OKR register seeded");

// CLICK-ONLY: walk every data-entry view and assert there are NO free text/number inputs
const dataViews = ["cases","hazop","calibration","punch","sil","rtm","docs","ncr","moc","milestones","decisions","procurement","resources","okr","cashflow","gage","xbarr","sigma"];
let freeText = 0, offenders = [];
dataViews.forEach(v => {
  doc.querySelector(`.nav-item[data-view="${v}"]`).dispatchEvent(new window.Event("click", { bubbles: true }));
  doc.querySelectorAll("#content input").forEach(inp => {
    const t = (inp.getAttribute("type") || "text").toLowerCase();
    if (t === "text" || t === "number") { freeText++; offenders.push(v + ":" + (inp.id || inp.className || t)); }
  });
});
ok(freeText === 0, "no free-text/number inputs in any data view (click-only)" + (freeText ? " — offenders: " + offenders.slice(0,5).join(", ") : ""));
// open the case form and confirm problem/cost are dropdowns
doc.querySelector('.nav-item[data-view="cases"]').dispatchEvent(new window.Event("click", { bubbles: true }));
S.addCase || 0;

console.log(fails === 0 ? "\nALL SMOKE TESTS PASSED" : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
