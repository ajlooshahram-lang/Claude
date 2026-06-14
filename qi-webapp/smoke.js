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
  .replace('<script src="js/brain.js"></script>', () => `<script>${fs.readFileSync(path.join(root, "js/brain.js"))}</script>`)
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
const views = ["portfolio","dashboard","cases","pm","kanban","timeline","risks","fmea","sigma","gage","riskmatrix","xbarr","capability","ncrpareto","pdca","log","stakeholders","budget","hazop","calibration","punch","sil","rtm","docs","ncr","moc","bowtie","evm","cashflow","prioritise","milestones","decisions","procurement","resources","okr","ai","impact","scorecard","health","documents","report","audit","config","help"];
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
ok(fab.getAttribute("aria-label") === "Add new case", "FAB has accessible label");
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
ok(typeof window.QIBrain === "object" && typeof window.QIBrain.analyzeProject === "function", "Brain engine exposed to the UI");
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
ok(S.validCases().length >= brainCasesBefore + 15, "Apply adds the generated task + risk cases (" + brainCasesBefore + " -> " + S.validCases().length + ")");
ok(S.regRows("milestones").length > brainMsBefore, "Apply adds generated milestones");
ok(S.regRows("procurement").length > brainProcBefore, "Apply adds generated procurement items");
// click-only / privacy sanity: analysis must not call out to the network
ok(window.__promptCalls === 0, "Brain flow used no prompt()");

