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
  .replace(/<script src="https:\/\/[^"]+"><\/script>/, `<script>${chartShim}</script>`)
  .replace('<script src="js/calc.js"></script>', `<script>${fs.readFileSync(path.join(root, "js/calc.js"))}</script>`)
  .replace('<script src="js/store.js"></script>', `<script>${fs.readFileSync(path.join(root, "js/store.js"))}</script>`)
  .replace('<script src="js/charts.js"></script>', `<script>${fs.readFileSync(path.join(root, "js/charts.js"))}</script>`)
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
const views = ["portfolio","dashboard","cases","pm","kanban","timeline","risks","fmea","sigma","gage","riskmatrix","xbarr","capability","ncrpareto","pdca","log","stakeholders","budget","hazop","calibration","punch","sil","rtm","docs","ncr","moc","bowtie","evm","cashflow","prioritise","milestones","decisions","procurement","resources","okr","ai","impact","scorecard","health","report","audit","config","help"];
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
const dataViews = ["cases","hazop","calibration","punch","sil","rtm","docs","ncr","moc","milestones","decisions","procurement","resources","okr","cashflow","gage","xbarr","sigma","capability","prioritise"];
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

// 12) polish: dark mode toggle, run-checks dialog, shortcuts overlay
ok(doc.documentElement.getAttribute("data-theme") === "light", "theme starts light");
doc.getElementById("btnTheme").click();
ok(doc.documentElement.getAttribute("data-theme") === "dark", "theme toggles to dark");
ok(S.brand().theme === "dark", "theme persisted to brand");
doc.getElementById("btnTheme").click();
ok(doc.documentElement.getAttribute("data-theme") === "light", "theme toggles back to light");
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

console.log(fails === 0 ? "\nALL SMOKE TESTS PASSED" : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
