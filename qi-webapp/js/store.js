/* QI Platform - state, persistence (localStorage), seed data, derived views. */
(function (root) {
  "use strict";
  const C = root.QICalc;
  const KEY = "qi_platform_v9";        // legacy single-project key (migrated)
  const WKEY = "qi_workspace_v9";      // workspace (multi-project) key

  function uid() { return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function seed() {
    const mk = (problem, category, priority, sev, occ, det, root, method, target, status, percent, cost) => ({
      id: uid(), dateLogged: "2026-05-15", problem, category, priority,
      sev, occ, det, rootCause: root, leanMethod: method, owner: "PM",
      target, startDate: "2026-06-01", status, percent,
      costCat: cost[0], estCost: cost[1], actCost: cost[2]
    });
    return {
      project: {
        name: "QI Intelligence Program", sponsor: "", manager: "",
        org: "Engineering", start: "2026-06-01", end: "2026-12-31",
        status: "IN PROGRESS", version: "v9.0", currency: "$"
      },
      roster: ["PM", "Dev Lead", "QA Lead", "Ops Lead", "Architect", "BA",
        "Team Lead", "Process Owner", "DevOps", "Tech Lead", "Engineering Lead", "Quality Manager"]
        .map(n => ({ name: n, role: n, email: "" })),
      cases: [
        mk("Delivery targets missed 20% consistently", "Delivery / Schedule", "1-CRITICAL", 8, 7, 6,
          "Handoff delays invisible; no WIP limits", "Value Stream Mapping", "On-time delivery >95% in 8 weeks", "IN PROGRESS", 0.2, ["Labour / Effort", 15000, 12000]),
        mk("Defect rate at 12% - customers complaining", "Quality / Defects", "1-CRITICAL", 8, 7, 6,
          "No quality check at source", "Mistake-Proofing / Poka-Yoke", "Zero defect escapes within 4 weeks", "OPEN", 0, ["Materials", 5000, 7500]),
        mk("Team overwhelmed, parallel tasks >8 each", "Process / Flow", "2-HIGH", 7, 6, 5,
          "No WIP limits; everything is priority 1", "Kanban", "Max 3 active tasks per person", "OPEN", 0, ["Training", 3000, 2000]),
        mk("Approval bottleneck adds 2.3 days per case", "Process / Flow", "2-HIGH", 7, 6, 5,
          "Wrong routing; unclear decision authority", "Standard Work", "Approval time <4 hours", "OPEN", 0, ["External / Consultant", 10000, 10000]),
        mk("New hire onboarding takes 6 weeks", "People / Training", "3-MEDIUM", 6, 5, 5,
          "No documented process; tribal knowledge", "Standard Work", "Onboard in 2 weeks, consistent quality", "OPEN", 0, ["Tooling / Software", 2000, 1500]),
        mk("Leader not visible to frontline team", "Process / Flow", "2-HIGH", 7, 6, 5,
          "No structured Gemba cadence in place", "Gemba Walk", "Weekly Gemba walk every leader", "IN PROGRESS", 0.2, ["Labour / Effort", 7500, 5000])
      ],
      sigma: [
        { week: "Week 1", units: 600, defects: 72, opps: 5 },
        { week: "Week 2", units: 580, defects: 65, opps: 5 },
        { week: "Week 3", units: 610, defects: 58, opps: 5 },
        { week: "Week 4", units: 595, defects: 50, opps: 5 },
        { week: "Week 5", units: 620, defects: 45, opps: 5 },
        { week: "Week 6", units: 605, defects: 38, opps: 5 },
        { week: "Week 7", units: 615, defects: null, opps: 5 },
        { week: "Week 8", units: null, defects: null, opps: 5 }
      ],
      stakeholders: [
        { name: "PM", role: "Project Manager", influence: "High", interest: "High", raci: "A - Accountable" },
        { name: "Sponsor", role: "Sponsor", influence: "High", interest: "Medium", raci: "I - Informed" },
        { name: "QA Lead", role: "QA Lead", influence: "Medium", interest: "High", raci: "R - Responsible" }
      ],
      registers: {
        hazop: [
          { _id: uid(), node: "Feed line to reactor", deviation: "High pressure", cause: "Control valve fails open", consequence: "Overpressure / relief lift", sev: 5, lik: 2, safeguard: "PSV + high-pressure trip", action: "Verify trip setpoint at commissioning", owner: "Commissioning Engineer", status: "OPEN", case: "" },
          { _id: uid(), node: "Cooling water", deviation: "No flow", cause: "Pump trip", consequence: "Loss of cooling / high temp", sev: 4, lik: 3, safeguard: "Standby pump auto-start", action: "Test auto-start logic", owner: "Ops Lead", status: "IN PROGRESS", case: "" }
        ],
        calibration: [
          { _id: uid(), tag: "PT-1001", instrument: "Pressure transmitter", range: "0-25 barg", discipline: "Instrumentation / Control", lastCal: "2026-01-15", interval: 12, technician: "Tech Lead", result: "Pass" },
          { _id: uid(), tag: "TT-2003", instrument: "Temperature transmitter", range: "0-400 C", discipline: "Instrumentation / Control", lastCal: "2025-12-01", interval: 6, technician: "Tech Lead", result: "Adjusted" }
        ],
        punch: [
          { _id: uid(), item: "Missing pipe support on line 200", system: "Unit 200", discipline: "Piping", category: "B - Before handover", raisedBy: "QA Lead", responsible: "Ops Lead", due: "2026-07-15", status: "OPEN" }
        ],
        sil: [
          { _id: uid(), sif: "SIF-01", function: "Reactor high-pressure trip", required: "SIL 2", achieved: "SIL 2", proofTest: 12, verified: "Partial", owner: "Engineering Lead", status: "IN PROGRESS" }
        ],
        rtm: [
          { _id: uid(), req: "System shall trip on high pressure within 1s", source: "FDS-3.2", discipline: "Instrumentation / Control", design: "Logic diagram L-12", test: "FAT-07", verify: "In progress", case: "" }
        ],
        docs: [
          { _id: uid(), docNo: "P&ID-200-01", title: "P&ID Unit 200", discipline: "Process", rev: "B", status: "Issued for review", due: "2026-07-01", owner: "Architect" }
        ],
        ncr: [],
        moc: [
          { _id: uid(), change: "Upsize relief valve PSV-1001", reason: "Revised relief load", impact: "Schedule + cost", risk: "Medium", approver: "Engineering Lead", status: "Under review", date: "2026-06-05" }
        ],
        milestones: [
          { _id: uid(), milestone: "Design freeze", baseline: "2026-07-05", forecast: "2026-07-12", actual: "", status: "At risk", owner: "PM" },
          { _id: uid(), milestone: "Mechanical completion", baseline: "2026-09-30", forecast: "2026-09-30", actual: "", status: "On track", owner: "Ops Lead" }
        ],
        decisions: [
          { _id: uid(), decision: "Adopt Kanban for delivery team", context: "WIP too high; chose Kanban over Scrum", owner: "PM", date: "2026-05-20", status: "Approved" }
        ],
        procurement: [
          { _id: uid(), package: "Control system (DCS)", vendor: "TBD", value: 250000, poStatus: "RFQ", delivery: "2026-08-15", owner: "PM" }
        ]
      }
    };
  }

  let ws = null;     // whole workspace
  let state = null;  // active project's state (alias into ws.projects[activeId])

  function normalize(s) {                       // migrate older project saves
    s.audit = s.audit || [];
    s.snapshots = s.snapshots || [];
    (s.cases || []).forEach(c => { if (!c.whys) c.whys = ["", "", "", "", ""]; });
    s.registers = s.registers || {};
    C.REGISTERS.forEach(reg => { if (!Array.isArray(s.registers[reg.id])) s.registers[reg.id] = []; });
    return s;
  }
  function defaultWorkspace() {
    const id = uid();
    return {
      activeId: id, order: [id], projects: { [id]: seed() },
      brand: { company: "", logo: "", accent: "#2e5496" },
      ai: { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", key: "" }
    };
  }
  function normalizeWs(w) {
    w.projects = w.projects || {};
    w.order = (w.order && w.order.length) ? w.order.filter(id => w.projects[id]) : Object.keys(w.projects);
    if (!w.order.length) { Object.assign(w, defaultWorkspace()); }
    if (!w.activeId || !w.projects[w.activeId]) w.activeId = w.order[0];
    w.brand = w.brand || { company: "", logo: "", accent: "#2e5496" };
    w.ai = w.ai || { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", key: "" };
    w.order.forEach(id => normalize(w.projects[id]));
    return w;
  }
  function bind() { state = ws.projects[ws.activeId]; return state; }

  function load() {
    try {
      const rawW = (typeof localStorage !== "undefined") && localStorage.getItem(WKEY);
      if (rawW) ws = JSON.parse(rawW);
      else {
        const old = (typeof localStorage !== "undefined") && localStorage.getItem(KEY);
        ws = defaultWorkspace();
        if (old) ws.projects[ws.order[0]] = JSON.parse(old);  // migrate legacy single project
      }
    } catch (e) { ws = defaultWorkspace(); }
    normalizeWs(ws); bind(); save(); return state;
  }
  function save() { try { if (typeof localStorage !== "undefined") localStorage.setItem(WKEY, JSON.stringify(ws)); } catch (e) {} }
  function get() { if (!state) load(); return state; }
  function workspace() { if (!ws) load(); return ws; }
  function reset() { ws.projects[ws.activeId] = normalize(seed()); bind(); save(); return state; }
  function replace(obj) { ws.projects[ws.activeId] = normalize(obj); bind(); save(); return state; }
  function withProject(s, fn) { const prev = state; state = s; try { return fn(); } finally { state = prev; } }

  // ---- projects ----
  function listProjects() { return workspace().order.map(id => ({ id, name: ws.projects[id].project.name || "Untitled", status: ws.projects[id].project.status, active: id === ws.activeId })); }
  function activeProjectId() { return workspace().activeId; }
  function switchProject(id) { if (workspace().projects[id]) { ws.activeId = id; bind(); save(); } return state; }
  function addProject(name) {
    const id = uid(), s = seed();
    s.project.name = name || "New Project"; s.cases = []; s.audit = []; s.snapshots = []; s.stakeholders = [];
    workspace().projects[id] = normalize(s); ws.order.push(id); ws.activeId = id; bind(); save(); return id;
  }
  function renameProject(id, name) { if (workspace().projects[id]) { ws.projects[id].project.name = name; save(); } }
  function duplicateProject(id) {
    const src = workspace().projects[id]; if (!src) return null;
    const nid = uid(), copy = JSON.parse(JSON.stringify(src));
    copy.project.name = (src.project.name || "Project") + " (copy)";
    ws.projects[nid] = copy; ws.order.push(nid); ws.activeId = nid; bind(); save(); return nid;
  }
  function deleteProject(id) {
    if (workspace().order.length <= 1) return false;
    delete ws.projects[id]; ws.order = ws.order.filter(x => x !== id);
    if (ws.activeId === id) ws.activeId = ws.order[0];
    bind(); save(); return true;
  }
  function importAsProject(obj) { const id = uid(); workspace().projects[id] = normalize(obj); ws.order.push(id); ws.activeId = id; bind(); save(); return id; }

  // ---- brand + AI settings (workspace-level) ----
  function brand() { return workspace().brand; }
  function setBrand(patch) { Object.assign(workspace().brand, patch); save(); }
  function aiSettings() { return workspace().ai; }
  function setAi(patch) { Object.assign(workspace().ai, patch); save(); }

  // ---- portfolio rollup across all projects ----
  function portfolio() {
    return workspace().order.map(id => {
      const s = ws.projects[id];
      return { id, name: s.project.name || "Untitled", status: s.project.status, active: id === ws.activeId, kpis: withProject(s, kpis) };
    });
  }

  // ---- audit log ----
  function codeOf(i) { return "CASE-" + String(i + 1).padStart(3, "0"); }
  function logAudit(action, code, detail) {
    get().audit.unshift({ ts: new Date().toISOString(), action, code: code || "", detail: detail || "" });
    if (get().audit.length > 500) get().audit.length = 500;
  }
  function auditList() { return get().audit; }
  function clearAudit() { get().audit = []; save(); }

  // ---- case CRUD (audited) ----
  function caseIndex(id) { return get().cases.findIndex(c => c.id === id); }
  function addCase(c) {
    c.id = c.id || uid(); if (!c.whys) c.whys = ["", "", "", "", ""];
    get().cases.push(c);
    logAudit("Added", codeOf(get().cases.length - 1), (c.problem || "").slice(0, 60));
    save(); return c;
  }
  function updateCase(id, patch) {
    const i = caseIndex(id); if (i < 0) return null;
    const old = get().cases[i];
    const changes = Object.keys(patch).filter(k => k !== "whys" && String(old[k]) !== String(patch[k]))
      .map(k => `${k}: ${old[k] === "" || old[k] == null ? "—" : old[k]}→${patch[k] === "" || patch[k] == null ? "—" : patch[k]}`);
    Object.assign(get().cases[i], patch);
    if (changes.length) logAudit("Updated", codeOf(i), changes.slice(0, 4).join("; ").slice(0, 120));
    save(); return get().cases[i];
  }
  function deleteCase(id) {
    const i = caseIndex(id); if (i < 0) return false;
    const code = codeOf(i), prob = (get().cases[i].problem || "").slice(0, 60);
    get().cases.splice(i, 1);
    logAudit("Deleted", code, prob);
    save(); return true;
  }
  function moveStatus(id, status) { return updateCase(id, { status }); }

  // ---- generic registers ----
  function regLabel(regId) { const r = C.REGISTERS.find(x => x.id === regId); return r ? r.label : regId; }
  function regRows(regId) { const s = get(); s.registers = s.registers || {}; return s.registers[regId] || (s.registers[regId] = []); }
  function regAdd(regId, row) { row = row || {}; row._id = row._id || uid(); regRows(regId).push(row); logAudit("Added", regLabel(regId), ""); save(); return row; }
  function regUpdate(regId, rowId, patch) {
    const rows = regRows(regId), i = rows.findIndex(r => r._id === rowId); if (i < 0) return null;
    const changed = Object.keys(patch).filter(k => String(rows[i][k]) !== String(patch[k]));
    Object.assign(rows[i], patch);
    if (changed.length) logAudit("Updated", regLabel(regId), changed.slice(0, 3).map(k => `${k}→${patch[k]}`).join("; ").slice(0, 100));
    save(); return rows[i];
  }
  function regDelete(regId, rowId) {
    const rows = regRows(regId), i = rows.findIndex(r => r._id === rowId); if (i < 0) return false;
    rows.splice(i, 1); logAudit("Deleted", regLabel(regId), ""); save(); return true;
  }

  // ---- snapshots (restore points) ----
  function takeSnapshot(label) {
    const s = get();
    const copy = JSON.parse(JSON.stringify({ project: s.project, roster: s.roster, cases: s.cases, sigma: s.sigma, stakeholders: s.stakeholders, registers: s.registers }));
    s.snapshots.unshift({ id: uid(), ts: new Date().toISOString(), label: label || ("Snapshot " + new Date().toLocaleString()), data: copy });
    if (s.snapshots.length > 25) s.snapshots.length = 25;
    logAudit("Snapshot", "", label || "manual"); save();
    return s.snapshots[0];
  }
  function snapshots() { return get().snapshots; }
  function restoreSnapshot(id) {
    const snap = get().snapshots.find(x => x.id === id); if (!snap) return false;
    takeSnapshot("Auto-backup before restore");
    const s = get(), d = JSON.parse(JSON.stringify(snap.data));
    s.project = d.project; s.roster = d.roster; s.cases = d.cases; s.sigma = d.sigma; s.stakeholders = d.stakeholders; if (d.registers) s.registers = d.registers;
    normalize(s); logAudit("Restored", "", snap.label); save(); return true;
  }
  function deleteSnapshot(id) {
    const i = get().snapshots.findIndex(x => x.id === id); if (i < 0) return false;
    get().snapshots.splice(i, 1); save(); return true;
  }

  // ---- derived ----
  function enriched() { return get().cases.map((c, i) => Object.assign(C.enrich(c), { num: i + 1, code: "CASE-" + String(i + 1).padStart(3, "0") })); }
  function validCases() { return enriched().filter(c => c.problem); }

  function kpis() {
    const e = validCases();
    const open = e.filter(c => ["OPEN", "IN PROGRESS", "ON HOLD", "BLOCKED"].includes(c.status)).length;
    const crit = e.filter(c => c.rpn !== null && c.rpn >= 200).length;
    const rpns = e.filter(c => c.rpn).map(c => c.rpn);
    const avgRpn = rpns.length ? Math.round(rpns.reduce((a, b) => a + b, 0) / rpns.length) : 0;
    const pcts = e.map(c => Number(c.percent) || 0);
    const avgDone = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;
    const blocked = e.filter(c => c.status === "BLOCKED").length;
    const estTotal = get().cases.reduce((a, c) => a + (Number(c.estCost) || 0), 0);
    const actTotal = get().cases.reduce((a, c) => a + (Number(c.actCost) || 0), 0);
    return { total: e.length, open, crit, avgRpn, avgDone, blocked, estTotal, actTotal,
      pctSpent: estTotal ? actTotal / estTotal : 0 };
  }

  function groupCounts(field) {
    const e = validCases(); const map = {};
    e.forEach(c => { const k = c[field] || "(none)"; map[k] = (map[k] || 0) + 1; });
    return map;
  }
  function rpnByCategory() {
    const e = validCases(); const map = {};
    C.LISTS.category.forEach(cat => map[cat] = 0);
    e.forEach(c => { if (c.rpn) map[c.category] = (map[c.category] || 0) + c.rpn; });
    return map;
  }
  function topRisks(n) {
    return validCases().filter(c => c.rpn !== null).sort((a, b) => b.rpn - a.rpn).slice(0, n);
  }
  function sigmaRows() {
    return get().sigma.map(r => {
      const rate = (r.units && r.defects !== null && r.opps) ? r.defects / (r.units * r.opps) : null;
      const dpmo = rate === null ? null : rate * 1e6;
      return Object.assign({}, r, { rate, dpmo, sigma: C.sigmaFromDpmo(dpmo), target: 4.5 });
    });
  }
  function budgetByCategory() {
    const est = {}, act = {};
    C.LISTS.costCat.forEach(c => { est[c] = 0; act[c] = 0; });
    get().cases.forEach(c => {
      if (!c.problem) return;
      if (c.costCat) { est[c.costCat] = (est[c.costCat] || 0) + (Number(c.estCost) || 0); act[c.costCat] = (act[c.costCat] || 0) + (Number(c.actCost) || 0); }
    });
    return { est, act };
  }
  function paretoRPN() {
    const m = rpnByCategory();
    return C.pareto(Object.keys(m).map(k => ({ label: k, value: m[k] })));
  }
  function controlChartData() {
    const rows = sigmaRows();
    const labels = rows.map(r => r.week);
    const values = rows.map(r => r.rate == null ? null : +(r.rate * 100).toFixed(3));
    const st = C.controlStats(values);
    return { labels, values, mean: st.mean, ucl: st.ucl, lcl: st.lcl };
  }

  // ---- data health checks ----
  function health() {
    const issues = [];
    const e = enriched();
    e.forEach(c => {
      if (!c.problem) return;
      if (!c.owner) issues.push({ code: c.code, msg: "No owner assigned" });
      if (c.sev === "" || c.occ === "" || c.det === "" || c.sev == null || c.occ == null || c.det == null)
        issues.push({ code: c.code, msg: "Risk not fully scored (Sev/Occ/Det)" });
      if (!c.leanMethod) issues.push({ code: c.code, msg: "No Lean method selected" });
      if (!c.startDate) issues.push({ code: c.code, msg: "No start date" });
      if (c.estEnd && new Date(c.estEnd) < new Date() && !["RESOLVED", "CLOSED"].includes(c.status))
        issues.push({ code: c.code, msg: "Past due and not resolved" });
    });
    return issues;
  }

  const API = { uid, seed, load, save, get, workspace, reset, replace, addCase, updateCase, deleteCase, moveStatus,
    enriched, validCases, kpis, groupCounts, rpnByCategory, topRisks, sigmaRows, budgetByCategory, health,
    auditList, clearAudit, takeSnapshot, snapshots, restoreSnapshot, deleteSnapshot, paretoRPN, controlChartData,
    listProjects, activeProjectId, switchProject, addProject, renameProject, duplicateProject, deleteProject, importAsProject,
    brand, setBrand, aiSettings, setAi, portfolio,
    regRows, regAdd, regUpdate, regDelete, regLabel, evm: () => C.evm(validCases(), get().project) };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.QIStore = API;
})(typeof window !== "undefined" ? window : globalThis);