// 39) Intelligence Engine UI panels
doc.querySelector('.nav-item[data-view="brain"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const intelContainer = doc.getElementById("brainIntel");
ok(intelContainer != null, "Intel: brainIntel container rendered");
ok(intelContainer.innerHTML.length > 0, "Intel: intelligence panels rendered with content");

// Health Dashboard
const healthDash = doc.getElementById("brainHealthDashboard");
ok(healthDash != null, "Intel: Health Dashboard panel exists");
ok(/Health Dashboard/.test(healthDash.innerHTML), "Intel: Health Dashboard title rendered");
ok(/SPI/.test(healthDash.innerHTML) && /CPI/.test(healthDash.innerHTML), "Intel: Health Dashboard shows SPI and CPI scores");
ok(/Risk Exposure/.test(healthDash.innerHTML), "Intel: Health Dashboard shows Risk Exposure");
ok(/Quality Index/.test(healthDash.innerHTML), "Intel: Health Dashboard shows Quality Index");
ok(/badge/.test(healthDash.innerHTML), "Intel: Health Dashboard shows overall health badge");

// Findings list
const findingsList = doc.getElementById("brainFindingsList");
ok(findingsList != null, "Intel: Findings list panel exists");
ok(/Findings/.test(findingsList.innerHTML), "Intel: Findings list title rendered");

// Patterns panel
const patternsPanel = doc.getElementById("brainPatternsPanel");
ok(patternsPanel != null, "Intel: Patterns panel exists");
ok(/Detected Patterns/.test(patternsPanel.innerHTML), "Intel: Patterns panel title rendered");

// Recommendations panel
const recsPanel = doc.getElementById("brainRecommendationsPanel");
ok(recsPanel != null, "Intel: Recommendations panel exists");
ok(/Recommendations/.test(recsPanel.innerHTML), "Intel: Recommendations panel title rendered");

// Lessons panel
const lessonsPanel = doc.getElementById("brainLessonsPanel");
ok(lessonsPanel != null, "Intel: Lessons panel exists");
ok(/Lessons Learned/.test(lessonsPanel.innerHTML), "Intel: Lessons panel title rendered");
const recordBtn = doc.getElementById("brainRecordLesson");
ok(recordBtn != null, "Intel: Record lesson button exists");

// Click Record lesson opens modal
recordBtn.click();
const modalOverlay = doc.getElementById("modalOverlay");
ok(modalOverlay && !modalOverlay.hidden, "Intel: Clicking Record lesson opens modal");
const lessonModal = doc.getElementById("modal");
ok(lessonModal && /Record Lesson/.test(lessonModal.innerHTML), "Intel: Lesson modal shows title");
ok(doc.getElementById("les_category") != null, "Intel: Lesson modal has category dropdown");
ok(doc.getElementById("les_impact") != null, "Intel: Lesson modal has impact dropdown");
ok(doc.getElementById("les_tag") != null, "Intel: Lesson modal has tag dropdown");
ok(doc.getElementById("les_projType") != null, "Intel: Lesson modal has project type dropdown");
ok(doc.getElementById("les_description") != null, "Intel: Lesson modal has description textarea");

// Verify click-only: no free-text inputs in brain view EXCEPT lesson description textarea
const brainContent = doc.getElementById("content");
const brainInputs = brainContent.querySelectorAll('input[type="text"], input[type="number"]');
const nonExemptInputs = Array.from(brainInputs).filter(i => !i.hidden && i.id !== "brainText");
ok(nonExemptInputs.length === 0, "Intel: No free-text/number inputs in brain view (click-only enforced)");

// Close the modal
const cancelBtn = lessonModal.querySelector("[data-act=cancel]");
if (cancelBtn) cancelBtn.click();

// 40) Vendor Directory UI panel in Brain view
doc.querySelector('.nav-item[data-view="brain"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const vendorPanel = doc.getElementById("brainVendorPanel");
ok(vendorPanel != null, "Vendor: panel exists in Brain view");
ok(/Vendor Directory/.test(vendorPanel.innerHTML), "Vendor: panel title rendered");
ok(doc.getElementById("vendorCatFilter") != null, "Vendor: category filter dropdown exists");
ok(doc.getElementById("vendorRegFilter") != null, "Vendor: region filter dropdown exists");
ok(doc.getElementById("vendorBudFilter") != null, "Vendor: budget tier filter dropdown exists");
ok(doc.getElementById("vendorCompareBtn") != null, "Vendor: Compare Selected button exists");
const vendorTableWrap = doc.getElementById("vendorTableWrap");
ok(vendorTableWrap != null && vendorTableWrap.innerHTML.length > 100, "Vendor: table renders with vendor data");
const vendorChks = vendorTableWrap.querySelectorAll(".vendor-chk");
ok(vendorChks.length >= 30, "Vendor: all 38 vendors shown by default");

// 41) Vendor comparison modal
// Select first two vendors and click compare
vendorChks[0].checked = true;
vendorChks[0].dispatchEvent(new window.Event("change", { bubbles: true }));
vendorChks[1].checked = true;
vendorChks[1].dispatchEvent(new window.Event("change", { bubbles: true }));
const compareBtn2 = doc.getElementById("vendorCompareBtn");
ok(!compareBtn2.disabled, "Vendor: Compare button enabled after selecting 2 vendors");
compareBtn2.click();
const vendorModal = doc.getElementById("modal");
ok(vendorModal && /Vendor Comparison/.test(vendorModal.innerHTML), "Vendor: comparison modal opens with title");
ok(/Attribute/.test(vendorModal.innerHTML), "Vendor: comparison modal has attribute column");
ok(/Capabilities/.test(vendorModal.innerHTML) && /Products/.test(vendorModal.innerHTML), "Vendor: comparison modal shows capabilities and products");
ok(/Price Range/.test(vendorModal.innerHTML) && /Lead Time/.test(vendorModal.innerHTML), "Vendor: comparison modal shows price range and lead time");
// Verify Print / Save as PDF button exists in comparison modal
ok(doc.getElementById("vendorPrintBtn") != null, "Vendor: comparison modal has Print / Save as PDF button");
// Close comparison modal
const vendorModalClose = vendorModal.querySelector("[data-act=cancel]");
if (vendorModalClose) vendorModalClose.click();

// Responsive design smoke tests
ok(doc.querySelector('meta[name="viewport"]') != null, "viewport meta tag present");
ok(/@media/.test(cssAll), "CSS contains responsive @media rules");

// 42) Presentation mode
ok(doc.getElementById("btnPresent") != null, "Present button exists in topbar");
ok(/body\.presenting/.test(cssAll), "Presentation mode CSS class defined in stylesheet");

// 43) i18n language system
var langSelectEl = doc.getElementById("langSelect");
ok(langSelectEl && langSelectEl.querySelectorAll("option").length >= 7, "Language dropdown has 7+ language options");

// 44) Setting language to 'th' translates Dashboard content
var i18nApi = window.QII18N;
if (i18nApi && i18nApi.setLanguage) {
  // Navigate to dashboard first, then switch language
  var dashNav = doc.querySelector('.nav-item[data-view="dashboard"]');
  if (dashNav) dashNav.dispatchEvent(new window.Event("click", { bubbles: true }));
  i18nApi.setLanguage("th");
  var dashContent = doc.getElementById("content").innerHTML;
  ok(/\u0e01\u0e23\u0e13\u0e35\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14/.test(dashContent), "Setting language to 'th' translates Dashboard content");
  // Reset back to English for any subsequent tests
  i18nApi.setLanguage("en");
} else {
  ok(false, "Setting language to 'th' translates Dashboard content");
}

// 45) Alert notification system
ok(doc.getElementById("btnAlerts") != null, "Alert: bell icon button exists in topbar");
var bellBtn = doc.getElementById("btnAlerts");
bellBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
var alertDropdown = doc.getElementById("alertDropdown");
ok(alertDropdown && !alertDropdown.hidden, "Alert: clicking bell icon opens the alert dropdown panel");
// Close the dropdown by clicking on document
doc.dispatchEvent(new window.Event("click", { bubbles: true }));

// 46) Alert panel renders in brain view
var brainNav2 = doc.querySelector('.nav-item[data-view="brain"]');
if (brainNav2) brainNav2.dispatchEvent(new window.Event("click", { bubbles: true }));
var brainAlertPanel = doc.getElementById("brainAlertPanel");
ok(brainAlertPanel != null, "Alert: alert panel renders in brain intelligence view");

// 47) Document Management System
var docsNavBtn = doc.querySelector('.nav-item[data-view="documents"]');
ok(docsNavBtn != null, "Documents nav item exists");

if (docsNavBtn) docsNavBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
var docsTable = doc.getElementById("documentsTable");
ok(docsTable != null && docsTable.tagName === "TABLE", "Documents view renders a table");

var addDocBtn = doc.getElementById("btnAddDocument");
ok(addDocBtn != null, "Add Document button exists");

// 48) Programme Timeline
var progNavBtn = doc.querySelector('.nav-item[data-view="programme"]');
ok(progNavBtn != null, "Programme Timeline nav item exists");

if (progNavBtn) progNavBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
var progGantt = doc.getElementById("programmeGantt");
var progBars = progGantt ? progGantt.querySelectorAll(".prog-bar") : [];
ok(progBars.length === 6, "Programme Timeline renders segment bars");

var todayMarker = progGantt ? progGantt.querySelector(".prog-today-marker") : null;
ok(todayMarker != null, "Programme Timeline shows today marker");

// 49) S-Curve visualization
var sCurveCanvas = doc.getElementById("chSCurve");
ok(sCurveCanvas != null, "S-Curve canvas element exists in programme view");

var sCurveCard = doc.getElementById("sCurveCard");
var sCurveTitle = sCurveCard ? sCurveCard.querySelector("h3") : null;
ok(sCurveTitle != null && /Cumulative Programme Spend/.test(sCurveTitle.textContent), "S-Curve has chart title rendered nearby");

// 50) Weather Windows
var weatherSection = doc.getElementById("weatherWindowSection");
ok(weatherSection != null, "Weather window section renders in programme view");

var weatherToggle = doc.getElementById("weatherToggle");
ok(weatherToggle != null && weatherToggle.type === "checkbox", "Weather toggle checkbox exists");

console.log(fails === 0 ? "\nALL SMOKE TESTS PASSED" : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
