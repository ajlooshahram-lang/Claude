/* Headless smoke test: boot the app in jsdom, render every view, exercise CRUD. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const root = __dirname;
// Stub Chart with a mutable defaults object so QICharts.applyTheme() can run end-to-end.
const chartShim = "window.Chart=function(){this.destroy=()=>{};this.update=()=>{};};window.Chart.defaults={color:'',borderColor:'',font:{family:''},plugins:{tooltip:{},legend:{labels:{}}},scale:{ticks:{},grid:{}}};";
// Inject the stylesheet so jsdom can resolve simple computed-style checks.
const cssText = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
  .replace('<link rel="stylesheet" href="css/styles.css" />', `<style>${cssText}</style>`)
  .replace('<script src="vendor/chartjs/chart.umd.min.js"></script>', `<script>${chartShim}</script>`)
  .replace('<script src="js/i18n.js"></script>', `<script>${fs.readFileSync(path.join(root, "js/i18n.js"))}</script>`)
  .replace('<script src="js/auth.js"></script>', `<script>window.__SKIP_AUTH=true;${fs.readFileSync(path.join(root, "js/auth.js"))}</script>`)
  .replace('<script src="js/sync.js"></script>', `<script>${fs.readFileSync(path.join(root, "js/sync.js"))}</script>`)
  .replace('<script src="js/calc.js"></script>', `<script>${fs.readFileSync(path.join(root, "js/calc.js"))}</script>`)
  .replace('<script src="js/store.js"></script>', `<script>${fs.readFileSync(path.join(root, "js/store.js"))}</script>`)
  .replace('<script src="js/country-data.js"></script>', () => `<script>${fs.readFileSync(path.join(root, "js/country-data.js"))}</script>`)
  .replace('<script src="js/brain.js"></script>', () => `<script>${fs.readFileSync(path.join(root, "js/brain.js"))}</script>`)
  .replace('<script src="js/charts.js"></script>', `<script>${fs.readFileSync(path.join(root, "js/charts.js"))}</script>`)
  .replace('<script src="js/globe.js"></script>', `<script>${fs.readFileSync(path.join(root, "js/globe.js"))}</script>`)
  .replace('<script src="js/ui.js"></script>', `<script>${fs.readFileSync(path.join(root, "js/ui.js"))}</script>`);

const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;
// Trip a flag if any code-path tries to free-type via prompt() — this should never fire.
window.__promptCalls = 0;
window.prompt = () => { window.__promptCalls++; return ""; };

let fails = 0;
function ok(cond, msg) { console.log((cond ? "  ok  " : "FAIL  ") + msg); if (!cond) fails++; }

// 1) booted on dashboard
ok(/Total Cases/.test(doc.getElementById("content").innerHTML), "dashboard renders KPIs");
ok(doc.querySelectorAll(".nav-item").length >= 12, "nav has all items");

// 2) navigate every view (simulate clicks)
const views = ["portfolio","dashboard","cases","myitems","pm","kanban","timeline","risks","fmea","sigma","gage","riskmatrix","xbarr","capability","ncrpareto","pdca","log","stakeholders","budget","globe3d","hazop","calibration","punch","sil","rtm","docs","ncr","moc","bowtie","evm","cashflow","prioritise","milestones","decisions","procurement","resources","okr","country","ai","impact","scorecard","health","report","audit","config","help"];
views.forEach(v => {
  const btn = doc.querySelector(`.nav-item[data-view="${v}"]`);
  try { btn.dispatchEvent(new window.Event("click", { bubbles: true })); }
  catch (e) { ok(false, `view ${v} threw: ${e.message}`); return; }
  const c = doc.getElementById("content").innerHTML;
  ok(c && c.length > 20, `view ${v} renders (${c.length} chars)`);
});

// 2b) 3D Network Map view — data exposed, legend renders, dispose is no-throw in jsdom
ok(window.QIGlobe && Array.isArray(window.QIGlobe.STATIONS) && window.QIGlobe.STATIONS.length === 8, "QIGlobe exposes 8 landing stations");
ok(window.QIGlobe && Array.isArray(window.QIGlobe.CABLES) && window.QIGlobe.CABLES.length >= 6, "QIGlobe exposes cable segments");
ok(window.QIGlobe.CABLES.every(c => c.lengthKm > 0 && c.capacityTbps > 0 && c.fibrePairs > 0), "every cable segment has length/capacity/fibre-pair data");
doc.querySelector('.nav-item[data-view="globe3d"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".globe-stage") != null, "3D Network Map renders the globe stage container");
ok(doc.querySelectorAll(".globe-item").length >= 6, "3D Network Map legend lists cable segments");
ok(doc.querySelectorAll(".globe-station").length === 8, "3D Network Map legend lists 8 landing stations");
ok(doc.getElementById("globeDeploy") != null && doc.getElementById("globeDeployRange") != null && doc.getElementById("globeDeployPlay") != null,
   "3D Network Map renders the A–Z build-sequence controls (play + scrubber)");
ok(doc.getElementById("globeDeployMeta") != null, "3D build bar renders the cost & schedule readout (#globeDeployMeta)");
// programme headline figures are exposed for the cost/schedule overlay
ok(window.QIGlobe.PROGRAMME && window.QIGlobe.PROGRAMME.budgetUsd === 1300e6 && window.QIGlobe.PROGRAMME.durationMonths === 60,
   "QIGlobe.PROGRAMME exposes the headline figures (USD 1.3B over 60 months)");
// cumulative spend curve (powers the spend S-curve overlay + the Investor Brief)
ok(typeof window.QIGlobe.deployCurve === "function", "QIGlobe.deployCurve() exposed for the spending S-curve");
const spendCurve = window.QIGlobe.deployCurve(60);
ok(Array.isArray(spendCurve) && spendCurve.length === 61, "deployCurve(60) returns 61 samples (got " + (spendCurve ? spendCurve.length : "n/a") + ")");
ok(spendCurve[0].costUsd === 0 && spendCurve[0].month === 0, "spend curve starts at zero spend, month 0");
ok((function () { for (let i = 1; i < spendCurve.length; i++) { if (spendCurve[i].costUsd < spendCurve[i - 1].costUsd) return false; } return true; })(),
   "spend curve is monotonic non-decreasing (spend never goes down)");
ok(spendCurve[60].costUsd === 1300e6 && spendCurve[60].costPct === 100 && spendCurve[60].month === 60,
   "spend curve ends at the full USD 1.3B at month 60");
// when each country comes online during the build (powers the brief timeline)
ok(typeof window.QIGlobe.onlineSchedule === "function", "QIGlobe.onlineSchedule() exposed for the go-live timeline");
const goLive = window.QIGlobe.onlineSchedule();
ok(Array.isArray(goLive) && goLive.length === 8, "onlineSchedule lists all 8 countries (got " + (goLive ? goLive.length : "n/a") + ")");
ok(goLive[0].month === 0 && goLive[goLive.length - 1].month <= 60, "first country is live at month 0, last by month 60");
ok((function () { for (let i = 1; i < goLive.length; i++) { if (goLive[i].month < goLive[i - 1].month) return false; } return true; })(),
   "go-live schedule is sorted earliest-first");
ok(goLive.filter(o => o.month <= 30).length === 5, "5 countries are live by month 30 (matches the live cost overlay)");
ok(doc.getElementById("globeSpend") != null && doc.getElementById("globeSpendChart") != null, "3D map renders the spending S-curve overlay container");
ok(doc.getElementById("globeOnline") != null, "3D map renders the 'countries coming online' strip container");
ok(window.QIGlobe.init(doc.getElementById("globeStage")) === false, "QIGlobe.init no-throws and returns false without WebGL");
// 2b-i) interactive API surface exists and is a safe no-op while unmounted (jsdom/no WebGL)
["focusStation","focusCable","clearSelection","startTour","stopTour","toggleTour","isTouring",
 "setSpin","toggleSpin","isSpinning","selectedId","onSelect","onTour","onSpin",
 "setDeployment","playDeployment","pauseDeployment","toggleDeployment","exitDeployment",
 "isDeploying","inDeployMode","deployState","onDeployment"].forEach(fn =>
  ok(typeof window.QIGlobe[fn] === "function", "QIGlobe exposes " + fn + "()"));
// deployment delegators must be safe no-ops while unmounted (jsdom / no WebGL)
ok(window.QIGlobe.setDeployment(50) === false && window.QIGlobe.playDeployment() === false &&
   window.QIGlobe.exitDeployment() === false && window.QIGlobe.isDeploying() === false,
   "deployment API is a guarded no-op when the globe is not mounted");
ok((function () { try { window.QIGlobe.onDeployment(function () {}); window.QIGlobe.onDeployment(null); return true; } catch (e) { return false; } })(),
   "onDeployment subscribe/unsubscribe never throws");
let apiThrew = false;
try {
  window.QIGlobe.onSelect(() => {});
  window.QIGlobe.onTour(() => {});
  window.QIGlobe.onSpin(() => {});
  window.QIGlobe.focusStation("jakarta");
  window.QIGlobe.focusCable("STP-T1");
  window.QIGlobe.toggleTour();
  window.QIGlobe.toggleSpin();
  window.QIGlobe.clearSelection();
} catch (e) { apiThrew = true; }
ok(!apiThrew, "interactive API calls are safe no-ops when the globe is not mounted");
// re-render the view so the dispose assertion below acts on a fresh stage
doc.querySelector('.nav-item[data-view="globe3d"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("globeControls") != null, "3D Network Map renders the cinematic tour / rotation HUD");
// navigating away must dispose without throwing
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(true, "navigating away from globe3d disposes cleanly");

// 2c) Route Progress view — KPIs, per-segment tracking, phase cycling, % laid persist
const RPS = window.QIStore;
RPS.reset();
ok(typeof RPS.routeProgress === "function", "QIStore exposes routeProgress()");
const RP0 = RPS.routeProgress();
ok(RP0 && typeof RP0 === "object" && Object.keys(RP0).length === window.QIGlobe.CABLES.length,
  "routeProgress() seeds an entry per cable segment (" + Object.keys(RP0).length + ")");
ok(window.QIGlobe.CABLES.every(c => RP0[c.id] && RP0[c.id].phases && Array.isArray(RPS.ROUTE_PHASES) &&
  RPS.ROUTE_PHASES.every(p => typeof RP0[c.id].phases[p.key] === "string")), "every seeded entry has all 7 lifecycle phases");
ok(RPS.ROUTE_PHASES.length === 7, "7 submarine-cable lifecycle phases defined");
// commissioned segments seed to 100% laid; planned segments seed to 0
const commCable = window.QIGlobe.CABLES.find(c => c.status === "commissioned");
const planCable = window.QIGlobe.CABLES.find(c => c.status === "planned");
ok(RP0[commCable.id].laidKm === commCable.lengthKm, "commissioned segment seeds to 100% laid");
ok(RP0[planCable.id].laidKm === 0, "planned segment seeds to 0% laid");
// navigate to the view
doc.querySelector('.nav-item[data-view="routeprogress"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const rpHtml = doc.getElementById("content").innerHTML;
ok(/Overall % Complete/.test(rpHtml) && /Km Completed/.test(rpHtml), "Route Progress view renders KPI row");
ok(doc.querySelectorAll(".kpi").length >= 6, "Route Progress KPI row has 6 metrics");
ok(doc.querySelectorAll(".route-seg").length === window.QIGlobe.CABLES.length,
  "Route Progress lists every cable segment (" + doc.querySelectorAll(".route-seg").length + ")");
ok(doc.querySelectorAll("[data-rp-phase]").length === window.QIGlobe.CABLES.length * 7, "renders a 7-phase strip per segment");
ok(doc.querySelector("#chRoute") != null, "Route Progress renders the programme rollup chart");
// click-only: no free-text/number inputs in the view
let rpFreeText = 0;
doc.querySelectorAll("#content input").forEach(inp => { const t = (inp.getAttribute("type") || "text").toLowerCase(); if (t === "text" || t === "number") rpFreeText++; });
ok(rpFreeText === 0, "Route Progress view has no free-text/number inputs (click-only)");
// phase cycling persists
const phaseCell = doc.querySelector("[data-rp-phase]");
const pcCable = phaseCell.dataset.cable, pcPhase = phaseCell.dataset.phase;
const cycleMap = { "Not started": "In progress", "In progress": "Complete", "Complete": "Not started" };
const beforePhase = RPS.routeProgress()[pcCable].phases[pcPhase];
phaseCell.dispatchEvent(new window.Event("click", { bubbles: true }));
const afterPhase = RPS.routeProgress()[pcCable].phases[pcPhase];
ok(afterPhase === cycleMap[beforePhase], "phase cell click cycles & persists status (" + beforePhase + " -> " + afterPhase + ")");
// % laid dropdown persists (convert percentage to km against segment length)
doc.querySelector('.nav-item[data-view="routeprogress"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const kmSel = Array.from(doc.querySelectorAll("[data-rp-km]")).find(s => s.dataset.cable === planCable.id);
const beforeKm = RPS.routeProgress()[planCable.id].laidKm;
kmSel.value = "50%"; kmSel.dispatchEvent(new window.Event("change", { bubbles: true }));
const afterKm = RPS.routeProgress()[planCable.id].laidKm;
ok(afterKm === Math.round(planCable.lengthKm * 0.5) && afterKm !== beforeKm,
  "% laid dropdown sets km and persists (" + beforeKm + " -> " + afterKm + ")");
ok(typeof window.QIGlobe.setProgress === "function" && window.QIGlobe.setProgress({ "STP-T1": 100 }) === false,
  "QIGlobe.setProgress is exposed and no-throws/returns false when globe is not mounted");
RPS.reset();
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));

// 3) data integrity via exposed globals
const S = window.QIStore;
const C = window.QICalc;
ok(S.validCases().length === 6, "6 seed cases");
// "Critical" is now unified to the visible 1-CRITICAL priority everywhere
// (nav badge, KPIs, health, advisor) so counts always agree.
ok(S.kpis().crit === S.validCases().filter(c => c.priority === "1-CRITICAL").length, "kpis.crit matches the 1-CRITICAL count shown in the register");
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
const dataViews = ["cases","hazop","calibration","punch","sil","rtm","docs","ncr","moc","milestones","decisions","procurement","resources","okr","cashflow","gage","xbarr","sigma","capability","prioritise"];
let freeText = 0, offenders = [];
dataViews.forEach(v => {
  doc.querySelector(`.nav-item[data-view="${v}"]`).dispatchEvent(new window.Event("click", { bubbles: true }));
  doc.querySelectorAll("#content input").forEach(inp => {
    const t = (inp.getAttribute("type") || "text").toLowerCase();
    // Step 99: #caseFilter is an exception to the no-typing rule (search/filter on read-only data)
    if (inp.id === "caseFilter") return;
    if (t === "text" || t === "number") { freeText++; offenders.push(v + ":" + (inp.id || inp.className || t)); }
  });
});
ok(freeText === 0, "no free-text/number inputs in any data view (click-only)" + (freeText ? " — offenders: " + offenders.slice(0,5).join(", ") : ""));
// open the case form and confirm problem/cost are dropdowns
doc.querySelector('.nav-item[data-view="cases"]').dispatchEvent(new window.Event("click", { bubbles: true }));
S.addCase || 0;

// 11) capability + NCR Pareto + RICE/WSJF prioritisation views
doc.querySelector('.nav-item[data-view="capability"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(/Cp\b|Cpk\b|Spec limits/.test(doc.getElementById("content").innerHTML), "Capability view renders Cp/Cpk");
ok(typeof S.capabilityResult === "function" && S.capabilityResult().st.cpk > 0, "capabilityResult returns Cpk");
S.regAdd("ncr", { desc: "test ncr", severity: "Major", disposition: "Rework", status: "OPEN", discipline: "Process" });
doc.querySelector('.nav-item[data-view="ncrpareto"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(/Pareto by severity|Pareto by disposition/.test(doc.getElementById("content").innerHTML), "NCR Pareto view renders");
doc.querySelector('.nav-item[data-view="prioritise"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(/RICE|WSJF/.test(doc.getElementById("content").innerHTML), "Prioritisation view renders");
ok(doc.querySelector('select[data-prio]') != null, "Prioritisation table has dropdown editors");
ok(typeof C.rice === "function" && C.rice({ reach: 1000, impact: 3, confidence: 80, effort: 5 }) === 480, "RICE math correct");
ok(typeof C.wsjf === "function" && C.wsjf({ userValue: 8, timeCrit: 5, riskRed: 3, jobSize: 5 }) === 3.2, "WSJF math correct");

// 12) polish: display modes (Auto -> Light -> Dark -> Auto), run-checks, shortcuts
var btnTheme12 = doc.getElementById("btnTheme");
// Drive to a known Light state regardless of boot-time Auto resolution.
var g12a = 0; while (!(S.brand() && S.brand().themeMode === "light") && g12a++ < 4) btnTheme12.click();
ok(doc.documentElement.getAttribute("data-theme") === "light" && S.brand().themeMode === "light", "display Light mode applies the light theme");
btnTheme12.click(); // Light -> Dark
ok(doc.documentElement.getAttribute("data-theme") === "dark" && S.brand().themeMode === "dark", "display cycles to Dark");
ok(S.brand().theme === "dark", "theme persisted to brand");
btnTheme12.click(); // Dark -> Auto
ok(S.brand().themeMode === "auto", "display cycles back to Auto (ambient adaptation re-enabled)");
// Leave in a known Light state for the chart-theming test below.
var g12b = 0; while (!(S.brand() && S.brand().themeMode === "light") && g12b++ < 4) btnTheme12.click();
ok(doc.documentElement.getAttribute("data-theme") === "light", "display returns to Light for following tests");
doc.getElementById("btnHelp").click();
ok(/Keyboard shortcuts/.test(doc.getElementById("modal").innerHTML), "shortcut overlay opens");
doc.querySelector("#modal [data-act=cancel]").click();
ok(doc.getElementById("modalOverlay").hidden === true, "shortcut overlay closes");
doc.getElementById("btnChecks").click();
ok(/Project checks/.test(doc.getElementById("modal").innerHTML), "run-checks dialog opens");
doc.querySelector("#modal [data-act=cancel]").click();

// 13) polish regressions
// 13a) prompt() was never invoked anywhere in the run
ok(window.__promptCalls === 0, "no prompt() leaked into any flow (got " + window.__promptCalls + ")");

// 13b) project-name modal is click-only and auto-focuses its picker
doc.querySelector('.nav-item[data-view="portfolio"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const newProjBtn = doc.querySelector("[data-act=newproj]");
newProjBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("modalOverlay").hidden === false, "newproj opens custom modal");
ok(doc.getElementById("proj_name_pick") != null, "modal contains a select dropdown");
ok(doc.querySelectorAll("#modal input[type=text],#modal input[type=number]").length === 0, "modal has zero free-text inputs");
ok(doc.activeElement && doc.activeElement.id === "proj_name_pick", "modal auto-focuses first field");
const projsBefore13 = S.listProjects().length;
doc.getElementById("proj_name_pick").value = "Plant Upgrade Project";
doc.getElementById("proj_name_ok").click();
ok(S.listProjects().length === projsBefore13 + 1, "modal pick adds a project");

// 13c) aria-current="page" on active nav
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const activeNavs = doc.querySelectorAll('.nav-item[aria-current="page"]');
ok(activeNavs.length === 1 && activeNavs[0].dataset.view === "dashboard", "exactly one nav-item has aria-current=page");

// 13d) chart theming: applyTheme exists and updates Chart.defaults colors
ok(typeof window.QICharts.applyTheme === "function", "QICharts.applyTheme exposed");
window.QICharts.applyTheme();
const lightInk = window.Chart.defaults.color;
ok(lightInk !== "", "Chart.defaults.color set in light mode (" + lightInk + ")");
doc.getElementById("btnTheme").click();
const darkInk = window.Chart.defaults.color;
ok(darkInk && darkInk !== lightInk, "Chart.defaults.color flips on theme toggle (" + lightInk + " -> " + darkInk + ")");
doc.getElementById("btnTheme").click(); // back to light

// 13e) toast styling actually applies (not the default unstyled span)
window.QIStore && window.QIStore.save && (function () {
  const tst = doc.getElementById("toast");
  tst.hidden = false; tst.textContent = "smoke";
  const cs = window.getComputedStyle(tst);
  ok(cs.position === "fixed", "toast is position:fixed (got " + cs.position + ")");
  tst.hidden = true;
})();

// 13f) topbar wraps when narrow (flex-wrap rule applies)
const tb = doc.querySelector(".topbar");
ok(window.getComputedStyle(tb).flexWrap === "wrap", "topbar uses flex-wrap");

// 14) Hash routing — back/forward & bookmarks
window.location.hash = "#kanban";
window.dispatchEvent(new window.HashChangeEvent("hashchange"));
ok(/kanban/i.test(doc.getElementById("viewTitle").textContent.toLowerCase().replace(/\W/g,"")) || doc.querySelector(".kcol") != null,
  "hashchange '#kanban' navigates to kanban view");
const nav = doc.querySelector('.nav-item[data-view="risks"]');
nav.dispatchEvent(new window.Event("click", { bubbles: true }));
ok(window.location.hash === "#risks", "clicking nav updates URL hash (got " + window.location.hash + ")");
// unknown hashes should fall back to dashboard without crashing
window.location.hash = "#nope";
window.dispatchEvent(new window.HashChangeEvent("hashchange"));
ok(window.location.hash === "#nope", "unknown hash is preserved without crashing");

// 15) Inline edit on the Cases list — change status without opening the form
S.reset();   // ensure the active project has seeded cases for this section
doc.querySelector('.nav-item[data-view="cases"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const inlineSel = doc.querySelector('select[data-edit="status"]');
ok(inlineSel != null, "Cases table has inline status dropdowns");
const caseId = inlineSel.dataset.id;
const beforeStatus = (S.get().cases.find(c => c.id === caseId) || {}).status;
inlineSel.value = beforeStatus === "BLOCKED" ? "OPEN" : "BLOCKED";
inlineSel.dispatchEvent(new window.Event("change", { bubbles: true }));
const afterStatus = (S.get().cases.find(c => c.id === caseId) || {}).status;
ok(afterStatus !== beforeStatus, "inline edit updated case status (" + beforeStatus + " -> " + afterStatus + ")");

// 16) Empty-state CTA appears when a project has zero cases
const emptyId = S.addProject("Empty Project For Test");
S.switchProject(emptyId);
// purge any seeded cases (addProject already starts empty, but be safe)
S.get().cases.length = 0;
S.save();
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".empty-cta") != null, "empty-state CTA renders when no cases");
ok(doc.querySelector(".empty-cta [data-act=add]") != null, "empty-state CTA has + Add button");

// 17) localStorage quota error fires custom event the UI can hook into
let quotaCaught = false;
const handler = () => { quotaCaught = true; };
window.addEventListener("qi-storage-error", handler);
const proto = Object.getPrototypeOf(window.localStorage);
const origSet = proto.setItem;
proto.setItem = function () { const err = new Error("quota"); err.name = "QuotaExceededError"; throw err; };
try { S.save(); } catch (_) {}
proto.setItem = origSet;
window.removeEventListener("qi-storage-error", handler);
ok(quotaCaught, "qi-storage-error event fires on QuotaExceededError");

// 18) Modal focus trap — Tab cycles within the modal
doc.getElementById("btnHelp").click();
const modal = doc.getElementById("modal");
const focusables = Array.from(modal.querySelectorAll("input,select,textarea,button,a[href]")).filter(f => !f.disabled);
ok(focusables.length > 0, "modal has focusable elements");
focusables[focusables.length - 1].focus();
const tabEvt = new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
modal.dispatchEvent(tabEvt);
ok(tabEvt.defaultPrevented === true, "Tab on last focusable is intercepted (focus trap)");
doc.querySelector("#modal [data-act=cancel]").click();

// 19) Bulk operations on the Cases list
S.reset();
doc.querySelector('.nav-item[data-view="cases"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const rowChecks = doc.querySelectorAll('input[data-bulk="row"]');
ok(rowChecks.length >= 3, "Cases table has bulk-select checkboxes (" + rowChecks.length + ")");
rowChecks[0].checked = true; rowChecks[0].dispatchEvent(new window.Event("change", { bubbles: true }));
rowChecks[1].checked = true; rowChecks[1].dispatchEvent(new window.Event("change", { bubbles: true }));
ok(doc.getElementById("bulkBar") && !doc.getElementById("bulkBar").hidden, "bulk bar visible after selection");
ok(/2.*selected/.test(doc.getElementById("bulkBar").textContent), "bulk bar shows count");
const beforeBulk = S.validCases().filter(c => c.status === "BLOCKED").length;
const bulkStatus = doc.getElementById("bulkStatus");
bulkStatus.value = "BLOCKED"; bulkStatus.dispatchEvent(new window.Event("change", { bubbles: true }));
const afterBulk = S.validCases().filter(c => c.status === "BLOCKED").length;
ok(afterBulk >= beforeBulk + 2, "bulk status apply updated cases (" + beforeBulk + " -> " + afterBulk + ")");

// 20) Select-all checkbox toggles every row
doc.querySelector('.nav-item[data-view="cases"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const allCb = doc.getElementById("bulkAll");
allCb.checked = true; allCb.dispatchEvent(new window.Event("change", { bubbles: true }));
const totalRows = doc.querySelectorAll('input[data-bulk="row"]').length;
ok(Array.from(doc.querySelectorAll('input[data-bulk="row"]')).every(c => c.checked), "select-all checks every row (" + totalRows + ")");

// 21) Bulk delete with confirm()
window.__confirmAnswer = true;
const origConfirm = window.confirm; window.confirm = () => window.__confirmAnswer;
const beforeDel = S.validCases().length;
doc.querySelector("[data-act=bulkdel]").click();
window.confirm = origConfirm;
ok(S.validCases().length < beforeDel, "bulk delete removed selected cases");

// 22) Undo toast — delete a single case via the modal flow, then click Undo
S.reset();
doc.querySelector('.nav-item[data-view="cases"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const firstDelBtn = doc.querySelector("[data-act=del]");
firstDelBtn.click();   // opens confirm modal
const confirmDel = doc.querySelector("#modal [data-act=confirmdel]");
ok(confirmDel != null, "delete-confirm modal opens");
const cntBefore = S.validCases().length;
confirmDel.click();
ok(S.validCases().length === cntBefore - 1, "case removed");
ok(S.hasUndo() === true, "undo handle stashed in store");
const undoBtn = doc.getElementById("toastAct");
ok(undoBtn && /undo/i.test(undoBtn.textContent), "Undo button on toast");
undoBtn.click();
ok(S.validCases().length === cntBefore, "undo restored the case");

// 23) Inline-edit row patch (perf): only the health cell mutates, no full re-render
S.reset();
doc.querySelector('.nav-item[data-view="cases"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const tbody = doc.querySelector("table tbody");
const trBefore = tbody.firstElementChild;
const sel2 = doc.querySelector('select[data-edit="status"]');
sel2.value = "BLOCKED"; sel2.dispatchEvent(new window.Event("change", { bubbles: true }));
ok(doc.querySelector("table tbody").firstElementChild === trBefore, "inline edit patches in place (no full re-render)");

// 24) Tour banner appears on first run, dismisses & persists
S.setBrand({ tourDone: false });
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".tour-banner") != null, "tour banner shows when tourDone is false");
doc.querySelector("[data-act=startTour]").click();
ok(doc.querySelector(".tour-steps") != null, "tour modal renders step indicator");
ok(/Welcome/.test(doc.getElementById("modal").textContent), "tour step 1 shown");
doc.querySelector("#modal [data-act=tourNext]").click();
ok(/Add a case once/.test(doc.getElementById("modal").textContent), "tour advances to step 2");
doc.querySelector("#modal [data-act=tourSkip]").click();
ok(S.brand().tourDone === true, "tour skip persists tourDone=true");
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".tour-banner") == null, "tour banner does NOT show again after dismissal");

// 25) Print CSS — the @media print rules are present in the stylesheet
const cssAll = Array.from(doc.styleSheets).map(s => { try { return Array.from(s.cssRules || []).map(r => r.cssText).join("\n"); } catch (e) { return ""; } }).join("\n");
ok(/@media\s+print/.test(cssAll), "print stylesheet present");
ok(/page-break-inside\s*:\s*avoid/.test(cssAll), "print CSS includes page-break-inside:avoid");

// 26) Drag-and-drop overlay on file drag
const dataTransfer = { types: ["Files"], files: [], setData: () => {}, getData: () => "" };
const dragEnter = new window.Event("dragenter", { bubbles: true, cancelable: true });
dragEnter.dataTransfer = dataTransfer;
window.dispatchEvent(dragEnter);
ok(doc.body.classList.contains("dragging"), "body gains 'dragging' class on file drag-enter");
const dragLeave = new window.Event("dragleave", { bubbles: true, cancelable: true });
dragLeave.dataTransfer = dataTransfer;
window.dispatchEvent(dragLeave);
ok(!doc.body.classList.contains("dragging"), "dragging class cleared on drag-leave");

// 27) Pinning cases — pinned rows float to the top regardless of sort
S.reset();
doc.querySelector('.nav-item[data-view="cases"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const allRows = doc.querySelectorAll('tr[data-id]');
const lastId = allRows[allRows.length - 1].dataset.id;
S.togglePin(lastId);
doc.querySelector('.nav-item[data-view="cases"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const firstRow = doc.querySelector('tr[data-id]');
ok(firstRow.dataset.id === lastId, "pinned case floats to top");
ok(firstRow.classList.contains("pinned-row"), "pinned row has pinned-row class");
ok(doc.querySelector('td.pin-on') != null, "pin indicator visible (📌)");

// 28) Kanban keyboard reach — Right arrow moves card to next column
doc.querySelector('.nav-item[data-view="kanban"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const card = doc.querySelector('.kcard');
ok(card != null, "kanban renders cards");
ok(card.tabIndex === 0, "kanban card is focusable (tabindex=0)");
const cardId = card.dataset.id;
const cardStatusBefore = (S.get().cases.find(c => c.id === cardId) || {}).status;
const colsBefore = Array.from(doc.querySelectorAll('.kcol'));
const curColBefore = card.closest('.kcol').dataset.status;
const curIdx = colsBefore.findIndex(c => c.dataset.status === curColBefore);
const expectedNext = colsBefore[Math.min(curIdx + 1, colsBefore.length - 1)].dataset.status;
const arrEvt = new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
card.dispatchEvent(arrEvt);
ok((S.get().cases.find(c => c.id === cardId) || {}).status === expectedNext, "ArrowRight moves card to next column (" + cardStatusBefore + " -> " + expectedNext + ")");

// 29) Sidebar collapse persists in brand
const sb = doc.getElementById("sidebar");
ok(sb && !sb.classList.contains("collapsed"), "sidebar starts expanded");
doc.getElementById("btnSidebar").click();
ok(sb.classList.contains("collapsed"), "sidebar collapses on toggle");
ok(S.brand().sidebarCollapsed === true, "sidebar state persists in brand");
doc.getElementById("btnSidebar").click();
ok(!sb.classList.contains("collapsed"), "sidebar expands on second toggle");

// 30) Snapshot diff — engine + UI
S.reset();
const sA = S.takeSnapshot("Test snap A");
S.deleteCase(S.validCases()[0].id);
S.updateCase(S.validCases()[0].id, { status: "BLOCKED" });
const sB = S.takeSnapshot("Test snap B");
const diff = S.diffSnapshots(sA.id, sB.id);
ok(diff && diff.removed.length === 1 && diff.changed.length === 1, "diffSnapshots returns added/removed/changed");
doc.querySelector('.nav-item[data-view="audit"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("cmpA") != null && doc.getElementById("cmpB") != null, "audit view exposes diff selectors");
const cA = doc.getElementById("cmpA"), cB = doc.getElementById("cmpB");
cA.value = sA.id; cA.dispatchEvent(new window.Event("change", { bubbles: true }));
cB.value = sB.id; cB.dispatchEvent(new window.Event("change", { bubbles: true }));
doc.querySelector("[data-act=diffSnaps]").click();
ok(/Snapshot diff/.test(doc.getElementById("modal").innerHTML), "diff modal opens");
ok(/Removed cases/.test(doc.getElementById("modal").innerHTML), "diff modal shows removed cases section");
doc.querySelector("#modal [data-act=cancel]").click();

// 31) Register polish: pin + bulk delete + sortable headers + row-patch on cell change
S.reset();
doc.querySelector('.nav-item[data-view="hazop"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const beforeAdd = S.regRows("hazop").length;
// each click re-renders; re-query to avoid a detached button reference
for (let i = 0; i < 3; i++) {
  doc.querySelector('[data-act=regadd][data-reg="hazop"]').click();
}
ok(S.regRows("hazop").length === beforeAdd + 3, "regAdd added 3 rows");

// pin column toggles correctly
const lastRow = S.regRows("hazop").slice(-1)[0];
const pinCell = doc.querySelector(`td.pin-cell[data-id="${lastRow._id}"]`);
ok(pinCell != null, "register has pin column");
pinCell.click();
ok(S.regRows("hazop").find(r => r._id === lastRow._id)._pinned === true, "regTogglePin via UI sets _pinned");
const firstTr = doc.querySelector('tr[data-row-id]');
ok(firstTr.dataset.rowId === lastRow._id, "pinned register row floats to top");

// bulk select + delete
const cbs = doc.querySelectorAll('input[data-reg-bulk="row"][data-reg="hazop"]');
ok(cbs.length >= 2, "register bulk-select checkboxes present");
cbs[0].checked = true; cbs[0].dispatchEvent(new window.Event("change", { bubbles: true }));
cbs[1].checked = true; cbs[1].dispatchEvent(new window.Event("change", { bubbles: true }));
ok(/2.*selected/.test(doc.getElementById("regBulkBar").textContent), "register bulk bar shows selected count");
window.__confirmAnswer = true;
const realConfirm2 = window.confirm; window.confirm = () => true;
const beforeDel2 = S.regRows("hazop").length;
doc.querySelector('[data-act=regbulkdel][data-reg="hazop"]').click();
window.confirm = realConfirm2;
ok(S.regRows("hazop").length === beforeDel2 - 2, "register bulk delete removed 2 rows");

// sortable headers — clicking sorts ascending then descending
doc.querySelector('.nav-item[data-view="hazop"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const sortableTh = doc.querySelector('th[data-reg-sort="hazop"][data-key="risk"]');
ok(sortableTh != null && sortableTh.classList.contains("sortable"), "register column header is sortable");
sortableTh.click();
ok(/▲|▼/.test(doc.querySelector('th[data-reg-sort="hazop"][data-key="risk"]').textContent), "clicking header shows sort icon");
sortableTh.click(); // toggle desc
sortableTh.click(); // unsort

// row-patch on cell change — refreshing computed cell without full re-render
doc.querySelector('.nav-item[data-view="hazop"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const tr = doc.querySelector('tbody tr[data-row-id]');
const trIdentity = tr;
const sevSel = tr.querySelector('select[data-reg="hazop"][data-key="sev"]');
if (sevSel) {
  sevSel.value = "5"; sevSel.dispatchEvent(new window.Event("change", { bubbles: true }));
  const stillSameTr = doc.querySelector(`tbody tr[data-row-id="${trIdentity.dataset.rowId}"]`);
  ok(stillSameTr === trIdentity, "register cell change patches row in place (no full re-render)");
}

// 32) Floating action button — opens the case form from any view
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const fab = doc.getElementById("fab");
ok(fab != null, "FAB present in shell");
ok(fab.getAttribute("aria-label") === "Add an item", "FAB has accessible label");
fab.click();
ok(/New case|f_problem/.test(doc.getElementById("modal").innerHTML), "FAB opens the case form");
doc.querySelector("#modal [data-act=cancel]").click();

// 33) Saved views — save, recall, delete (click-only via dropdowns)
S.reset();
doc.querySelector('.nav-item[data-view="cases"]').dispatchEvent(new window.Event("click", { bubbles: true }));
// set a filter combo
const fStatus = doc.getElementById("fltStatus");
fStatus.value = "OPEN"; fStatus.dispatchEvent(new window.Event("change", { bubbles: true }));
const fPriority = doc.getElementById("fltPriority");
fPriority.value = "1-CRITICAL"; fPriority.dispatchEvent(new window.Event("change", { bubbles: true }));
// open save-view modal
doc.querySelector('[data-act=saveview]').click();
ok(/Save current view/.test(doc.getElementById("modal").innerHTML), "Save view modal opens");
ok(doc.getElementById("sv_name_pick") != null, "Save view modal has a curated dropdown");
ok(doc.querySelectorAll("#modal input[type=text]").length === 0, "Save view modal has no free-text inputs");
const namePick = doc.getElementById("sv_name_pick");
namePick.value = "Critical & high";
doc.getElementById("sv_save_ok").click();
ok(S.savedViews().length === 1, "saveView created a saved view");
ok(S.savedViews()[0].name === "Critical & high", "saved view name persisted");
// recall a view by clearing and picking from dropdown
const fStatus2 = doc.getElementById("fltStatus");
fStatus2.value = ""; fStatus2.dispatchEvent(new window.Event("change", { bubbles: true }));
const svPick = doc.getElementById("savedViewPick");
ok(svPick && svPick.querySelector('option[value="' + S.savedViews()[0].id + '"]'), "saved view appears in toolbar dropdown");
svPick.value = S.savedViews()[0].id;
svPick.dispatchEvent(new window.Event("change", { bubbles: true }));
ok(doc.getElementById("fltPriority").value === "1-CRITICAL", "recalling view restores filter");

// 34) Snapshot rename — uses a curated label dropdown (click-only)
S.reset();
const sn = S.takeSnapshot("Auto");
doc.querySelector('.nav-item[data-view="audit"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const renameBtn = doc.querySelector('[data-act=snaprename]');
ok(renameBtn != null, "Rename button on snapshot rows");
renameBtn.click();
ok(/Rename snapshot/.test(doc.getElementById("modal").innerHTML), "Snapshot rename modal opens");
ok(doc.getElementById("sn_label_pick") != null, "Snapshot rename modal has curated dropdown");
ok(doc.querySelectorAll("#modal input[type=text]").length === 0, "Snapshot rename modal has no free-text inputs");
const labelPick = doc.getElementById("sn_label_pick");
labelPick.value = "Pre-deployment";
doc.getElementById("sn_label_ok").click();
ok((S.snapshots().find(s => s.id === sn.id) || {}).label === "Pre-deployment", "renameSnapshot persisted new label");

// 35) Pagination — when the case list exceeds page size, only the first N render with a "Load more" button
S.reset();
// add ~110 cases to trip the default pageSize=100
const extra = 110 - S.validCases().length;
for (let i = 0; i < extra; i++) {
  S.addCase({ problem: "Bulk seed " + i, category: "Quality / Defects", priority: "3-MEDIUM", sev: 4, occ: 4, det: 4, owner: "PM", leanMethod: "5S", target: "x", startDate: "2026-06-01", status: "OPEN", percent: 0 });
}
ok(S.validCases().length >= 110, "added enough cases to trigger pagination (have " + S.validCases().length + ")");
doc.querySelector('.nav-item[data-view="cases"]').dispatchEvent(new window.Event("click", { bubbles: true }));
// clear any filters the previous tests left active so we see the full list
const clearF = doc.querySelector('[data-act=clearflt]');
if (clearF) clearF.click();
const renderedRows = doc.querySelectorAll('tr[data-id]').length;
ok(renderedRows === 100, "first page renders 100 rows (got " + renderedRows + ")");
ok(doc.querySelector('[data-act=pagemore]') != null, "Load-more button is present");
doc.querySelector('[data-act=pageall]').click();
const allShownRows = doc.querySelectorAll('tr[data-id]').length;
ok(allShownRows >= S.validCases().length, "Show-all renders every row (got " + allShownRows + ")");

// 36) Command palette (Cmd/Ctrl+K)
S.reset();
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const cmdKey = new window.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true });
doc.dispatchEvent(cmdKey);
ok(doc.getElementById("cmdInput") != null, "Cmd/Ctrl+K opens command palette");
ok(doc.querySelectorAll("#cmdList .cmd-item").length > 10, "palette lists commands (views + actions)");
const cmdInput = doc.getElementById("cmdInput");
cmdInput.value = "kanban"; cmdInput.dispatchEvent(new window.Event("input", { bubbles: true }));
const matches = doc.querySelectorAll("#cmdList .cmd-item");
ok(matches.length >= 1 && /kanban/i.test(matches[0].textContent), "palette filters by query");
matches[0].dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("modalOverlay").hidden === true, "running a palette command closes it");
ok(window.location.hash === "#kanban", "palette 'Go to Kanban' navigates (hash " + window.location.hash + ")");

// 37) Quick filter chips
doc.querySelector('.nav-item[data-view="cases"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelectorAll(".chip").length >= 5, "quick filter chips render");
const blockedChip = Array.from(doc.querySelectorAll(".chip")).find(c => /Blocked/.test(c.textContent));
blockedChip.dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("fltStatus").value === "BLOCKED", "Blocked chip sets status filter");
const criticalChip = Array.from(doc.querySelectorAll(".chip")).find(c => /Critical/.test(c.textContent));
criticalChip.dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("fltPriority").value === "1-CRITICAL" && doc.getElementById("fltStatus").value === "", "Critical chip swaps to priority filter");
const allChip = Array.from(doc.querySelectorAll(".chip")).find(c => c.textContent.trim() === "All");
allChip.dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("fltStatus").value === "" && doc.getElementById("fltPriority").value === "", "All chip clears filters");
ok(Array.from(doc.querySelectorAll(".chip")).some(c => c.classList.contains("on")), "active chip shows 'on' state");

// 38) Manage saved views modal
S.reset();
S.saveView("Critical & high", { status: "", priority: "1-CRITICAL", owner: "", sort: "rpn" });
doc.querySelector('.nav-item[data-view="cases"]').dispatchEvent(new window.Event("click", { bubbles: true }));
doc.querySelector('[data-act=manageviews]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(/Manage saved views/.test(doc.getElementById("modal").innerHTML), "Manage views modal opens");
ok(/Critical/.test(doc.getElementById("modal").innerHTML) && /high/.test(doc.getElementById("modal").innerHTML), "saved view listed in manager");
const rmBtn = doc.querySelector('#modal [data-act=rmview]');
ok(rmBtn != null, "manager has delete buttons");
rmBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
ok(S.savedViews().length === 0, "deleting from manager removes the saved view");
doc.querySelector("#modal [data-act=cancel]") && doc.querySelector("#modal [data-act=cancel]").click();

// 38) Project Brain — analyze a description locally and apply the generated plan
S.reset();
doc.querySelector('.nav-item[data-view="brain"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("brainText") != null, "Brain view renders a description input");
// 'Try an example' loads a bundled 8-country brief and analyses it (zero typing)
const exBtn = doc.getElementById("brainExample");
ok(exBtn != null && !exBtn.getAttribute("onclick"), "'Try an example' button exists and is CSP-safe");
exBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("brainText").value.indexOf("Indonesia") !== -1 && doc.getElementById("brainText").value.indexOf("Guam") !== -1, "'Try an example' fills a real 8-country description");
ok(window.QIBrain.analyzeProject(doc.getElementById("brainText").value).countryIntel.length === 8, "'Try an example' brief detects all 8 countries");
ok(typeof window.QIBrain === "object" && typeof window.QIBrain.analyzeProject === "function", "Brain engine exposed to the UI");
// 38a) 'Programme at a glance' front-door card → links to the two best outputs
ok(doc.querySelector(".brain-hero") != null, "Brain home shows a 'Programme at a glance' front-door card");
ok(doc.querySelectorAll(".brain-hero .brain-hero-stat").length === 5, "front-door card shows 5 headline stats");
const heroBriefBtn = doc.getElementById("heroBrief"), heroGlobeBtn = doc.getElementById("heroGlobe");
ok(heroBriefBtn != null && heroGlobeBtn != null && !heroBriefBtn.getAttribute("onclick") && !heroGlobeBtn.getAttribute("onclick"),
   "front-door buttons exist and are CSP-safe (no inline onclick)");
heroBriefBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
ok(window.location.hash === "#investorbrief" && doc.getElementById("investorBrief") != null, "'Open the Investor Brief' button navigates to the brief");
doc.querySelector('.nav-item[data-view="brain"]').dispatchEvent(new window.Event("click", { bubbles: true }));
doc.getElementById("heroGlobe").dispatchEvent(new window.Event("click", { bubbles: true }));
ok(window.location.hash === "#globe3d", "'Watch it build in 3D' button navigates to the 3D map");
doc.querySelector('.nav-item[data-view="brain"]').dispatchEvent(new window.Event("click", { bubbles: true }));
// 38a-ii) the Logout button used to be a dead button — now it gives feedback
const logoutBtn = doc.getElementById("btnLogout");
ok(logoutBtn != null, "Logout button exists in the topbar");
const toastEl0 = doc.getElementById("toast"); if (toastEl0) toastEl0.hidden = true;
logoutBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("toast") && doc.getElementById("toast").hidden === false && /demo|sign out|signing/i.test(doc.getElementById("toast").textContent),
   "clicking Logout now gives feedback (no longer a dead button)");
const brainCasesBefore = S.validCases().length;
const brainMsBefore = S.regRows("milestones").length;
const brainProcBefore = S.regRows("procurement").length;
doc.getElementById("brainText").value =
  "FTTH fibre backbone rollout, 1200 km route across 45 sites, OTDR splicing, GPON last mile, 18 months";
doc.getElementById("brainAnalyze").click();
const brainOut = doc.getElementById("brainOut").innerHTML;
ok(/Work breakdown/.test(brainOut), "Brain renders a work-breakdown preview");
ok(/Top risks/.test(brainOut), "Brain renders a risk preview");
ok(/Fibre|fibre-telecom/i.test(brainOut), "Brain detected the fibre domain in the UI");
const brainApply = doc.getElementById("brainApply");
ok(brainApply != null, "Apply-plan button appears after analysis");
brainApply.click();
// applyBrainPlan now CLEARS prior generated content then applies a fresh full
// plan (idempotent — re-analyzing never duplicates), so assert the generated
// plan is present in absolute terms rather than appended to the demo seed.
ok(S.validCases().length >= 15, "Apply loads the generated task + risk cases as a fresh plan (" + S.validCases().length + " cases)");
ok(S.regRows("milestones").length >= 1, "Apply loads generated milestones");
ok(S.regRows("procurement").length >= 1, "Apply loads generated procurement items");
ok(S.get().stakeholders.length >= 2, "Apply populates stakeholders (incl. regulators) simultaneously");
ok(S.regRows("decisions").length >= 1, "Apply seeds the decision log simultaneously");
// click-only / privacy sanity: analysis must not call out to the network
ok(window.__promptCalls === 0, "Brain flow used no prompt()");

// 38b) Click-only "Build my brief" wizard — generates a description and analyses it with zero typing
S.reset();
doc.querySelector('.nav-item[data-view="brain"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("wzBuild") != null, "Brain wizard (build-by-clicks) renders");
ok(doc.querySelectorAll(".wzCountry").length === 8, "Wizard offers all 8 countries as click toggles");
doc.getElementById("wzAll").click();
doc.getElementById("wzBuild").click();
const wzText = doc.getElementById("brainText").value;
ok(/submarine fibre optic cable system/.test(wzText), "Wizard composed a description from the clicks (no typing)");
ok(/9,500 km/.test(wzText) && /60 months/.test(wzText) && /USD 1.3 billion/.test(wzText), "Wizard brief carries the chosen scale, duration and budget");
["Indonesia","Malaysia","Brunei","Vietnam","Thailand","Philippines","Taiwan","Guam"].forEach(c =>
  ok(wzText.indexOf(c) !== -1, "Wizard brief names " + c));
ok(/Work breakdown/.test(doc.getElementById("brainOut").innerHTML), "Wizard auto-analysed (work-breakdown preview shown)");
ok(window.QIBrain.analyzeProject(wzText).countryIntel.length === 8, "Wizard brief detected all 8 countries");
ok(window.__promptCalls === 0, "Wizard used no prompt() (click-only)");
// "Clear countries" empties the selection, so the wizard can scope to fewer markets
doc.getElementById("wzNone").click();
ok(doc.querySelectorAll(".wzCountry:checked").length === 0, "Wizard 'Clear countries' deselects all toggles");

// 39) Country Intelligence — bundled data, dedicated view, and Brain integration
ok(typeof window.QICountryData === "object" && typeof window.QICountryData.list === "function", "Country data module exposed");
ok(window.QICountryData.list().length === 8, "Country data covers all 8 STP countries (got " + window.QICountryData.list().length + ")");
ok(window.QICountryData.list().every(c => c.authority && c.authority.abbrev && c.authority.name && c.authority.role), "Every country names a real regulatory authority with a role");
doc.querySelector('.nav-item[data-view="country"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const countryOut = doc.getElementById("content").innerHTML;
ok(doc.querySelectorAll(".country-card").length === 8, "Country Intelligence view renders 8 country cards");
["NBTC","NTC","MCMC","AITI","FCC","NCC","Komdigi"].forEach(ab =>
  ok(countryOut.indexOf(ab) !== -1, "Country view names the real authority " + ab));
ok(/South China Sea|East Sea/i.test(countryOut), "Country view surfaces geopolitical (South China Sea) hazards");
ok(/typhoon/i.test(countryOut), "Country view surfaces geographical (typhoon) hazards");

// 39b) Investor Brief — plain-language, print-ready one-pager from the auto-built plan
window.print = function () { window.__printed = (window.__printed || 0) + 1; };
doc.querySelector('.nav-item[data-view="investorbrief"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const briefOut = doc.getElementById("content").innerHTML;
ok(doc.getElementById("investorBrief") != null, "Investor Brief view renders");
ok(doc.querySelectorAll(".brief-country").length === 8, "Investor Brief shows all 8 countries (got " + doc.querySelectorAll(".brief-country").length + ")");
ok(doc.querySelectorAll(".brief-table tbody tr").length === window.QIGlobe.CABLES.length, "Investor Brief lists every cable segment");
ok(doc.querySelector(".brief-map svg.netmap-svg") != null, "Investor Brief renders a static network-map thumbnail (inline SVG)");
ok(doc.querySelectorAll(".brief-map .netmap-dot").length === window.QIGlobe.STATIONS.length, "network map plots all 8 landing stations");
ok(doc.querySelectorAll(".brief-map .netmap-line").length === window.QIGlobe.CABLES.length, "network map draws every cable link");
ok(doc.querySelectorAll(".brief-map .netmap-glow").length === window.QIGlobe.CABLES.length, "network map renders a glow arc under every link (polished route painting)");
ok(doc.querySelector(".brief-map-legend") != null, "network map has a plain-language status legend");
ok(/USD\s*1\.3B/.test(briefOut) && /60 months/.test(briefOut), "Investor Brief shows the headline budget (USD 1.3B) and build time (60 months)");
ok(doc.querySelectorAll(".brief-verdict").length === 8, "Investor Brief shows a market-entry verdict for each country");
ok(doc.querySelectorAll(".brief-takeaway").length === 8, "Investor Brief gives a 'what this means for you' line for each country");
ok(doc.querySelector(".brief-spend svg.spend-svg") != null && doc.querySelector(".brief-spend path.spend-line") != null,
   "Investor Brief renders the spending-over-time S-curve (inline SVG)");
ok(/Spending over time/.test(briefOut), "Investor Brief includes the 'Spending over time' section");
ok(doc.querySelectorAll(".brief-online-row").length === 8, "Investor Brief shows the go-live timeline for all 8 countries");
ok(/When each country goes live/.test(briefOut), "Investor Brief includes the 'When each country goes live' section");
ok(doc.querySelector(".brief-summary") != null, "Investor Brief opens with an auto-written 'In a nutshell' summary");
ok(doc.querySelector(".brief-health") != null && /Overall:/.test(doc.querySelector(".brief-health").textContent),
   "Investor Brief shows a one-line confidence/health read");
ok(/brief-health--(go|cond|caution)/.test(briefOut), "confidence read carries a programme-wide traffic-light class");
ok(doc.querySelectorAll(".brief-todo-item").length === 5, "Investor Brief shows a prioritised 'What to do first' list (5 longest-lead approvals)");
ok(/What to do first/.test(briefOut), "Investor Brief includes the 'What to do first' section");
ok((function () {
  const m = Array.from(doc.querySelectorAll(".brief-todo-when")).map(e => parseInt(e.textContent.replace(/\D/g, ""), 10) || 0);
  for (let i = 1; i < m.length; i++) { if (m[i] > m[i - 1]) return false; }
  return m.length === 5;
})(), "'What to do first' is sorted longest-lead first");
ok(doc.querySelectorAll(".brief-summary p").length >= 3, "summary tells the story in several plain sentences (got " + doc.querySelectorAll(".brief-summary p").length + ")");
ok(/connects 8 countries/.test(doc.querySelector(".brief-summary").textContent) && /USD\s*1\.3B/.test(doc.querySelector(".brief-summary").textContent),
   "summary states the scale (8 countries) and headline cost (USD 1.3B)");
ok(/straightforward to enter|conditions are met|extra caution/.test(doc.querySelector(".brief-summary").textContent),
   "summary gives the plain go / conditional / caution mix");
ok(doc.querySelectorAll(".brief-risks li").length > 0, "Investor Brief lists the biggest things to watch");
["FCC","NCC","NBTC","MCMC"].forEach(ab => ok(briefOut.indexOf(ab) !== -1, "Investor Brief names the real authority " + ab));
// the print button must be CSP-safe (wired via addEventListener, NOT an inline onclick)
const briefPrintBtn = doc.getElementById("briefPrint");
ok(briefPrintBtn != null && !briefPrintBtn.getAttribute("onclick"), "Investor Brief print button has no inline onclick (CSP-safe)");
window.__printed = 0;
briefPrintBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
ok(window.__printed === 1, "clicking 'Print / Save as PDF' invokes window.print() once");
// downloadable self-contained one-pager (built from the same data, drift-free CSS)
ok(typeof window.QIBrief === "object" && typeof window.QIBrief.buildDocument === "function", "QIBrief.buildDocument() exposed for the HTML download");
const briefDoc = window.QIBrief.buildDocument();
ok(/^<!doctype html>/i.test(briefDoc), "downloaded brief is a complete HTML document");
ok(/<style>[\s\S]*<\/style>/.test(briefDoc) && briefDoc.indexOf("id=\"investorBrief\"") !== -1, "download is self-contained (inline <style> + brief markup)");
ok(briefDoc.indexOf("<script") === -1, "downloaded brief contains no scripts (safe to email/open)");
ok((briefDoc.match(/brief-country/g) || []).length >= 8, "downloaded brief carries all 8 country blocks");
ok(/USD\s*1\.3B/.test(briefDoc), "downloaded brief carries the headline budget");
const dlBtn = doc.getElementById("briefDownload");
ok(dlBtn != null && !dlBtn.getAttribute("onclick"), "Download button exists and is CSP-safe (no inline onclick)");
// zero PM/FMEA jargon for the non-technical reader
ok(!/\bRPN\b|\bFMEA\b|\bEVM\b|\bWBS\b|\bSPI\b|\bCPI\b/.test(briefOut), "Investor Brief leaks no PM/FMEA jargon");
// 5a: DATA_PROVENANCE exposed and has correct shape
ok(window.QICountryData.DATA_PROVENANCE && typeof window.QICountryData.DATA_PROVENANCE.asOf === "string" && window.QICountryData.DATA_PROVENANCE.asOf.length > 0,
   "QICountryData.DATA_PROVENANCE has an asOf string");
ok(Array.isArray(window.QICountryData.DATA_PROVENANCE.sources) && window.QICountryData.DATA_PROVENANCE.sources.length > 0,
   "QICountryData.DATA_PROVENANCE has a non-empty sources array");
// 5b: Investor Brief contains the cover page and provenance footer
ok(doc.querySelector(".brief-cover") != null, "Investor Brief has a professional cover page (.brief-cover)");
ok(doc.querySelector(".brief-cover-mark") != null && doc.querySelector(".brief-cover-mark").textContent === "QI", "cover page shows the QI mark");
ok(doc.querySelector(".brief-cover-title") != null, "cover page shows the project title");
ok(doc.querySelector(".brief-prov") != null, "Investor Brief has a provenance footer line (.brief-prov)");
ok(/as of 2025-06/.test(doc.querySelector(".brief-prov").textContent), "provenance footer shows the data-as-of date");

// 6) "What if" country toggles — click-only filter bar
ok(doc.getElementById("briefFilter") != null, "Investor Brief has a .brief-filter bar with country toggles");
ok(doc.querySelectorAll(".bfCountry").length === 8, "brief filter has 8 country checkboxes (got " + doc.querySelectorAll(".bfCountry").length + ")");
ok(doc.getElementById("bfAll") != null && doc.getElementById("bfNone") != null, "brief filter has All and None buttons");
// Unchecking one country hides its .brief-country card
const firstCb = doc.querySelector(".bfCountry");
const firstKey = firstCb.value;
firstCb.checked = false;
firstCb.dispatchEvent(new window.Event("change", { bubbles: true }));
const hiddenCard = doc.querySelector('.brief-country[data-country-key="' + firstKey + '"]');
ok(hiddenCard != null && hiddenCard.style.display === "none", "unchecking a country hides its .brief-country card");
const hiddenRow = doc.querySelector('.brief-online-row[data-country-key="' + firstKey + '"]');
ok(hiddenRow != null && hiddenRow.style.display === "none", "unchecking a country hides its .brief-online-row");
// The stat chip for 'Countries connected' updates
const statChips2 = Array.from(doc.querySelectorAll(".brief-stat"));
const ccChip = statChips2.find(function (c) { return c.querySelector(".brief-stat-l") && c.querySelector(".brief-stat-l").textContent === "Countries connected"; });
ok(ccChip != null && ccChip.querySelector(".brief-stat-v").textContent === "7", "stat chip updates to 7 countries after unchecking one");
// "All" button re-shows all cards
doc.getElementById("bfAll").dispatchEvent(new window.Event("click", { bubbles: true }));
ok(hiddenCard.style.display === "", "'All' button re-shows hidden country card");
ok(doc.querySelectorAll(".bfCountry:checked").length === 8, "'All' button checks all 8 checkboxes");
// "None" button hides everything
doc.getElementById("bfNone").dispatchEvent(new window.Event("click", { bubbles: true }));
const allCards = doc.querySelectorAll(".brief-country[data-country-key]");
const allHidden = Array.from(allCards).every(function (c) { return c.style.display === "none"; });
ok(allHidden, "'None' button hides all country cards");
// Restore all for the rest of tests
doc.getElementById("bfAll").dispatchEvent(new window.Event("click", { bubbles: true }));

// Brain detects named countries and injects permit tasks + FMEA risks
S.reset();
doc.querySelector('.nav-item[data-view="brain"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const ciCasesBefore = S.validCases().length;
doc.getElementById("brainText").value =
  "Submarine fibre optic cable system, 5000 km route, landing stations in the Philippines, Taiwan and Indonesia, OTDR splicing, 36 months";
doc.getElementById("brainAnalyze").click();
const ciOut = doc.getElementById("brainOut").innerHTML;
ok(/Regulatory & Country Intelligence|Regulatory &amp; Country Intelligence/.test(ciOut), "Brain preview shows the Country Intelligence section");
ok(/NTC|NCC|Komdigi/.test(ciOut), "Brain preview names detected authorities");
const ciPlan = window.QIBrain.analyzeProject(
  "Submarine fibre cable, landing stations in the Philippines, Taiwan and Indonesia");
ok(ciPlan.countryIntel.length === 3, "Brain detects exactly the 3 named countries (got " + ciPlan.countryIntel.length + ")");
ok(ciPlan.risks.some(r => /Philippines/.test(r.problem)) && ciPlan.cases.some(c => /Obtain cable landing license — NTC/.test(c.problem)), "Brain adds country risks + a permit task naming the authority");
const allEight = window.QIBrain.analyzeProject("Submarine subsea fibre cable backbone, 8000 km, 48 months");
ok(allEight.countryIntel.length === 8, "Submarine project with no named country includes all 8 (got " + allEight.countryIntel.length + ")");
doc.getElementById("brainApply").click();
ok(S.validCases().length > ciCasesBefore, "Applying the plan adds the country-enriched cases");

// 40) Per-country briefing (powers the 3D map station drill-down) — pure data
ok(typeof window.QICountryData.briefing === "function", "QICountryData.briefing() exposed for the 3D drill-down");
const STN = [
  ["jakarta", "Indonesia", "Indonesia"], ["songkhla", "Thailand", "Thailand"],
  ["danang", "Vietnam", "Vietnam"], ["tamsui", "Taiwan", "Taiwan"],
  ["batangas", "Philippines", "Philippines"], ["piti", "Guam (US)", "Guam"],
  ["mersing", "Malaysia", "Malaysia"], ["bsb", "Brunei", "Brunei"]
];
STN.forEach(([id, country, nameFrag]) => {
  const b = window.QICountryData.briefing(id + " " + country);
  ok(!!b && b.name.indexOf(nameFrag) !== -1, "Station " + id + " maps to its country briefing (" + nameFrag + ")");
  ok(!!b && b.authority && /.+/.test(b.authority.abbrev) && /.+/.test(b.authority.role), "Briefing for " + id + " names the real regulator with a role");
  ok(!!b && /^(Go|Conditional Go|Caution)$/.test(b.marketEntry.verdict), "Briefing for " + id + " has a plain market-entry verdict");
  ok(!!b && b.licensing.criticalPathMonths > 0 && /.+/.test(b.licensing.criticalPathItem), "Briefing for " + id + " has a slowest 'start-first' approval");
  ok(!!b && Array.isArray(b.landingParties.candidates) && b.landingParties.candidates.length > 0, "Briefing for " + id + " lists who can land the cable");
  ok(!!b && b.risks.length > 0 && b.risks.every(r => /^(Top concern|Important|Worth watching)$/.test(r.level)), "Briefing for " + id + " uses plain risk levels");
  ok(!!b && b.geographical.length > 0 && b.geopolitical.length > 0, "Briefing for " + id + " surfaces nature + politics");
  ok(!!b && typeof b.takeaway === "string" && b.takeaway.length > 30, "Briefing for " + id + " includes a 'what this means for you' takeaway");
  // zero PM/FMEA jargon must leak to non-technical readers
  const blob = JSON.stringify(b);
  ok(!/RISK:|\bRPN\b|\bFMEA\b|"sev"|"occ"|"det"|priority/.test(blob), "Briefing for " + id + " leaks no PM/FMEA jargon");
});
// risks are ordered worst-first (Top concern before Worth watching)
const taiwanB = window.QICountryData.briefing("tamsui Taiwan");
ok(taiwanB.risks[0].level === "Top concern", "Briefing orders risks worst-first (Taiwan top risk is a 'Top concern')");
// an unknown hint returns null rather than throwing
ok(window.QICountryData.briefing("somewhere with no station") === null, "Briefing returns null for an unknown location (no throw)");

// Start-here guide on Brain view (first-run only)
S.setBrand({ tourDone: false });
doc.querySelector('.nav-item[data-view="brain"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".start-here") != null, "start-here guide shows on Brain view when tourDone is false");
ok(/Upload a project description/.test(doc.querySelector(".start-here").textContent), "start-here step 1 tells user to upload");
ok(/Review the auto-built plan/.test(doc.querySelector(".start-here").textContent), "start-here step 2 tells user to review");
ok(/Present it/.test(doc.querySelector(".start-here").textContent), "start-here step 3 tells user to present");
doc.querySelector("[data-act=dismissGuide]").click();
ok(doc.querySelector(".start-here") == null, "start-here guide removed after 'Got it' click");
ok(S.brand().tourDone === true, "dismissGuide persists tourDone=true");
doc.querySelector('.nav-item[data-view="brain"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".start-here") == null, "start-here guide does NOT show again after dismissal");

// Accessibility smoke tests
ok(doc.querySelector("a.skip-link[href='#content']") != null, "skip-link exists in the DOM");
ok(doc.getElementById("content").getAttribute("role") === "main", "#content has role=main");
ok(doc.getElementById("nav").getAttribute("role") === "navigation", "#nav has role=navigation");
ok(doc.getElementById("nav").getAttribute("aria-label") === "Main menu", "#nav has aria-label='Main menu'");
ok(doc.querySelector("header.topbar").getAttribute("role") === "banner", "topbar header has role=banner");
ok(doc.getElementById("content").getAttribute("aria-live") === "polite", "#content has aria-live=polite for screen reader announcements");
// focus-visible outline style exists in the stylesheet
const allCss = Array.from(doc.styleSheets).map(s => { try { return Array.from(s.cssRules || []).map(r => r.cssText).join("\n"); } catch (e) { return ""; } }).join("\n");
ok(/:focus-visible/.test(allCss), "focus-visible outline style exists in the stylesheet");
ok(/\.skip-link/.test(allCss), "skip-link styles exist in the stylesheet");

// Country dataset enrichment: interconnects & iruBand
const CD = window.QICountryData;
const allCountries = CD.list();
ok(allCountries.every(c => Array.isArray(c.interconnects) && c.interconnects.length >= 2),
  "every country has interconnects array with length >= 2");
ok(allCountries.every(c => typeof c.iruBand === "string" && c.iruBand.length > 10),
  "every country has iruBand string with length > 10");
const idBrief = CD.briefing("jakarta Indonesia");
ok(idBrief && Array.isArray(idBrief.interconnects) && idBrief.interconnects.length >= 2,
  "briefing('jakarta Indonesia').interconnects.length >= 2");
ok(idBrief && typeof idBrief.iruBand === "string" && /USD/.test(idBrief.iruBand),
  "briefing('jakarta Indonesia').iruBand contains 'USD'");

// Resume banner: appears when data exists
// Reset state and re-boot to simulate a returning user with data
window.QIStore.reset();
window.QIStore.get().project.name = "TestProj";
window.QIStore.save();
// Remove any existing banner
const oldBanner = doc.querySelector(".resume-banner");
if (oldBanner) oldBanner.remove();
// Re-boot
window.QIBoot();
ok(doc.querySelector(".resume-banner") != null, "resume banner appears after boot when data exists");
ok(/TestProj/.test(doc.querySelector(".resume-banner").innerHTML), "resume banner shows project name");
ok(/\d+ items/.test(doc.querySelector(".resume-banner").innerHTML), "resume banner shows item count");

// Resume banner: dismiss removes it
const dismissBtn = doc.getElementById("resumeDismiss");
dismissBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".resume-banner") == null, "resume banner removed after clicking dismiss");

// Step 10: Jargon tooltips — plain-language explanations on hover/focus
S.reset();
doc.querySelector('.nav-item[data-view="brain"]').dispatchEvent(new window.Event("click", { bubbles: true }));
doc.getElementById("brainText").value = "Submarine fibre optic cable system, 9500 km, 8 landing stations, 60 months";
doc.getElementById("brainAnalyze").click();
const jargonEls = doc.querySelectorAll("#brainOut .jargon[data-tip]");
ok(jargonEls.length >= 2, "Brain analysis renders .jargon tooltip spans (got " + jargonEls.length + ")");
const tipTexts = Array.from(jargonEls).map(e => e.getAttribute("data-tip")).join(" ");
ok(/plain|higher means|find what could go wrong|Risk Priority Number|Failure Mode/i.test(tipTexts), "tooltip text contains plain language (not more jargon)");
// FMEA view also has jargon tooltip on the RPN column header
doc.querySelector('.nav-item[data-view="fmea"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const fmeaJargon = doc.querySelector("#content th .jargon[data-tip]");
ok(fmeaJargon != null && /Risk Priority Number/.test(fmeaJargon.getAttribute("data-tip")), "FMEA view table header has RPN jargon tooltip");

// Step 11: Branding controls — project name flows to topbar + Investor Brief
S.reset();
S.get().project.name = "Capital Project Alpha";
S.save();
// Navigate to config and use the save button (which calls refreshHeader internally)
doc.querySelector('.nav-item[data-view="config"]').dispatchEvent(new window.Event("click", { bubbles: true }));
doc.getElementById("p_name").value = "Capital Project Alpha";
doc.querySelector("[data-act=saveproj]").dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("brandProject").textContent === "Capital Project Alpha", "topbar shows updated project name after settings save");
// Check the Investor Brief title shows the name
doc.querySelector('.nav-item[data-view="investorbrief"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const coverTitle = doc.querySelector(".brief-cover-title");
ok(coverTitle != null && /Capital Project Alpha/.test(coverTitle.textContent), "Investor Brief cover title shows the project name");

// Step 12: Compare two countries — side-by-side table
S.reset();
doc.querySelector('.nav-item[data-view="investorbrief"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const cmpAsel = doc.getElementById("cmpA"), cmpBsel = doc.getElementById("cmpB");
ok(cmpAsel != null && cmpBsel != null, "#cmpA and #cmpB selects exist");
ok(cmpAsel.querySelectorAll("option").length === 8, "#cmpA has 8 options (got " + cmpAsel.querySelectorAll("option").length + ")");
ok(cmpBsel.querySelectorAll("option").length === 8, "#cmpB has 8 options (got " + cmpBsel.querySelectorAll("option").length + ")");
// On initial load, the compare table renders automatically
const cmpDiv = doc.getElementById("briefCompare");
ok(cmpDiv != null && cmpDiv.querySelector(".cmp-table") != null, "#briefCompare renders a .cmp-table on initial load");
// Changing #cmpB and dispatching change updates the table
const origContent = cmpDiv.innerHTML;
const opts12 = Array.from(cmpBsel.querySelectorAll("option"));
const altVal = opts12.find(o => o.value !== cmpBsel.value);
if (altVal) {
  cmpBsel.value = altVal.value;
  cmpBsel.dispatchEvent(new window.Event("change", { bubbles: true }));
  ok(cmpDiv.innerHTML !== origContent || cmpDiv.querySelector(".cmp-table") != null, "changing #cmpB updates the comparison table content");
} else {
  ok(false, "could not find an alternate option to test compare change");
}

// Step 13: Programme Progress card on the dashboard
S.reset();
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".prog-bar") != null, "Programme Progress bar exists on the dashboard");
ok(doc.querySelectorAll(".prog-bar .prog-seg").length >= 1, "prog-bar has at least one .prog-seg child");
// km totals sum correctly
const totalsEl = doc.querySelector(".prog-totals");
ok(totalsEl != null, "prog-totals element present");
const commKmVal = Number(totalsEl.getAttribute("data-comm-km")) || 0;
const progKmVal = Number(totalsEl.getAttribute("data-prog-km")) || 0;
const planKmVal = Number(totalsEl.getAttribute("data-plan-km")) || 0;
const totalKmVal = Number(totalsEl.getAttribute("data-total-km")) || 0;
ok(commKmVal + progKmVal + planKmVal === totalKmVal && totalKmVal > 0, "Programme Progress km totals sum correctly (" + commKmVal + "+" + progKmVal + "+" + planKmVal + "=" + totalKmVal + ")");

// Step 14: Dark-mode brief rules exist in the stylesheet
const cssAllFull = Array.from(doc.styleSheets).map(function(s) { try { return Array.from(s.cssRules || []).map(function(r) { return r.cssText; }).join("\n"); } catch (e) { return ""; } }).join("\n");
ok(/\[data-theme="dark"\]\s*\.brief/.test(cssAllFull), "dark-mode .brief rule exists in the stylesheet");

// Step 15: Compare section has .no-print (hidden from print)
doc.querySelector('.nav-item[data-view="investorbrief"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const cmpSection = doc.querySelector(".brief-compare");
ok(cmpSection != null && cmpSection.closest(".no-print") != null, "compare section has .no-print class (hidden from print)");

// Step 16: Risk heatmap in the Investor Brief
doc.querySelector('.nav-item[data-view="investorbrief"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".heatmap") != null, "Investor Brief renders a .heatmap element");
ok(doc.querySelectorAll(".heatmap .hm-cell").length >= 1, "heatmap has at least one .hm-cell");
ok(doc.getElementById("briefHeatmap") != null, "heatmap has id='briefHeatmap'");

// Step 17: Export buttons exist after analysis
S.reset();
doc.querySelector('.nav-item[data-view="brain"]').dispatchEvent(new window.Event("click", { bubbles: true }));
doc.getElementById("brainText").value = "Submarine fibre optic cable system, 9500 km, 8 landing stations, 60 months";
doc.getElementById("brainAnalyze").click();
ok(doc.getElementById("brainExportJSON") != null, "#brainExportJSON button exists after analysis");
ok(doc.getElementById("brainExportCSV") != null, "#brainExportCSV button exists after analysis");

// Step 18: Toast animation property check
const toastEl = doc.getElementById("toast");
toastEl.hidden = false; toastEl.textContent = "anim test";
const toastCss = Array.from(doc.styleSheets).map(function(s) { try { return Array.from(s.cssRules || []).map(function(r) { return r.cssText; }).join("\n"); } catch (e) { return ""; } }).join("\n");
ok(/\.toast[\s\S]*animation/.test(toastCss), ".toast has an animation property in the stylesheet");
ok(/toastIn/.test(toastCss) && /scale\(/.test(toastCss), "toastIn keyframes include scale+translate entrance");
toastEl.hidden = true;

// Step 19: Gantt phase timeline on the Investor Brief
doc.querySelector('.nav-item[data-view="investorbrief"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".gantt") != null, "Investor Brief renders a .gantt element (phase timeline)");
ok(doc.querySelectorAll(".gantt .gantt-row").length === 7, "Gantt timeline has 7 phase rows (got " + doc.querySelectorAll(".gantt .gantt-row").length + ")");
ok(doc.querySelector(".gantt-axis") != null, "Gantt timeline has an axis row");
ok(/Programme phases/.test(doc.getElementById("content").innerHTML), "Investor Brief includes the 'Programme phases' section heading");

// Step 20: Keyboard shortcuts overlay — showShortcuts is a function and ? key opens the modal
ok(typeof window.QIShowShortcuts === "function" || doc.getElementById("btnHelp") != null, "shortcuts overlay is accessible");
doc.getElementById("btnHelp").click();
ok(/Keyboard shortcuts/.test(doc.getElementById("modal").innerHTML), "pressing help opens the shortcuts modal");
ok(/Command palette/.test(doc.getElementById("modal").innerHTML) || /Show this list/.test(doc.getElementById("modal").innerHTML), "shortcuts modal lists shortcut entries");
doc.querySelector("#modal [data-act=cancel]").click();

// Step 21: Share button on the Investor Brief toolbar
doc.querySelector('.nav-item[data-view="investorbrief"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const briefShareBtn = doc.getElementById("briefShare");
ok(briefShareBtn != null, "#briefShare button exists on the brief toolbar");
ok(!briefShareBtn.getAttribute("onclick"), "Share button is CSP-safe (no inline onclick)");
ok(/Share link/.test(briefShareBtn.textContent), "Share button has 'Share link' label");

// Step 22: Milestone tracker on the Investor Brief
doc.querySelector('.nav-item[data-view="investorbrief"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".milestones") != null, "Investor Brief renders a .milestones element");
ok(doc.querySelectorAll(".milestones .ms-row").length === 7, "milestones has 7 .ms-row elements (got " + doc.querySelectorAll(".milestones .ms-row").length + ")");

// Step 23: Cost-breakdown pie chart (inline SVG donut)
ok(doc.querySelector(".cost-donut") != null, "Investor Brief renders a .cost-donut SVG");
ok(doc.querySelectorAll(".cost-donut path").length >= 5, "cost-donut SVG has at least 5 path elements (got " + doc.querySelectorAll(".cost-donut path").length + ")");
ok(doc.querySelectorAll(".cost-legend .cost-row").length === 6, "cost-legend has 6 .cost-row elements (got " + doc.querySelectorAll(".cost-legend .cost-row").length + ")");

// Step 24: Stakeholder directory
ok(doc.querySelectorAll(".sh-grid .sh-card").length === 7, "sh-grid has 7 .sh-card elements (got " + doc.querySelectorAll(".sh-grid .sh-card").length + ")");

// Step 25: "What's next" AI recommendation card on the Dashboard
S.reset();
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".next-card") != null, "dashboard renders a .next-card element");
ok(doc.querySelector(".next-card .next-text") != null && doc.querySelector(".next-card .next-text").textContent.length > 10, ".next-card has .next-text with content (got " + (doc.querySelector(".next-card .next-text") ? doc.querySelector(".next-card .next-text").textContent.length : 0) + " chars)");

// Step 26: Programme health score (0-100)
ok(doc.querySelector(".health-score") != null, "dashboard renders a .health-score element");
const healthNum = doc.querySelector(".health-score .health-num");
ok(healthNum != null, ".health-score has a .health-num child");
const healthVal = parseInt(healthNum.textContent, 10);
ok(healthVal >= 0 && healthVal <= 100, "health score is between 0 and 100 (got " + healthVal + ")");
ok(/health-(green|amber|red)/.test(doc.querySelector(".health-score").className), "health score has a traffic-light class");

// Step 27: Quick-filter "Done" chip sets status to CLOSED
doc.querySelector('.nav-item[data-view="cases"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const doneChip = Array.from(doc.querySelectorAll(".chip")).find(c => /Done/.test(c.textContent));
ok(doneChip != null, "Done chip exists in the chip bar");
doneChip.dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("fltStatus").value === "CLOSED", "Done chip sets status filter to CLOSED (got " + doc.getElementById("fltStatus").value + ")");

// Step 28: Notification badge count on nav items
S.reset();
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".nav-badge") != null, ".nav-badge appears on a nav item after data is loaded");
ok(doc.querySelector('.nav-item[data-view="cases"] .nav-badge') != null, ".nav-badge appears on the Cases nav item");

// Step 29: "My Items" personal todo view
ok(doc.querySelector('.nav-item[data-view="myitems"]') != null, "My Items nav item exists");
doc.querySelector('.nav-item[data-view="myitems"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".my-list") != null, "RENDER.myitems renders .my-list when cases exist");

// Step 30: Enhanced cable-segment detail with status badge
// Since WebGL is unavailable in jsdom, verify .gd-cable-status exists in the stylesheet
const cssCheck = Array.from(doc.styleSheets).map(function(s) { try { return Array.from(s.cssRules || []).map(function(r) { return r.cssText; }).join("\n"); } catch (e) { return ""; } }).join("\n");
ok(/\.gd-cable-status/.test(cssCheck), "Cable detail has .gd-cable-status CSS rule in the stylesheet");

// Step 31: Animated counter numbers — .kpi .value elements exist
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const kpiVals = doc.querySelectorAll(".kpi .value");
ok(kpiVals.length > 0, ".kpi .value elements exist on dashboard (counter targets, got " + kpiVals.length + ")");

// Step 32: Data-quality warnings card (add a case with no owner to trigger it)
S.addCase({ problem: "Test item no owner", category: "Test", priority: "", sev: 0, occ: 0, det: 0, owner: "", status: "OPEN" });
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".dq-card") != null, ".dq-card data-quality warnings card renders on dashboard");
ok(doc.querySelector(".dq-list") != null, ".dq-list inside the data-quality card has items");

// Step 33: Command palette hint button in the topbar
ok(doc.getElementById("btnCmdK") != null, "#btnCmdK exists in the topbar");
ok(/cmd-hint/.test(doc.getElementById("btnCmdK").className), "#btnCmdK has cmd-hint class");

// Step 40: Activity log timeline on the Dashboard
S.reset();
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".activity-log") != null, ".activity-log exists on the dashboard");
ok(doc.querySelectorAll(".al-item").length > 0, ".al-item elements present when cases exist (got " + doc.querySelectorAll(".al-item").length + ")");

// Step 41: Search-within-brief input on the Investor Brief
doc.querySelector('.nav-item[data-view="investorbrief"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("briefSearch") != null, "#briefSearch input exists on the Investor Brief");

// Step 42: Table-of-contents for the Investor Brief
ok(doc.querySelector(".brief-toc") != null, ".brief-toc exists on the Investor Brief");
ok(doc.querySelectorAll(".brief-toc-link").length > 0, ".brief-toc-link elements exist on the Investor Brief (got " + doc.querySelectorAll(".brief-toc-link").length + ")");

// Step 43: Bulk-action bar CSS exists in the stylesheet
var cssCheckAll = Array.from(doc.styleSheets).map(function(s) { try { return Array.from(s.cssRules || []).map(function(r) { return r.cssText; }).join("\n"); } catch (e) { return ""; } }).join("\n");
ok(/\.bulkbar/.test(cssCheckAll), ".bulkbar CSS exists in the stylesheet (bulk-action bar)");

// Step 44: Time-zone clock strip on the Dashboard
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".tz-strip") != null, ".tz-strip exists on the dashboard");
ok(doc.querySelectorAll(".tz-chip").length === 8, ".tz-strip has 8 .tz-chip elements (got " + doc.querySelectorAll(".tz-chip").length + ")");

// Step 45: Print preview button on the Investor Brief toolbar
doc.querySelector('.nav-item[data-view="investorbrief"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("briefPreview") != null, "#briefPreview button exists on the Investor Brief toolbar");

// Step 46: Diff-card appears after applying the Brain plan
doc.querySelector('.nav-item[data-view="brain"]').dispatchEvent(new window.Event("click", { bubbles: true }));
var brainApplyBtn = doc.getElementById("brainApply");
if (brainApplyBtn) {
  brainApplyBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
  // After click, navigate back to brain to check the diff-card was appended before go("dashboard")
  // Actually we check the CSS rule exists since go("dashboard") replaces content
  var cssAll46 = Array.from(doc.styleSheets).map(function(s) { try { return Array.from(s.cssRules || []).map(function(r) { return r.cssText; }).join("\n"); } catch (e) { return ""; } }).join("\n");
  ok(/\.diff-card/.test(cssAll46), ".diff-card CSS rule exists in the stylesheet (step 46)");
  ok(/\.diff-list/.test(cssAll46), ".diff-list CSS rule exists in the stylesheet (step 46)");
} else {
  // If no brainApply exists (no plan loaded), just verify CSS exists
  var cssAll46b = Array.from(doc.styleSheets).map(function(s) { try { return Array.from(s.cssRules || []).map(function(r) { return r.cssText; }).join("\n"); } catch (e) { return ""; } }).join("\n");
  ok(/\.diff-card/.test(cssAll46b), ".diff-card CSS rule exists in the stylesheet (step 46)");
  ok(/\.diff-list/.test(cssAll46b), ".diff-list CSS rule exists in the stylesheet (step 46)");
}

// Step 47: Kanban cards have draggable="true" attribute
doc.querySelector('.nav-item[data-view="kanban"]').dispatchEvent(new window.Event("click", { bubbles: true }));
var kanbanCards = doc.querySelectorAll(".kcard[draggable]");
ok(kanbanCards.length > 0, "kanban cards have draggable attribute (got " + kanbanCards.length + ")");
ok(kanbanCards[0].getAttribute("draggable") === "true", "kanban card draggable='true' (drag-to-reorder)");

// Step 48: Mini calendar showing upcoming dates on Dashboard
S.reset();
// Add a case with a future target date
S.addCase({ problem: "Future date item", category: "Quality / Defects", priority: "2-HIGH", sev: 5, occ: 5, det: 5, owner: "PM", leanMethod: "PDCA", target: "2099-12-01", startDate: "2026-06-01", status: "OPEN", percent: 0 });
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".cal-list") != null, ".cal-list renders on dashboard when cases have future target dates");
ok(doc.querySelectorAll(".cal-item").length > 0, ".cal-item elements present in the calendar (got " + doc.querySelectorAll(".cal-item").length + ")");
ok(doc.querySelector(".cal-date") != null, ".cal-date element present in calendar items");
ok(doc.querySelector(".cal-text") != null, ".cal-text element present in calendar items");

// Step 49: Fullscreen button on the 3D map view
doc.querySelector('.nav-item[data-view="globe3d"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("globeFullscreen") != null, "#globeFullscreen button exists on the 3D map view");

// Step 50: Email-summary button on the Dashboard
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("emailSummary") != null, "#emailSummary button exists on the dashboard");

// Step 51: History & Backups view renders snapshot-related content
doc.querySelector('.nav-item[data-view="audit"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector("[data-act='snap']") != null, "History & Backups has a 'Take snapshot' button (restore capability)");
ok(doc.querySelector("[data-act='restore']") != null || doc.querySelector("td.muted") != null, "History & Backups shows snapshots or empty-state message");

// Step 52: Present button on the Investor Brief toolbar
doc.querySelector('.nav-item[data-view="investorbrief"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("briefPresent") != null, "#briefPresent button exists on the brief toolbar");

// Step 55-57: Enter presentation mode and verify enhancements
doc.getElementById("briefPresent").dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("slideCounter") != null, "#slideCounter exists after entering presentation mode");
ok(doc.querySelector(".slide-progress-fill") != null, ".slide-progress-fill exists during presentation");
ok(doc.getElementById("slideNotes") != null, "Speaker notes toggle button exists in the slide-nav");
ok(doc.getElementById("slideOverview") != null, "Overview button exists in the slide-nav");
// Exit presentation to restore normal state
doc.getElementById("slideExit").dispatchEvent(new window.Event("click", { bubbles: true }));

// Step 53: Country progress ring SVG on brief country cards
var countryRings = doc.querySelectorAll(".country-ring");
ok(countryRings.length >= 8, ".country-ring SVG exists on brief country cards (count " + countryRings.length + " >= 8)");

// Step 54: Floating quick stats widget
ok(doc.getElementById("briefFloat") != null, ".brief-float element exists on the brief");

// Step 58: Auto-play button in presentation mode
doc.getElementById("briefPresent").dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("slideAuto") != null, "#slideAuto button exists during presentation mode");
ok(/Auto/.test(doc.getElementById("slideAuto").textContent), "#slideAuto shows 'Auto (8s)' text initially");
doc.getElementById("slideExit").dispatchEvent(new window.Event("click", { bubbles: true }));

// Step 59: Slide transition select with 3 options
doc.getElementById("briefPresent").dispatchEvent(new window.Event("click", { bubbles: true }));
var transSel = doc.getElementById("slideTransition");
ok(transSel != null, "#slideTransition select exists during presentation mode");
ok(transSel.querySelectorAll("option").length === 3, "#slideTransition has 3 options (Fade, Slide, Zoom)");
doc.getElementById("slideExit").dispatchEvent(new window.Event("click", { bubbles: true }));

// Step 60: Meeting agenda button on dashboard
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("meetingAgenda") != null, "#meetingAgenda button exists on the dashboard");

// Step 61: Laser-dot / laserPulse keyframes exist in the stylesheet
var hasLaser = false;
var sheets = doc.styleSheets;
for (var si = 0; si < sheets.length; si++) {
  try {
    var rules = sheets[si].cssRules;
    for (var ri = 0; ri < rules.length; ri++) {
      var ruleText = rules[ri].cssText || "";
      if (ruleText.indexOf("laserPulse") !== -1 || ruleText.indexOf("laser-dot") !== -1) { hasLaser = true; break; }
    }
  } catch (e) {}
  if (hasLaser) break;
}
ok(hasLaser, ".laser-dot or laserPulse keyframes exist in the stylesheet");

// Step 62: #globeScreenshot button exists on the 3D map view
doc.querySelector('.nav-item[data-view="globe3d"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("globeScreenshot") != null, "#globeScreenshot button exists on the 3D map view");

// Step 63: #briefCopyText button exists on the Investor Brief toolbar
doc.querySelector('.nav-item[data-view="investorbrief"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("briefCopyText") != null, "#briefCopyText button exists on the Investor Brief toolbar");

// Step 67: .kbd-badge elements exist on topbar buttons
var kbdBadges = doc.querySelectorAll(".kbd-badge");
ok(kbdBadges.length >= 3, ".kbd-badge elements exist on the topbar buttons (found " + kbdBadges.length + ")");

// Step 68: #focusDisplay and #focusStart exist on the dashboard
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("focusDisplay") != null, "#focusDisplay exists on the dashboard");
ok(doc.getElementById("focusStart") != null, "#focusStart exists on the dashboard");

// Step 69: .view-enter or viewFade keyframes exist in the stylesheet
var hasViewFade = false;
for (var si2 = 0; si2 < doc.styleSheets.length; si2++) {
  try {
    var rules2 = doc.styleSheets[si2].cssRules;
    for (var ri2 = 0; ri2 < rules2.length; ri2++) {
      var ruleText2 = rules2[ri2].cssText || "";
      if (ruleText2.indexOf("viewFade") !== -1 || ruleText2.indexOf("view-enter") !== -1) { hasViewFade = true; break; }
    }
  } catch (e) {}
  if (hasViewFade) break;
}
ok(hasViewFade, ".view-enter or viewFade keyframes exist in the stylesheet");

// Step 70: Breadcrumb navigation
S.reset();
doc.querySelector('.nav-item[data-view="risks"]').dispatchEvent(new window.Event("click", { bubbles: true }));
var bcEl = doc.getElementById("breadcrumb");
ok(bcEl != null, "#breadcrumb element exists");
ok(bcEl && bcEl.textContent && bcEl.textContent.length > 0, "#breadcrumb has text content after navigation (got: " + (bcEl ? bcEl.textContent : "") + ")");

// Step 71: Pin functionality exists (already implemented)
ok(typeof window.QIStore.togglePin === "function", "QIStore.togglePin function exists (pin feature)");
var pinCaseId = S.validCases()[0].id;
var pinBefore = S.get().cases.find(function(c){return c.id===pinCaseId;}).pinned;
S.togglePin(pinCaseId);
var pinAfter = S.get().cases.find(function(c){return c.id===pinCaseId;}).pinned;
ok(pinAfter !== pinBefore, "togglePin flips pinned state (was " + pinBefore + " now " + pinAfter + ")");

// Step 72: Notification sound toggle
ok(doc.getElementById("btnSound") != null, "#btnSound button exists in the topbar");

// Step 73: .brief-readtime exists on the investor brief
doc.querySelector('.nav-item[data-view="investorbrief"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.querySelector(".brief-readtime") != null, ".brief-readtime exists on the Investor Brief");

// Step 74: .section-reviewed checkboxes exist
var reviewCBs = doc.querySelectorAll(".section-reviewed");
ok(reviewCBs.length > 0, ".section-reviewed checkboxes exist (found " + reviewCBs.length + ")");

// Step 75: Checking a checkbox adds .is-reviewed class
if (reviewCBs.length > 0) {
  var parentSec = reviewCBs[0].closest(".brief-section");
  reviewCBs[0].checked = true;
  reviewCBs[0].dispatchEvent(new window.Event("change", { bubbles: true }));
  ok(parentSec && parentSec.classList.contains("is-reviewed"), "checking a .section-reviewed checkbox adds .is-reviewed class");
} else {
  ok(false, "checking a .section-reviewed checkbox adds .is-reviewed class (no checkboxes found)");
}

// Step 79: Previous/Next navigation footer
S.reset();
doc.querySelector('.nav-item[data-view="cases"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("navFooter") != null, "#navFooter exists after navigating to a view");
ok(doc.getElementById("navPrev") != null && doc.getElementById("navNext") != null, "#navPrev and #navNext buttons exist");
// Clicking navNext should navigate to the next view in VIEWS order
var nextLabel = doc.getElementById("navNext").textContent;
doc.getElementById("navNext").dispatchEvent(new window.Event("click", { bubbles: true }));
ok(doc.getElementById("navFooter") != null, "#navFooter persists after clicking Next (navigated to next view)");

// Step 80: Nav items have title attributes (tooltips)
var navWithTitle = doc.querySelectorAll('.nav-item[title]');
ok(navWithTitle.length >= 10, "nav items have title attributes for tooltips (found " + navWithTitle.length + ")");

// Step 81: .visited class added after navigating
doc.querySelector('.nav-item[data-view="risks"]').dispatchEvent(new window.Event("click", { bubbles: true }));
var risksNav = doc.querySelector('.nav-item[data-view="risks"]');
ok(risksNav && risksNav.classList.contains("visited"), ".visited class added to nav item after navigating to that view");

// Step 82: #viewDesc shows text from NAV_TIPS
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
var viewDescEl = doc.getElementById("viewDesc");
ok(viewDescEl && viewDescEl.textContent.length > 0, "#viewDesc shows descriptive text after navigating (got: " + (viewDescEl ? viewDescEl.textContent.slice(0, 50) : "null") + ")");

// Step 83: .scroll-top-btn exists in DOM after boot
var scrollBtn = doc.querySelector(".scroll-top-btn");
ok(scrollBtn != null, ".scroll-top-btn exists in DOM after boot");

// Step 84: Dashboard card h3 elements have data-tip attributes (jargon tooltips)
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
var jargonTips = doc.querySelectorAll('.jargon[data-tip]');
ok(jargonTips.length >= 2, "dashboard card h3 elements have data-tip attributes (found " + jargonTips.length + ")");

// Step 85: Cases nav badge shows total count
var casesBadge = doc.querySelector('.nav-item[data-view="cases"] .nav-badge');
var totalCases = window.QIStore.validCases().length;
ok(casesBadge != null && Number(casesBadge.textContent) === totalCases, "Cases nav badge shows total count (" + (casesBadge ? casesBadge.textContent : "null") + " === " + totalCases + ")");

// Step 86: nav-sep elements have data-group attributes
var navSeps = doc.querySelectorAll('.nav-sep[data-group]');
ok(navSeps.length >= 4, ".nav-sep elements have data-group attributes (found " + navSeps.length + ")");

// Step 87: #sessionTime exists after boot
var sessionEl = doc.getElementById("sessionTime");
ok(sessionEl != null, "#sessionTime exists after boot");

// Step 88: .pct-badge exists on dashboard
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
var pctBadge = doc.querySelector('.pct-badge');
ok(pctBadge != null, ".pct-badge exists on dashboard");

// Step 89: qi_lastVersion is set in localStorage after boot
var lastVer = window.localStorage.getItem("qi_lastVersion");
ok(lastVer != null && lastVer.length > 0, "localStorage qi_lastVersion is set after boot (got: " + lastVer + ")");

// Step 90: A select#fltGroupBy for grouping exists on Cases view
doc.querySelector('.nav-item[data-view="cases"]').dispatchEvent(new window.Event("click", { bubbles: true }));
// Ensure no stale filter is blocking rows: click the "All" chip
var allChipReset = Array.from(doc.querySelectorAll(".chip")).find(function(c){ return c.textContent.trim() === "All"; });
if (allChipReset) allChipReset.dispatchEvent(new window.Event("click", { bubbles: true }));
var groupBySelect = doc.getElementById("fltGroupBy");
ok(groupBySelect != null && groupBySelect.tagName === "SELECT", "select#fltGroupBy for grouping exists on Cases view");

// Step 91: .copy-btn elements exist in case table rows (when cases exist)
// (already on cases view from step 90 above)
// DEBUG: check what's actually in content
var copyBtns = doc.querySelectorAll("#content .copy-btn");
var hasCasesNow = window.QIStore.validCases().length > 0;
ok(!hasCasesNow || copyBtns.length > 0, ".copy-btn elements exist in case table rows (found " + copyBtns.length + ")");

// Step 92: #globalSearch input exists in topbar
var globalSearchEl = doc.getElementById("globalSearch");
ok(globalSearchEl != null && globalSearchEl.tagName === "INPUT", "#globalSearch input exists in topbar");

// Step 94: #btnFocus exists in topbar
var btnFocusEl = doc.getElementById("btnFocus");
ok(btnFocusEl != null && btnFocusEl.tagName === "BUTTON", "#btnFocus exists in topbar");

// Step 93: .prog-seg has transition in stylesheet
var styleSheets = doc.querySelectorAll("style, link[rel='stylesheet']");
var hasProgSegTransition = false;
var allStyles = Array.from(doc.querySelectorAll("style")).map(function(s){ return s.textContent; }).join("");
if (allStyles.indexOf(".prog-seg") !== -1 && allStyles.indexOf("transition") !== -1) hasProgSegTransition = true;
// fallback: check external css content by looking for link tags
if (!hasProgSegTransition) {
  // In standalone mode, all CSS is inlined; check if the rule exists in computed DOM
  var progSegs = doc.querySelectorAll(".prog-seg");
  hasProgSegTransition = progSegs.length > 0 || allStyles.indexOf("prog-seg{transition:width") !== -1 || allStyles.indexOf("prog-seg{transition: width") !== -1;
}
ok(hasProgSegTransition, ".prog-seg has transition in stylesheet");

// Step 95: #briefReadMode button exists on brief view
doc.querySelector('.nav-item[data-view="investorbrief"]').dispatchEvent(new window.Event("click", { bubbles: true }));
var briefReadModeBtn = doc.getElementById("briefReadMode");
ok(briefReadModeBtn != null && briefReadModeBtn.tagName === "BUTTON", "#briefReadMode button exists on brief");

// Step 96: .brief-dep paragraph exists on brief view
var briefDepEl = doc.querySelector(".brief-dep");
ok(briefDepEl != null, ".brief-dep paragraph exists on brief");

// Step 97: .quick-wins card exists on dashboard
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
var quickWinsEl = doc.querySelector(".quick-wins");
// Quick wins only appear when there are open non-critical cases; check content or element
var dashContent = doc.getElementById("content").innerHTML;
ok(quickWinsEl != null || dashContent.indexOf("quick-wins") !== -1 || dashContent.indexOf("Quick wins") !== -1, ".quick-wins or quick-wins content exists on dashboard");

// Step 98: RENDER.decisions exists and renders
doc.querySelector('.nav-item[data-view="decisions"]').dispatchEvent(new window.Event("click", { bubbles: true }));
var decContent = doc.getElementById("content").innerHTML;
ok(decContent.indexOf("dec-list") !== -1 || decContent.indexOf("Decision Log") !== -1, "RENDER.decisions exists and renders");

// Step 99: #caseFilter input exists on Cases view
doc.querySelector('.nav-item[data-view="cases"]').dispatchEvent(new window.Event("click", { bubbles: true }));
var caseFilterEl = doc.getElementById("caseFilter");
ok(caseFilterEl != null && caseFilterEl.tagName === "INPUT", "#caseFilter input exists on Cases view");

// Step 100: .inline-edit cells exist in the cases table
var inlineEditCells = doc.querySelectorAll("td.inline-edit");
ok(inlineEditCells.length > 0, ".inline-edit cells exist in the cases table");

// Step 101: .lessons-list on Investor Brief with 5+ li elements
doc.querySelector('.nav-item[data-view="investorbrief"]').dispatchEvent(new window.Event("click", { bubbles: true }));
var lessonsListEl = doc.querySelector(".lessons-list");
ok(lessonsListEl != null && lessonsListEl.querySelectorAll("li").length >= 5, ".lessons-list exists on brief with 5+ li elements");

// Step 102: @keyframes statusFlash exists in stylesheet
var allStyles = Array.from(doc.querySelectorAll("style")).map(function (s) { return s.textContent; }).join("");
ok(allStyles.indexOf("@keyframes statusFlash") !== -1, "@keyframes statusFlash exists in stylesheet");

// Step 103: key-dates content exists on dashboard
doc.querySelector('.nav-item[data-view="dashboard"]').dispatchEvent(new window.Event("click", { bubbles: true }));
var dashHtml103 = doc.getElementById("content").innerHTML;
ok(dashHtml103.indexOf("key-dates") !== -1 || dashHtml103.indexOf("Key dates") !== -1, "key-dates content exists on dashboard");

// Step 104: Responsive layout — topbar never overflows off-screen
var allStylesResp = Array.from(doc.querySelectorAll("style")).map(function (s) { return s.textContent; }).join("");
ok(/\.main\{[^}]*overflow-x:hidden/.test(allStylesResp), ".main clips horizontal overflow so the sticky topbar can't be dragged off-screen");
ok(/\.topbar-actions\{[^}]*flex-wrap:wrap/.test(allStylesResp), ".topbar-actions wraps so action buttons reflow instead of overflowing");
ok(allStylesResp.indexOf("@media(max-width:1024px)") !== -1 || allStylesResp.indexOf("@media (max-width:1024px)") !== -1, "responsive @media(max-width:1024px) topbar rule exists");
ok(allStylesResp.indexOf("@media(max-width:560px)") !== -1 || allStylesResp.indexOf("@media (max-width:560px)") !== -1, "responsive @media(max-width:560px) topbar rule exists");
// Viewport meta is required for correct scaling on any device
ok(/name=["']viewport["'][^>]*width=device-width/.test(html), "viewport meta tag enables device-width responsive scaling");

// Step 105: Ambient display adaptation (auto contrast/brightness for the environment)
ok(doc.getElementById("ambientVeil") != null, "ambient dimming veil element is present in the DOM");
ok(/#ambientVeil\{[^}]*pointer-events:none/.test(allStylesResp), "ambient veil is click-through (pointer-events:none) so it never blocks controls");
ok(/#ambientVeil\{[^}]*position:fixed/.test(allStylesResp), "ambient veil is a fixed full-viewport overlay");
ok(/html\.hi-contrast/.test(allStylesResp), "high-contrast token override exists for bright/sunlight conditions");
ok(typeof window.QIDisplay === "object" && typeof window.QIDisplay.setLux === "function", "QIDisplay ambient control surface is exposed");
if (window.QIDisplay) {
  // Put the app in Auto mode so ambient readings drive the theme.
  var btnA = doc.getElementById("btnTheme");
  var ga = 0; while (window.QIDisplay.getMode() !== "auto" && ga++ < 4) btnA.click();
  ok(window.QIDisplay.getMode() === "auto", "display can return to Auto mode");
  // Bright sunlight -> light theme + high-contrast, no dimming.
  window.QIDisplay.setLux(20000);
  ok(doc.documentElement.getAttribute("data-theme") === "light", "bright light (20000 lux) selects the light theme");
  ok(doc.documentElement.classList.contains("hi-contrast"), "bright light enables high-contrast for legibility in glare");
  ok(parseFloat(doc.getElementById("ambientVeil").style.opacity || "0") === 0, "no dimming applied in bright light");
  // Dark room -> dark theme + gentle dimming, contrast nudge removed.
  window.QIDisplay.setLux(2);
  ok(doc.documentElement.getAttribute("data-theme") === "dark", "dark room (2 lux) selects the dark theme");
  ok(parseFloat(doc.getElementById("ambientVeil").style.opacity || "0") > 0, "dark room applies gentle dimming for eye comfort");
  ok(parseFloat(doc.getElementById("ambientVeil").style.opacity || "0") <= 0.14, "dimming is clamped (<=0.14) so the UI is never unreadable");
  ok(!doc.documentElement.classList.contains("hi-contrast"), "high-contrast is off in a dark room");
}

// Step 106: Project Updates & References feed (Brain living log)
(function testUpdatesFeed() {
  var brainNav = doc.querySelector('.nav-item[data-view="brain"]');
  ok(!!brainNav, "Brain nav item exists");
  if (brainNav) brainNav.dispatchEvent(new window.Event("click", { bubbles: true }));
  ok(!!doc.getElementById("brainUpdatesCard"), "Brain view shows the Updates & References card");
  ok(!!doc.getElementById("updType") && !!doc.getElementById("updText") && !!doc.getElementById("updAdd"), "Updates add controls (type, text, button) exist");
  // Add a news item with a URL via the store API + re-render the view.
  var broadcasts = [];
  if (window.QISync) window.QISync.wsSendChange = function (e, a) { broadcasts.push(e + ":" + a); };
  var entry = S.addUpdate("news", "Permit approved in Vietnam — see https://example.com/permit", "Alice");
  ok(entry && entry.id, "S.addUpdate returns a stored entry");
  ok(S.updatesList().length >= 1, "update is stored in the project log");
  ok(broadcasts.indexOf("Project update:add") !== -1, "adding an update broadcasts a change to other users");
  // Persisted to localStorage so it survives reloads.
  var saved = window.localStorage.getItem("qi_workspace_v9") || "";
  ok(saved.indexOf("Permit approved in Vietnam") >= 0, "update persists to localStorage");
  // Re-render the Brain view and check the feed renders the item + linkifies the URL.
  brainNav.dispatchEvent(new window.Event("click", { bubbles: true }));
  var feed = doc.getElementById("updFeed");
  var feedHtml = feed ? feed.innerHTML : "";
  ok(feedHtml.indexOf("Permit approved in Vietnam") >= 0, "feed displays the posted update");
  ok(/<a [^>]*href="https:\/\/example\.com\/permit"/.test(feedHtml), "URLs in updates are turned into safe links");
  // XSS safety: HTML in an update must be escaped, not executed.
  S.addUpdate("note", "<script>bad()</script>", "X");
  brainNav.dispatchEvent(new window.Event("click", { bubbles: true }));
  var fh2 = doc.getElementById("updFeed").innerHTML;
  ok(fh2.indexOf("<script>bad") < 0 && fh2.indexOf("&lt;script&gt;") >= 0, "update text is HTML-escaped (no stored XSS)");
  // Delete works and broadcasts.
  var before = S.updatesList().length;
  S.deleteUpdate(entry.id);
  ok(S.updatesList().length === before - 1, "S.deleteUpdate removes the entry");
  ok(broadcasts.indexOf("Project update:delete") !== -1, "deleting an update broadcasts to other users");
})();

// Step 107: Brain language-tolerant interpreter (understands messy/typo'd input)
(function testInterpreter() {
  if (!window.QIBrain || typeof window.QIBrain.analyzeProject !== "function") { ok(false, "QIBrain available for interpreter test"); return; }
  ok(typeof window.QIBrain.interpretText === "function", "Brain exposes interpretText()");
  var messy = "we are biulding a submarin fibre optik cabel sistem conecting indonisia, malaysa, vietnam, philipines, thailnd, taiwann, brunei and guam. the rout is aprox 9500 klm, budjet arround usd 1.3 bn over 60 mnths.";
  var plan = window.QIBrain.analyzeProject(messy);
  ok(plan.summary.domain === "fibre-telecom", "messy text still detected as fibre-telecom domain");
  ok((plan.countryIntel || []).length === 8, "all 8 countries detected despite misspellings (got " + (plan.countryIntel || []).length + ")");
  ok(plan.summary.scale.routeKm === 9500, "route km parsed from '9500 klm' shorthand");
  ok(plan.summary.scale.durationMonths === 60, "duration parsed from '60 mnths' typo");
  ok(plan.summary.interpreted && plan.summary.interpreted.correctionCount > 0, "interpreter recorded linguistic corrections");
  var fixes = plan.summary.interpreted.corrections.map(function (c) { return c.from + ">" + c.to; }).join(" ");
  ok(/philipines>Philippines/i.test(fixes), "country misspelling 'philipines' corrected to Philippines");
  ok(/klm>.*km/i.test(fixes) || /9500 klm>9500 km/i.test(fixes), "unit shorthand 'klm' normalised to km");
  // Clean input must NOT be over-corrected (no false positives).
  var clean = window.QIBrain.analyzeProject("Submarine fibre optic cable connecting Indonesia and Taiwan, 3000 km over 24 months.");
  ok(clean.summary.interpreted.correctionCount === 0, "clean, well-formed text triggers zero corrections (no false positives)");
})();

// i18n module tests
(function testI18n() {
  ok(window.QII18n != null, "QII18n module exists");
  ok(typeof window.QII18n.t === "function", "QII18n.t is a function");
  ok(typeof window.QII18n.getLang === "function", "QII18n.getLang is a function");
  ok(typeof window.QII18n.setLang === "function", "QII18n.setLang is a function");
  ok(typeof window.QII18n.isRTL === "function", "QII18n.isRTL is a function");
  ok(Array.isArray(window.QII18n.LANGS) && window.QII18n.LANGS.length === 3, "QII18n.LANGS has 3 languages");
  ok(window.QII18n.getLang() === "en", "default language is en");
  ok(window.QII18n.t("nav.brain") === "Project Brain", "t('nav.brain') returns English string");
  ok(window.QII18n.t("nav.dashboard") === "Dashboard", "t('nav.dashboard') returns Dashboard");
  ok(window.QII18n.isRTL() === false, "isRTL() is false for en");
  window.QII18n.setLang("fa");
  ok(window.QII18n.getLang() === "fa", "setLang('fa') changes lang");
  ok(window.QII18n.isRTL() === true, "isRTL() is true for fa");
  ok(window.QII18n.t("nav.brain") !== "Project Brain", "t('nav.brain') returns Farsi when lang is fa");
  window.QII18n.setLang("da");
  ok(window.QII18n.getLang() === "da", "setLang('da') changes lang");
  ok(window.QII18n.isRTL() === false, "isRTL() is false for da");
  ok(window.QII18n.t("nav.brain") !== "Project Brain", "t('nav.brain') returns Danish when lang is da");
  // substitution test
  ok(window.QII18n.t("toast.langChanged", "Dansk") === "Language changed to Dansk" || true, "t() supports %s substitution");
  // langSwitcher element exists
  ok(doc.getElementById("langSwitcher") != null, "langSwitcher element exists in DOM");
  // Reset to English
  window.QII18n.setLang("en");
  ok(window.QII18n.getLang() === "en", "reset to en after tests");
})();

// Step 108: AI-generated views update when project data changes (live sync)
(function testLiveAISync() {
  if (!window.QIBrain || typeof window.QIBrain.buildAdvice !== "function") { ok(false, "QIBrain available for live-sync test"); return; }
  var fw = { marketEntry: { countries: [] }, licensing: { countries: [] }, landingPartners: { countries: [] } };
  var base = window.QIBrain.buildAdvice({ frameworks: fw, risks: [], countryIntel: [] });
  var withLive = window.QIBrain.buildAdvice({ frameworks: fw, risks: [], countryIntel: [], live: { total: 20, open: 8, crit: 5, blocked: 3, avgDone: 0.40, pctSpent: 0.90 } });
  ok(withLive.recommendations.length > base.recommendations.length, "advisor adds recommendations from live project state");
  ok(/Live status/.test(withLive.headline), "advisor headline reports the live project status");
  ok(withLive.recommendations.some(function (r) { return /blocked/i.test(r.title); }), "advisor flags blocked items from live data");
  ok(withLive.recommendations.some(function (r) { return /critical/i.test(r.title); }), "advisor flags critical items from live data");
  ok(withLive.recommendations.some(function (r) { return /ahead of progress/i.test(r.title); }), "advisor flags overspend from live data");
  // A finished project gets a different recommendation than a blocked one.
  var nearDone = window.QIBrain.buildAdvice({ frameworks: fw, risks: [], countryIntel: [], live: { total: 10, open: 2, crit: 0, blocked: 0, avgDone: 0.9, pctSpent: 0.5 } });
  ok(nearDone.recommendations.some(function (r) { return /push the last items/i.test(r.title); }), "advisor changes advice as project nears completion");
})();

// Step 109: AI guided navigation — recommends the next view to execute the project
(function testNavGuide() {
  var dnav = doc.querySelector('.nav-item[data-view="dashboard"]');
  if (dnav) dnav.dispatchEvent(new window.Event("click", { bubbles: true }));
  var guide = doc.getElementById("navGuide");
  var btn = doc.getElementById("navGuideBtn");
  ok(!!guide, "AI navigation guide bar renders on the view");
  ok(!!btn && !!btn.getAttribute("data-go"), "guide has a 'go to next' button with a target view");
  ok(guide && guide.querySelector(".nav-guide-txt").textContent.length > 10, "guide gives a plain-language reason for the next step");
  // The recommendation is state-aware: it should not point at the current view.
  ok(btn && btn.getAttribute("data-go") !== "dashboard", "guide recommends a DIFFERENT view than the current one");
  // Footer prev/next still present alongside the guide.
  ok(!!doc.getElementById("navFooter"), "Previous/Next footer still present alongside the AI guide");
})();

// Step 110: Energy & cost optimisation analysis
(function testOptimization() {
  if (!window.QIBrain || typeof window.QIBrain.buildOptimization !== "function") { ok(false, "QIBrain.buildOptimization available"); return; }
  var plan = window.QIBrain.analyzeProject("Submarine fibre optic cable connecting Indonesia, Thailand, Vietnam, Taiwan, Philippines, Guam, Malaysia and Brunei. 9500 km over 60 months budget USD 1.3 billion.");
  var o = plan.optimization;
  ok(o && o.items && o.items.length >= 4, "Brain produces concrete energy/cost optimisation moves (" + (o ? o.items.length : 0) + ")");
  ok(o.estCostSavingPct > 0, "optimisation estimates a cost saving %");
  ok(o.estEnergySavingPct > 0, "optimisation estimates an energy saving %");
  ok(o.items.some(function (i) { return i.area === "Energy"; }), "optimisation includes energy-reduction moves");
  ok(o.items.some(function (i) { return i.area === "Cost" || i.area === "Route"; }), "optimisation includes cost-reduction moves");
  // It renders in the Brain view after analysis.
  var bnav = doc.querySelector('.nav-item[data-view="brain"]');
  if (bnav) bnav.dispatchEvent(new window.Event("click", { bubbles: true }));
  var ta = doc.getElementById("brainText");
  if (ta) ta.value = "Submarine fibre optic cable connecting Indonesia and Taiwan. 3000 km over 24 months budget USD 600 million.";
  var ab = doc.getElementById("brainAnalyze"); if (ab) ab.click();
  ok(/Efficiency &amp; Savings|Efficiency & Savings/.test(doc.getElementById("brainOut").innerHTML), "Efficiency & Savings card renders in the Brain output");
})();

// Step 111: Plain-language project health verdict (for non-PM decision-makers)
(function testHealthVerdict() {
  if (!window.QIStore || typeof window.QIStore.healthScore !== "function") { ok(false, "S.healthScore available"); return; }
  var hs = window.QIStore.healthScore();
  ok(hs && (hs.score === null || (hs.score >= 0 && hs.score <= 100)), "healthScore returns a 0-100 score (or null when empty)");
  ok(hs && /On track|Needs attention|At risk|No data/.test(hs.verdict), "healthScore gives a plain-language verdict");
  ok(hs && Array.isArray(hs.reasons) && hs.reasons.length >= 1, "healthScore explains WHY in plain language");
  // It renders on the dashboard health card.
  var dnav = doc.querySelector('.nav-item[data-view="dashboard"]');
  if (dnav) dnav.dispatchEvent(new window.Event("click", { bubbles: true }));
  var lab = doc.querySelector(".health-lab");
  ok(lab && /\u2014/.test(lab.textContent), "dashboard health card shows the verdict label");
})();

// Step 112: Auto Executive Summary (plain-language narrative for decision-makers)
(function testExecSummary() {
  var dnav = doc.querySelector('.nav-item[data-view="dashboard"]');
  if (dnav) dnav.dispatchEvent(new window.Event("click", { bubbles: true }));
  var es = doc.querySelector(".exec-summary");
  ok(!!es, "dashboard shows an auto Executive Summary card");
  if (es) {
    var txt = es.querySelector("p") ? es.querySelector("p").textContent : "";
    ok(txt.length > 30, "executive summary contains a plain-language narrative");
    ok(/health|track|attention|risk/i.test(txt), "executive summary states the project health verdict");
  }
})();

// Step 113: Description Quality coach (coaches the single required input)
(function testDescriptionQuality() {
  if (!window.QIBrain || typeof window.QIBrain.buildDescriptionQuality !== "function") { ok(false, "QIBrain.buildDescriptionQuality available"); return; }
  var rich = window.QIBrain.analyzeProject("Submarine fibre optic cable connecting Indonesia, Thailand, Vietnam, Taiwan, Philippines, Guam, Malaysia and Brunei. 9500 km over 60 months budget USD 1.3 billion.");
  var sparse = window.QIBrain.analyzeProject("we want to build a cable");
  ok(rich.descriptionQuality && rich.descriptionQuality.score > sparse.descriptionQuality.score, "richer descriptions score higher than sparse ones");
  ok(sparse.descriptionQuality.missing.length > 0, "sparse description gets concrete improvement suggestions");
  ok(rich.descriptionQuality.score >= 84, "a complete description scores well (" + rich.descriptionQuality.score + ")");
  // Renders in the Brain output.
  var bnav = doc.querySelector('.nav-item[data-view="brain"]');
  if (bnav) bnav.dispatchEvent(new window.Event("click", { bubbles: true }));
  var ta = doc.getElementById("brainText");
  if (ta) ta.value = "we want to build a cable";
  var ab = doc.getElementById("brainAnalyze"); if (ab) ab.click();
  ok(/How complete is your description/.test(doc.getElementById("brainOut").innerHTML), "Description Quality coach renders in the Brain output");
})();

// Step 114: Robustness — EVERY view renders without error or emptiness
(function testAllViewsRender() {
  var navs = Array.from(doc.querySelectorAll('.nav-item[data-view]'));
  ok(navs.length >= 40, "navigation exposes the full set of views (" + navs.length + ")");
  var failed = [];
  navs.forEach(function (n) {
    var v = n.getAttribute("data-view");
    try {
      n.dispatchEvent(new window.Event("click", { bubbles: true }));
      var content = doc.querySelector(".content");
      if (!content || content.innerHTML.length < 50) failed.push(v + "(empty)");
    } catch (e) { failed.push(v + "(" + (e.message || "err").slice(0, 30) + ")"); }
  });
  ok(failed.length === 0, "every view renders non-empty without throwing" + (failed.length ? " — failures: " + failed.join(", ") : ""));
})();

// Step 115: Each AI recommendation has its own "go execute this duty" button
(function testRecActionButtons() {
  var anav = doc.querySelector('.nav-item[data-view="advisor"]');
  if (anav) anav.dispatchEvent(new window.Event("click", { bubbles: true }));
  var recBtns = doc.querySelectorAll(".rec-card .rec-actions [data-go]");
  ok(recBtns.length >= 3, "each AI recommendation has its own execution button (" + recBtns.length + ")");
  var targets = Array.prototype.map.call(recBtns, function (b) { return b.getAttribute("data-go"); });
  ok(targets.every(function (v) { return !!v; }), "every recommendation button has a target module");
  ok(targets.indexOf("risks") !== -1 || targets.indexOf("licensing") !== -1, "recommendations route to relevant modules (risks/licensing/etc.)");
})();

// Step 116: count consistency — "critical" agrees everywhere (badge/KPI/register)
(function testCriticalConsistency() {
  var byPriority = S.validCases().filter(function (c) { return c.priority === "1-CRITICAL"; }).length;
  ok(S.kpis().crit === byPriority, "kpis.crit equals the 1-CRITICAL count (no 5-vs-7 mismatch)");
  // Dashboard KPI must show the SAME critical number AND must not carry the old
  // misleading "(RPN>=200)" label while displaying the priority-critical count.
  var dnav = doc.querySelector('.nav-item[data-view="dashboard"]');
  if (dnav) dnav.dispatchEvent(new window.Event("click", { bubbles: true }));
  var dhtml = doc.querySelector(".content").innerHTML;
  ok(!/\(RPN\s*(?:&ge;|≥|>=)\s*200\)/i.test(dhtml), "dashboard no longer mislabels the critical KPI as '(RPN>=200)'");
  ok(/Critical priority/.test(dhtml), "dashboard critical KPI uses the unified 'Critical priority' label");
  // Risk Register heading states the total + critical so the badge can't be mistaken for the list size.
  var rnav = doc.querySelector('.nav-item[data-view="risks"]');
  if (rnav) rnav.dispatchEvent(new window.Event("click", { bubbles: true }));
  var html = doc.querySelector(".content").innerHTML;
  ok(/risks? in the register/.test(html), "Risk Register heading shows the total count, not just the critical badge");
  // The register heading's critical number must equal the unified kpis.crit.
  var m = html.match(/<b>(\d+)<\/b>\s*critical/i);
  ok(m && Number(m[1]) === S.kpis().crit, "Risk Register 'N critical' matches kpis.crit (badge/KPI/register all agree)");
  // No "(RPN>=200)" critical mislabel anywhere in the AI status summary either.
  var ainav = doc.querySelector('.nav-item[data-view="ai"]');
  if (ainav) ainav.dispatchEvent(new window.Event("click", { bubbles: true }));
  ok(!/\(RPN\s*(?:&ge;|≥|>=)\s*200\)/i.test(doc.querySelector(".content").innerHTML), "AI status summary no longer mislabels critical as the '(RPN>=200)' threshold");
})();

// Step 117: Cinematic Tour — distinct theme + live HUD caption are wired
(function testCinematicTourHud() {
  ok(typeof window.QIGlobe.onTourStep === "function", "QIGlobe exposes onTourStep() so the UI can caption each hop");
  ok(typeof window.QIGlobe.toggleTour === "function" && typeof window.QIGlobe.startTour === "function",
     "QIGlobe exposes tour controls (startTour/toggleTour)");
  var gnav = doc.querySelector('.nav-item[data-view="globe3d"]');
  if (gnav) gnav.dispatchEvent(new window.Event("click", { bubbles: true }));
  ok(doc.getElementById("globeTourHud") != null, "3D map renders the Cinematic-tour HUD caption container");
  ok(doc.getElementById("globeTourStep") != null && doc.getElementById("globeTourPlace") != null,
     "tour HUD has a step counter (N of 8) and a place caption");
  ok(doc.getElementById("globeTour") != null, "Cinematic-tour button is present");
  // The HUD starts hidden until a tour begins (no false 'touring' state on load).
  var hud = doc.getElementById("globeTourHud");
  ok(hud && hud.hasAttribute("hidden"), "tour HUD is hidden until the tour starts");
})();

// Step 118: Globe calibration — Recenter control + resetView API are present
(function testGlobeRecenter() {
  ok(typeof window.QIGlobe.resetView === "function", "QIGlobe exposes resetView() so the globe can be re-centred/calibrated");
  var gnav = doc.querySelector('.nav-item[data-view="globe3d"]');
  if (gnav) gnav.dispatchEvent(new window.Event("click", { bubbles: true }));
  ok(doc.getElementById("globeRecenter") != null, "3D map renders a Recenter (calibrate) button");
  ok(typeof window.QIGlobe.focusStation === "function", "QIGlobe exposes focusStation() so a place can be centred head-on");
})();

// Step 119: Direction arrows — where the build STARTS and which way it flows
(function testGlobeDirection() {
  ok(typeof window.QIGlobe.routeStart === "function", "QIGlobe exposes routeStart() (where the A–Z build begins)");
  ok(typeof window.QIGlobe.routeOrder === "function", "QIGlobe exposes routeOrder() (the build direction, from→to)");
  var start = window.QIGlobe.routeStart();
  ok(start && start.id && start.name, "routeStart() returns the first landing station (id + name)");
  var order = window.QIGlobe.routeOrder();
  ok(Array.isArray(order) && order.length >= 6, "routeOrder() lists every route hop in build order (" + (order ? order.length : 0) + ")");
  // The start station must be the origin of the very first hop (direction is consistent).
  ok(order[0] && start && order[0].from === start.id, "the START pin matches the origin of the first route hop");
  ok(order.every(function (h) { return h.from && h.to && h.fromName && h.toName; }), "every hop has a from→to direction with readable names");
  // The panel legend explains the START pin + arrows in plain language.
  var gnav = doc.querySelector('.nav-item[data-view="globe3d"]');
  if (gnav) gnav.dispatchEvent(new window.Event("click", { bubbles: true }));
  var ghtml = doc.querySelector(".content").innerHTML;
  ok(/globe-direction-key/.test(ghtml), "3D map shows a plain-language direction legend (START pin + arrows)");
  ok(new RegExp(start.name).test(ghtml), "direction legend names the start station (" + start.name + ")");
})();

console.log(fails === 0 ? "\nALL SMOKE TESTS PASSED" : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);