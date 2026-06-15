/* QI Platform - state, persistence (localStorage), seed data, derived views. */
(function (root) {
  "use strict";
  const C = root.QICalc;
  const KEY = "qi_platform_v9";        // legacy single-project key (migrated)
  const WKEY = "qi_workspace_v9";      // workspace (multi-project) key

  function uid() { return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function seed() {
    const mk = (problem, category, priority, sev, occ, det, root, method, target, status, percent, cost, prio) => ({
      id: uid(), dateLogged: "2026-05-15", problem, category, priority,
      sev, occ, det, rootCause: root, leanMethod: method, owner: "PM",
      target, startDate: "2026-06-01", status, percent,
      costCat: cost[0], estCost: cost[1], actCost: cost[2],
      reach: prio[0], impact: prio[1], confidence: prio[2], effort: prio[3],
      userValue: prio[4], timeCrit: prio[5], riskRed: prio[6], jobSize: prio[7]
    });
    return {
      project: {
        name: "QI Intelligence Program", sponsor: "", manager: "",
        org: "Engineering", start: "2026-06-01", end: "2026-12-31",
        status: "IN PROGRESS", version: "v9.0", currency: "$",
        spec: { usl: 11, lsl: 9, target: 10 }   // process-capability spec limits
      },
      roster: ["PM", "Dev Lead", "QA Lead", "Ops Lead", "Architect", "BA",
        "Team Lead", "Process Owner", "DevOps", "Tech Lead", "Engineering Lead", "Quality Manager"]
        .map(n => ({ name: n, role: n, email: "" })),
      cases: [
        mk("Delivery targets missed 20% consistently", "Delivery / Schedule", "1-CRITICAL", 8, 7, 6,
          "Handoff delays invisible; no WIP limits", "Value Stream Mapping", "On-time delivery >95% in 8 weeks", "IN PROGRESS", 0.2, ["Labour / Effort", 15000, 12000],
          [2000, 5, 80, 8,  8, 8, 5, 8]),
        mk("Defect rate at 12% - customers complaining", "Quality / Defects", "1-CRITICAL", 8, 7, 6,
          "No quality check at source", "Mistake-Proofing / Poka-Yoke", "Zero defect escapes within 4 weeks", "OPEN", 0, ["Materials", 5000, 7500],
          [1000, 8, 90, 5,  8, 8, 8, 5]),
        mk("Team overwhelmed, parallel tasks >8 each", "Process / Flow", "2-HIGH", 7, 6, 5,
          "No WIP limits; everything is priority 1", "Kanban", "Max 3 active tasks per person", "OPEN", 0, ["Training", 3000, 2000],
          [500, 3, 80, 3,  5, 5, 3, 3]),
        mk("Approval bottleneck adds 2.3 days per case", "Process / Flow", "2-HIGH", 7, 6, 5,
          "Wrong routing; unclear decision authority", "Standard Work", "Approval time <4 hours", "OPEN", 0, ["External / Consultant", 10000, 10000],
          [500, 5, 70, 5,  5, 5, 3, 5]),
        mk("New hire onboarding takes 6 weeks", "People / Training", "3-MEDIUM", 6, 5, 5,
          "No documented process; tribal knowledge", "Standard Work", "Onboard in 2 weeks, consistent quality", "OPEN", 0, ["Tooling / Software", 2000, 1500],
          [200, 2, 70, 8,  3, 2, 2, 8]),
        mk("Leader not visible to frontline team", "Process / Flow", "2-HIGH", 7, 6, 5,
          "No structured Gemba cadence in place", "Gemba Walk", "Weekly Gemba walk every leader", "IN PROGRESS", 0.2, ["Labour / Effort", 7500, 5000],
          [200, 3, 70, 2,  3, 3, 5, 2])
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
        ],
        resources: [
          { _id: uid(), person: "Dev Lead", role: "Software", capacity: 80, allocated: 72 },
          { _id: uid(), person: "QA Lead", role: "Quality", capacity: 80, allocated: 84 },
          { _id: uid(), person: "Ops Lead", role: "Commissioning", capacity: 80, allocated: 60 }
        ],
        okr: [
          { _id: uid(), objective: "Improve on-time delivery", keyResult: "On-time delivery >95%", owner: "PM", baseline: 70, target: 95, current: 80 },
          { _id: uid(), objective: "Reduce defects", keyResult: "Defect rate <2%", owner: "QA Lead", baseline: 12, target: 2, current: 6 }
        ]
      },
      gage: defaultGage(),
      cashflow: defaultCashflow(),
      xbarR: defaultXbar()
    };
  }
  function defaultXbar() {
    const data = {
      "0_0": 10.1, "0_1": 9.8, "0_2": 10.0, "0_3": 10.2, "1_0": 9.9, "1_1": 10.3, "1_2": 10.1, "1_3": 9.7,
      "2_0": 10.4, "2_1": 10.0, "2_2": 9.9, "2_3": 10.2, "3_0": 9.6, "3_1": 9.9, "3_2": 10.1, "3_3": 10.0,
      "4_0": 10.2, "4_1": 10.5, "4_2": 10.1, "4_3": 9.8, "5_0": 9.7, "5_1": 9.9, "5_2": 10.0, "5_3": 10.1,
      "6_0": 10.3, "6_1": 10.1, "6_2": 9.8, "6_3": 10.0, "7_0": 9.9, "7_1": 10.2, "7_2": 10.4, "7_3": 10.1
    };
    return { subgroups: 8, size: 4, data };
  }
  function defaultGage() {
    // 5 parts x 3 operators x 2 trials, seeded with a realistic dataset
    const seedVals = {
      "0_0_0": 0.29, "0_0_1": 0.41, "0_1_0": 0.64, "0_1_1": 0.58, "0_2_0": 1.34, "0_2_1": 1.26, "0_3_0": 0.47, "0_3_1": 0.50, "0_4_0": 0.02, "0_4_1": 0.10,
      "1_0_0": 0.08, "1_0_1": 0.25, "1_1_0": 0.45, "1_1_1": 0.50, "1_2_0": 1.07, "1_2_1": 1.19, "1_3_0": 0.40, "1_3_1": 0.39, "1_4_0": 0.04, "1_4_1": 0.06,
      "2_0_0": 0.04, "2_0_1": 0.11, "2_1_0": 0.50, "2_1_1": 0.44, "2_2_0": 1.15, "2_2_1": 1.08, "2_3_0": 0.38, "2_3_1": 0.36, "2_4_0": 0.01, "2_4_1": 0.08
    };
    return { parts: 5, operators: 3, trials: 2, data: seedVals };
  }
  function defaultCashflow() {
    const m = ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11", "M12"];
    const planned = [10000, 25000, 45000, 70000, 110000, 150000, 190000, 220000, 240000, 250000, 250000, 250000];
    const actual = [12000, 28000, 50000, 78000, 120000, 160000, null, null, null, null, null, null];
    return m.map((mm, i) => ({ month: mm, planned: planned[i], actual: actual[i] }));
  }

  let ws = null;     // whole workspace
  let state = null;  // active project's state (alias into ws.projects[activeId])

  function normalize(s) {                       // migrate older project saves
    s.audit = s.audit || [];
    s.snapshots = s.snapshots || [];
    s.project = s.project || {};
    if (!s.project.spec) s.project.spec = { usl: 11, lsl: 9, target: 10 };
    (s.cases || []).forEach(c => {
      if (!c.whys) c.whys = ["", "", "", "", ""];
      if (typeof c.pinned !== "boolean") c.pinned = false;
      ["reach", "impact", "confidence", "effort", "userValue", "timeCrit", "riskRed", "jobSize"].forEach(k => { if (c[k] === undefined) c[k] = ""; });
    });
    s.registers = s.registers || {};
    C.REGISTERS.forEach(reg => { if (!Array.isArray(s.registers[reg.id])) s.registers[reg.id] = []; });
    if (!s.gage || !s.gage.data) s.gage = defaultGage();
    if (!Array.isArray(s.cashflow)) s.cashflow = defaultCashflow();
    if (!s.xbarR || !s.xbarR.data) s.xbarR = defaultXbar();
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
  function save() {
    try { if (typeof localStorage !== "undefined") localStorage.setItem(WKEY, JSON.stringify(ws)); }
    catch (e) {
      // Surface storage-full errors so the UI can warn the user.
      if (e && (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014)) {
        try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("qi-storage-error", { detail: e })); } catch (_) {}
      }
    }
  }
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
  let __lastDelete = null;
  function deleteCase(id) {
    const i = caseIndex(id); if (i < 0) return false;
    const code = codeOf(i), prob = (get().cases[i].problem || "").slice(0, 60);
    __lastDelete = { record: get().cases[i], index: i, code };
    get().cases.splice(i, 1);
    logAudit("Deleted", code, prob);
    save(); return true;
  }
  // Soft-undo of the last deletion. Restores the record at its original index.
  function undoDelete() {
    if (!__lastDelete) return false;
    const { record, index, code } = __lastDelete;
    const cases = get().cases;
    cases.splice(Math.min(index, cases.length), 0, record);
    logAudit("Restored", code, "Undone delete");
    __lastDelete = null;
    save(); return true;
  }
  function clearUndo() { __lastDelete = null; }
  function hasUndo() { return !!__lastDelete; }
  // Bulk operations across many cases at once.
  function bulkUpdate(ids, patch) {
    const map = {};
    ids.forEach(id => { const c = get().cases.find(x => x.id === id); if (c) Object.assign(c, patch); map[id] = !!c; });
    const k = Object.keys(patch)[0];
    if (k) logAudit("Bulk updated", "", `${ids.length} case(s) · ${k}=${patch[k]}`);
    save(); return map;
  }
  function bulkDelete(ids) {
    let n = 0;
    ids.slice().sort((a, b) => caseIndex(b) - caseIndex(a)).forEach(id => { if (deleteCase(id)) n++; });
    return n;
  }
  function moveStatus(id, status) { return updateCase(id, { status }); }
  function togglePin(id) {
    const c = get().cases.find(x => x.id === id); if (!c) return false;
    c.pinned = !c.pinned;
    if (c.pinned) { c.pinOrder = Date.now(); } else { c.pinOrder = 0; }
    logAudit(c.pinned ? "Pinned" : "Unpinned", codeOf(get().cases.indexOf(c)), "");
    save(); return c.pinned;
  }
  function reorderPin(id, beforeId) {
    const cases = get().cases;
    const src = cases.find(x => x.id === id);
    const tgt = cases.find(x => x.id === beforeId);
    if (!src || !tgt || !src.pinned || !tgt.pinned) return false;
    src.pinOrder = (tgt.pinOrder || 0) - 1;
    const pinned = cases.filter(c => c.pinned).sort((a, b) => (a.pinOrder || 0) - (b.pinOrder || 0));
    pinned.forEach((c, i) => { c.pinOrder = (i + 1) * 10; });
    logAudit("Reordered pin", codeOf(cases.indexOf(src)), "");
    save(); return true;
  }

  // ---- generic registers ----
  function regLabel(regId) { const r = C.REGISTERS.find(x => x.id === regId); return r ? r.label : regId; }
  function regRows(regId) { const s = get(); s.registers = s.registers || {}; return s.registers[regId] || (s.registers[regId] = []); }
  function regAdd(regId, row) { row = row || {}; row._id = row._id || uid(); if (typeof row._pinned !== "boolean") row._pinned = false; regRows(regId).push(row); logAudit("Added", regLabel(regId), ""); save(); return row; }
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
  function regBulkDelete(regId, ids) {
    const rows = regRows(regId);
    let n = 0;
    ids.slice().sort((a, b) => rows.findIndex(r => r._id === b) - rows.findIndex(r => r._id === a)).forEach(id => { if (regDelete(regId, id)) n++; });
    return n;
  }
  function regTogglePin(regId, rowId) {
    const r = regRows(regId).find(x => x._id === rowId); if (!r) return false;
    r._pinned = !r._pinned;
    logAudit(r._pinned ? "Pinned" : "Unpinned", regLabel(regId), "");
    save(); return r._pinned;
  }

  // ---- Gage R&R + cash flow ----
  function gage() { const s = get(); if (!s.gage) s.gage = defaultGage(); return s.gage; }
  function setGageCell(o, p, t, v) { gage().data[`${o}_${p}_${t}`] = (v === "" ? "" : Number(v)); save(); }
  function setGageConfig(patch) { Object.assign(gage(), patch); save(); }
  function gageResult() { return C.gageRR(gage()); }
  function cashflow() { const s = get(); if (!Array.isArray(s.cashflow)) s.cashflow = defaultCashflow(); return s.cashflow; }
  function setCashflow(i, field, v) { const c = cashflow(); if (c[i]) { c[i][field] = (field === "month") ? v : (v === "" ? null : Number(v)); save(); } }
  function xbar() { const s = get(); if (!s.xbarR) s.xbarR = defaultXbar(); return s.xbarR; }
  function setXbarCell(i, j, v) { xbar().data[`${i}_${j}`] = (v === "" ? "" : Number(v)); save(); }
  function setXbarConfig(patch) { Object.assign(xbar(), patch); save(); }
  function xbarResult() { return C.xbarR(xbar()); }
  function spec() { const s = get(); s.project.spec = s.project.spec || { usl: "", lsl: "", target: "" }; return s.project.spec; }
  function setSpec(patch) { Object.assign(spec(), patch); save(); }
  function capabilityResult() { return C.capability(xbar(), spec()); }
  function prioritised(method) { return C.prioritise(validCases().map(c => Object.assign({}, c)), method); }
  function ncrPareto() {
    const counts = {};
    regRows("ncr").forEach(r => { const k = r.severity || "(unset)"; counts[k] = (counts[k] || 0) + 1; });
    return C.pareto(Object.keys(counts).map(k => ({ label: k, value: counts[k] })));
  }
  function ncrParetoBy(field) {
    const counts = {};
    regRows("ncr").forEach(r => { const k = r[field] || "(unset)"; counts[k] = (counts[k] || 0) + 1; });
    return C.pareto(Object.keys(counts).map(k => ({ label: k, value: counts[k] })));
  }
  function scorecard() {
    const k = kpis(), e = C.evm(validCases(), get().project);
    const sr = sigmaRows().filter(x => x.sigma != null); const sigma = sr.length ? sr[sr.length - 1].sigma : null;
    const ncrOpen = regRows("ncr").filter(r => r.status !== "CLOSED").length;
    const hzHigh = regRows("hazop").filter(r => (Number(r.sev) || 0) * (Number(r.lik) || 0) >= 15).length;
    const msSlip = regRows("milestones").filter(r => r.status === "Slipped").length;
    return [
      { area: "Delivery", metric: "Avg % done", value: Math.round(k.avgDone * 100) + "%", rag: k.avgDone >= 0.66 ? "g" : k.avgDone >= 0.33 ? "a" : "r" },
      { area: "Schedule", metric: "SPI (schedule perf.)", value: e.spi.toFixed(2), rag: e.spi >= 1 ? "g" : e.spi >= 0.9 ? "a" : "r" },
      { area: "Cost", metric: "CPI (cost perf.)", value: e.cpi.toFixed(2), rag: e.cpi >= 1 ? "g" : e.cpi >= 0.9 ? "a" : "r" },
      { area: "Cost", metric: "% budget spent", value: Math.round(k.pctSpent * 100) + "%", rag: k.pctSpent <= 1 ? "g" : "r" },
      { area: "Quality", metric: "Sigma level", value: sigma == null ? "—" : sigma, rag: sigma == null ? "a" : sigma >= 4 ? "g" : sigma >= 3 ? "a" : "r" },
      { area: "Quality", metric: "Open NCRs", value: ncrOpen, rag: ncrOpen === 0 ? "g" : ncrOpen <= 2 ? "a" : "r" },
      { area: "Risk", metric: "Critical risks open", value: k.crit, rag: k.crit === 0 ? "g" : k.crit <= 2 ? "a" : "r" },
      { area: "Safety", metric: "HAZOP high-risk open", value: hzHigh, rag: hzHigh === 0 ? "g" : hzHigh <= 1 ? "a" : "r" },
      { area: "Schedule", metric: "Milestones slipped", value: msSlip, rag: msSlip === 0 ? "g" : "r" }
    ];
  }

  // ---- snapshots (restore points) ----
  function takeSnapshot(label) {
    const s = get();
    const copy = JSON.parse(JSON.stringify({ project: s.project, roster: s.roster, cases: s.cases, sigma: s.sigma, stakeholders: s.stakeholders, registers: s.registers, gage: s.gage, cashflow: s.cashflow, xbarR: s.xbarR }));
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
    s.project = d.project; s.roster = d.roster; s.cases = d.cases; s.sigma = d.sigma; s.stakeholders = d.stakeholders; if (d.registers) s.registers = d.registers; if (d.gage) s.gage = d.gage; if (d.cashflow) s.cashflow = d.cashflow; if (d.xbarR) s.xbarR = d.xbarR;
    normalize(s); logAudit("Restored", "", snap.label); save(); return true;
  }
  function deleteSnapshot(id) {
    const i = get().snapshots.findIndex(x => x.id === id); if (i < 0) return false;
    get().snapshots.splice(i, 1); save(); return true;
  }
  function renameSnapshot(id, label) {
    const s = get().snapshots.find(x => x.id === id); if (!s) return false;
    s.label = label || s.label;
    logAudit("Renamed snapshot", "", s.label);
    save(); return true;
  }
  // ---- saved views (per-project filter presets, choose-only names) ----
  function savedViews() { const s = get(); s.savedViews = s.savedViews || []; return s.savedViews; }
  function saveView(name, filter) {
    if (!name) return null;
    const list = savedViews();
    const existing = list.find(v => v.name === name);
    const view = { id: existing ? existing.id : uid(), name: name, filter: Object.assign({}, filter || {}), ts: new Date().toISOString() };
    if (existing) Object.assign(existing, view); else list.push(view);
    logAudit(existing ? "Updated saved view" : "Saved view", "", name);
    save(); return view;
  }
  function deleteSavedView(id) {
    const list = savedViews(), i = list.findIndex(v => v.id === id);
    if (i < 0) return false;
    const [removed] = list.splice(i, 1);
    logAudit("Deleted saved view", "", removed && removed.name || "");
    save(); return true;
  }
  // Pure data diff between two snapshots (or between a snapshot and the live project).
  function diffSnapshots(idA, idB) {
    const snaps = get().snapshots;
    const liveData = () => ({ project: get().project, cases: get().cases });
    const pickFor = (id) => id === "live" ? { ts: "live", label: "Current data", data: liveData() } : snaps.find(s => s.id === id);
    const a = pickFor(idA), b = pickFor(idB);
    if (!a || !b) return null;
    const aCases = (a.data && a.data.cases) || [], bCases = (b.data && b.data.cases) || [];
    const aIds = new Set(aCases.map(c => c.id)), bIds = new Set(bCases.map(c => c.id));
    const added = bCases.filter(c => !aIds.has(c.id));
    const removed = aCases.filter(c => !bIds.has(c.id));
    const tracked = ["status", "priority", "owner", "percent", "estCost", "actCost", "sev", "occ", "det", "leanMethod", "target", "pinned"];
    const changed = [];
    bCases.forEach(nb => {
      const old = aCases.find(c => c.id === nb.id); if (!old) return;
      const fields = tracked.filter(k => String(old[k] == null ? "" : old[k]) !== String(nb[k] == null ? "" : nb[k]));
      if (fields.length) changed.push({ id: nb.id, problem: nb.problem, fields: fields.map(f => ({ field: f, before: old[f], after: nb[f] })) });
    });
    return { a, b, added, removed, changed };
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

  // ---- Document Management sub-store ----
  // Categories specific to submarine cable projects
  var DOC_CATEGORIES = [
    "survey-reports", "otdr-traces", "permits-licenses", "as-built-charts",
    "correspondence", "payment-certificates", "method-statements", "test-certificates",
    "environmental", "hse", "contracts", "design-drawings", "meeting-minutes", "progress-reports"
  ];

  function _docRegistry() {
    var s = get();
    if (!Array.isArray(s.documentRegistry)) s.documentRegistry = [];
    return s.documentRegistry;
  }

  function addDocument(meta) {
    meta = meta || {};
    var doc = {
      id: uid(),
      title: meta.title || "",
      category: meta.category || "",
      phase: meta.phase || "",
      packageRef: meta.packageRef || "",
      description: meta.description || "",
      fileType: meta.fileType || "",
      fileSize: meta.fileSize || 0,
      uploadedBy: meta.uploadedBy || "",
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "active",
      deleted: false
    };
    _docRegistry().push(doc);
    logAudit("Added", "Document", (doc.title || "").slice(0, 60));
    save();
    return doc;
  }

  function listDocuments(filter) {
    filter = filter || {};
    var docs = _docRegistry().filter(function(d) { return !d.deleted; });
    if (filter.category) docs = docs.filter(function(d) { return d.category === filter.category; });
    if (filter.phase) docs = docs.filter(function(d) { return d.phase === filter.phase; });
    if (filter.packageRef) docs = docs.filter(function(d) { return d.packageRef === filter.packageRef; });
    if (filter.status) docs = docs.filter(function(d) { return d.status === filter.status; });
    if (filter.tags && filter.tags.length) {
      docs = docs.filter(function(d) {
        return filter.tags.some(function(t) { return d.tags.indexOf(t) >= 0; });
      });
    }
    return docs;
  }

  function updateDocument(id, patch) {
    var docs = _docRegistry();
    var idx = -1;
    for (var i = 0; i < docs.length; i++) { if (docs[i].id === id) { idx = i; break; } }
    if (idx < 0) return null;
    patch = patch || {};
    var keys = Object.keys(patch);
    for (var k = 0; k < keys.length; k++) {
      if (keys[k] !== "id" && keys[k] !== "createdAt") docs[idx][keys[k]] = patch[keys[k]];
    }
    docs[idx].updatedAt = new Date().toISOString();
    logAudit("Updated", "Document", (docs[idx].title || "").slice(0, 60));
    save();
    return docs[idx];
  }

  function deleteDocument(id) {
    var docs = _docRegistry();
    var idx = -1;
    for (var i = 0; i < docs.length; i++) { if (docs[i].id === id) { idx = i; break; } }
    if (idx < 0) return false;
    docs[idx].deleted = true;
    docs[idx].status = "archived";
    docs[idx].updatedAt = new Date().toISOString();
    logAudit("Deleted", "Document", (docs[idx].title || "").slice(0, 60));
    save();
    return true;
  }

  var DOC_CATEGORIES_LIST = DOC_CATEGORIES;

  // ---- Workflow Engine sub-store ----
  // Default workflow templates pre-seeded on first load
  var DEFAULT_WORKFLOWS = [
    {
      id: "wf_cable_landing_permit",
      name: "Cable Landing Permit Approval",
      stages: [
        { name: "Draft", approver: "Project Manager", requiredDocuments: ["Application Form", "Route Survey"], autoAdvance: false },
        { name: "Submitted to Authority", approver: "Regulatory Lead", requiredDocuments: ["Submission Receipt"], autoAdvance: false },
        { name: "Under Review", approver: "Government Authority", requiredDocuments: ["Review Comments"], autoAdvance: false },
        { name: "Approved/Rejected", approver: "Government Authority", requiredDocuments: ["Permit Certificate"], autoAdvance: false }
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
      deleted: false
    },
    {
      id: "wf_payment_certificate",
      name: "Payment Certificate",
      stages: [
        { name: "Draft", approver: "Quantity Surveyor", requiredDocuments: ["Measurement Sheet"], autoAdvance: false },
        { name: "Contractor Submitted", approver: "Contractor PM", requiredDocuments: ["Invoice", "Progress Photos"], autoAdvance: false },
        { name: "PM Certified", approver: "Project Manager", requiredDocuments: ["Certification Letter"], autoAdvance: false },
        { name: "Client Approved", approver: "Client Representative", requiredDocuments: ["Approval Letter"], autoAdvance: false },
        { name: "Paid", approver: "Finance Manager", requiredDocuments: ["Payment Receipt"], autoAdvance: true }
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
      deleted: false
    },
    {
      id: "wf_variation_order",
      name: "Variation Order",
      stages: [
        { name: "Proposed", approver: "Contractor PM", requiredDocuments: ["Variation Request"], autoAdvance: false },
        { name: "Impact Assessed", approver: "Project Manager", requiredDocuments: ["Impact Assessment", "Cost Estimate"], autoAdvance: false },
        { name: "Commercially Agreed", approver: "Commercial Manager", requiredDocuments: ["Agreement Letter"], autoAdvance: false },
        { name: "Instructed", approver: "Client Representative", requiredDocuments: ["Instruction Notice"], autoAdvance: false },
        { name: "Implemented", approver: "Project Manager", requiredDocuments: ["Completion Certificate"], autoAdvance: true }
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
      deleted: false
    }
  ];

  function _workflows() {
    var s = get();
    if (!Array.isArray(s.workflows)) {
      s.workflows = JSON.parse(JSON.stringify(DEFAULT_WORKFLOWS));
    }
    return s.workflows;
  }

  function _workflowInstances() {
    var s = get();
    if (!Array.isArray(s.workflowInstances)) s.workflowInstances = [];
    return s.workflowInstances;
  }

  function addWorkflow(opts) {
    opts = opts || {};
    var wf = {
      id: uid(),
      name: opts.name || "Untitled Workflow",
      stages: Array.isArray(opts.stages) ? opts.stages.map(function(st) {
        return {
          name: st.name || "",
          approver: st.approver || "",
          requiredDocuments: Array.isArray(st.requiredDocuments) ? st.requiredDocuments : [],
          autoAdvance: !!st.autoAdvance
        };
      }) : [],
      createdAt: new Date().toISOString(),
      deleted: false
    };
    _workflows().push(wf);
    logAudit("Added", "Workflow", (wf.name || "").slice(0, 60));
    save();
    return wf;
  }

  function listWorkflows() {
    return _workflows().filter(function(w) { return !w.deleted; });
  }

  function deleteWorkflow(id) {
    var wfs = _workflows();
    var idx = -1;
    for (var i = 0; i < wfs.length; i++) { if (wfs[i].id === id) { idx = i; break; } }
    if (idx < 0) return false;
    wfs[idx].deleted = true;
    logAudit("Deleted", "Workflow", (wfs[idx].name || "").slice(0, 60));
    save();
    return true;
  }

  function startWorkflowInstance(workflowId, entityId, entityType) {
    var wf = _workflows().find(function(w) { return w.id === workflowId && !w.deleted; });
    if (!wf || !wf.stages || wf.stages.length === 0) return null;
    var instance = {
      id: uid(),
      workflowId: workflowId,
      workflowName: wf.name,
      entityId: entityId || "",
      entityType: entityType || "",
      currentStage: 0,
      status: "in-progress",
      history: [{
        stage: 0,
        stageName: wf.stages[0].name,
        action: "started",
        timestamp: new Date().toISOString(),
        approver: ""
      }],
      startedAt: new Date().toISOString(),
      completedAt: null,
      rejectedAt: null,
      rejectedReason: null
    };
    _workflowInstances().push(instance);
    logAudit("Started", "Workflow Instance", (wf.name + " for " + (entityType || "entity")).slice(0, 60));
    save();
    return instance;
  }

  function advanceWorkflow(instanceId) {
    var instances = _workflowInstances();
    var inst = null;
    for (var i = 0; i < instances.length; i++) { if (instances[i].id === instanceId) { inst = instances[i]; break; } }
    if (!inst || inst.status !== "in-progress") return null;
    var wf = _workflows().find(function(w) { return w.id === inst.workflowId; });
    if (!wf) return null;
    var nextStage = inst.currentStage + 1;
    if (nextStage >= wf.stages.length) {
      // Completing the workflow
      inst.currentStage = wf.stages.length - 1;
      inst.status = "completed";
      inst.completedAt = new Date().toISOString();
      inst.history.push({
        stage: inst.currentStage,
        stageName: wf.stages[inst.currentStage].name,
        action: "completed",
        timestamp: new Date().toISOString(),
        approver: wf.stages[inst.currentStage].approver || ""
      });
    } else {
      inst.history.push({
        stage: nextStage,
        stageName: wf.stages[nextStage].name,
        action: "advanced",
        timestamp: new Date().toISOString(),
        approver: wf.stages[inst.currentStage].approver || ""
      });
      inst.currentStage = nextStage;
    }
    logAudit("Advanced", "Workflow Instance", (inst.workflowName || "").slice(0, 60));
    save();
    return inst;
  }

  function rejectWorkflow(instanceId, reason) {
    var instances = _workflowInstances();
    var inst = null;
    for (var i = 0; i < instances.length; i++) { if (instances[i].id === instanceId) { inst = instances[i]; break; } }
    if (!inst || inst.status !== "in-progress") return null;
    var wf = _workflows().find(function(w) { return w.id === inst.workflowId; });
    inst.status = "rejected";
    inst.rejectedAt = new Date().toISOString();
    inst.rejectedReason = reason || "";
    var stageName = (wf && wf.stages[inst.currentStage]) ? wf.stages[inst.currentStage].name : "";
    inst.history.push({
      stage: inst.currentStage,
      stageName: stageName,
      action: "rejected",
      timestamp: new Date().toISOString(),
      approver: (wf && wf.stages[inst.currentStage]) ? wf.stages[inst.currentStage].approver : "",
      reason: reason || ""
    });
    logAudit("Rejected", "Workflow Instance", (inst.workflowName || "").slice(0, 60));
    save();
    return inst;
  }

  function getWorkflowStatus(instanceId) {
    var instances = _workflowInstances();
    var inst = null;
    for (var i = 0; i < instances.length; i++) { if (instances[i].id === instanceId) { inst = instances[i]; break; } }
    if (!inst) return null;
    var wf = _workflows().find(function(w) { return w.id === inst.workflowId; });
    var totalStages = (wf && wf.stages) ? wf.stages.length : 0;
    var currentStageName = (wf && wf.stages[inst.currentStage]) ? wf.stages[inst.currentStage].name : "";
    var progress = totalStages > 0 ? Math.round((inst.currentStage / (totalStages - 1)) * 100) : 0;
    if (inst.status === "completed") progress = 100;
    return {
      id: inst.id,
      workflowId: inst.workflowId,
      workflowName: inst.workflowName,
      entityId: inst.entityId,
      entityType: inst.entityType,
      currentStage: inst.currentStage,
      currentStageName: currentStageName,
      totalStages: totalStages,
      status: inst.status,
      progress: progress,
      history: inst.history,
      startedAt: inst.startedAt,
      completedAt: inst.completedAt,
      rejectedAt: inst.rejectedAt,
      rejectedReason: inst.rejectedReason
    };
  }

  // ---------- Spare Parts Inventory ----------
  function defaultSpareInventory() {
    return [
      { id: uid(), item: "Spare Cable (G.654.E, 48F)", depot: "Singapore", quantity: 25, unit: "km", minStock: 20, lastChecked: "2026-05-01" },
      { id: uid(), item: "Spare Cable (G.654.E, 48F)", depot: "Guam", quantity: 15, unit: "km", minStock: 20, lastChecked: "2026-04-20" },
      { id: uid(), item: "Spare Cable (G.654.E, 48F)", depot: "Manila", quantity: 22, unit: "km", minStock: 20, lastChecked: "2026-05-10" },
      { id: uid(), item: "Spare Cable (G.652.D, 96F)", depot: "Singapore", quantity: 18, unit: "km", minStock: 15, lastChecked: "2026-05-01" },
      { id: uid(), item: "Spare Cable (G.652.D, 96F)", depot: "Guam", quantity: 8, unit: "km", minStock: 15, lastChecked: "2026-04-15" },
      { id: uid(), item: "Spare Cable (G.652.D, 96F)", depot: "Manila", quantity: 16, unit: "km", minStock: 15, lastChecked: "2026-05-12" },
      { id: uid(), item: "Universal Jointing Kit (UJ-500)", depot: "Singapore", quantity: 12, unit: "sets", minStock: 8, lastChecked: "2026-05-05" },
      { id: uid(), item: "Universal Jointing Kit (UJ-500)", depot: "Guam", quantity: 6, unit: "sets", minStock: 8, lastChecked: "2026-04-28" },
      { id: uid(), item: "Universal Jointing Kit (UJ-500)", depot: "Manila", quantity: 9, unit: "sets", minStock: 8, lastChecked: "2026-05-08" },
      { id: uid(), item: "OTDR (Optical Time Domain Reflectometer)", depot: "Singapore", quantity: 4, unit: "units", minStock: 3, lastChecked: "2026-05-02" },
      { id: uid(), item: "OTDR (Optical Time Domain Reflectometer)", depot: "Guam", quantity: 2, unit: "units", minStock: 3, lastChecked: "2026-04-25" },
      { id: uid(), item: "OTDR (Optical Time Domain Reflectometer)", depot: "Manila", quantity: 3, unit: "units", minStock: 3, lastChecked: "2026-05-11" },
      { id: uid(), item: "Repair Accessories (splice trays, closures)", depot: "Singapore", quantity: 30, unit: "sets", minStock: 20, lastChecked: "2026-05-03" },
      { id: uid(), item: "Repair Accessories (splice trays, closures)", depot: "Guam", quantity: 5, unit: "sets", minStock: 20, lastChecked: "2026-04-18" },
      { id: uid(), item: "Repair Accessories (splice trays, closures)", depot: "Manila", quantity: 25, unit: "sets", minStock: 20, lastChecked: "2026-05-09" },
      { id: uid(), item: "Repeater Spare Module (SDM-16)", depot: "Singapore", quantity: 3, unit: "units", minStock: 2, lastChecked: "2026-05-04" },
      { id: uid(), item: "Repeater Spare Module (SDM-16)", depot: "Guam", quantity: 1, unit: "units", minStock: 2, lastChecked: "2026-04-22" },
      { id: uid(), item: "Repeater Spare Module (SDM-16)", depot: "Manila", quantity: 2, unit: "units", minStock: 2, lastChecked: "2026-05-07" }
    ];
  }

  function listSpares() {
    var s = get();
    if (!s.spareInventory) { s.spareInventory = defaultSpareInventory(); save(); }
    return s.spareInventory;
  }

  function updateSpare(id, patch) {
    var spares = listSpares();
    var item = spares.find(function (sp) { return sp.id === id; });
    if (!item) return null;
    Object.assign(item, patch);
    save();
    return item;
  }

  // ---------- Insurance & Claims Register ----------
  function defaultInsuranceRegistry() {
    return {
      policies: [
        { id: uid(), name: "Marine All Risks", insurer: "Lloyd's Syndicate 2623", coverType: "marine all-risks", sumInsured: 1300000000, premium: 3900000, deductible: 500000, expiry: "2027-12-31", status: "Active" },
        { id: uid(), name: "Delay in Start-Up (DSU)", insurer: "Swiss Re Corporate Solutions", coverType: "delay-in-startup", sumInsured: 200000000, premium: 1200000, deductible: 2000000, expiry: "2027-06-30", status: "Active" },
        { id: uid(), name: "Third Party Liability", insurer: "Allianz Global Corporate", coverType: "third-party", sumInsured: 100000000, premium: 450000, deductible: 250000, expiry: "2027-12-31", status: "Active" }
      ],
      claims: [
        { id: uid(), ref: "CLM-2026-001", policyName: "Marine All Risks", eventDate: "2026-03-15", description: "Anchor strike damage, segment S3 (Luzon Strait)", amountClaimed: 4200000, status: "Under review", amountPaid: 0 },
        { id: uid(), ref: "CLM-2026-002", policyName: "Third Party Liability", eventDate: "2026-01-22", description: "Fishing trawler net entanglement compensation", amountClaimed: 180000, status: "Paid", amountPaid: 155000 },
        { id: uid(), ref: "CLM-2025-003", policyName: "Marine All Risks", eventDate: "2025-11-08", description: "Seabed movement cable displacement (Java Sea)", amountClaimed: 2800000, status: "Paid", amountPaid: 2300000 }
      ]
    };
  }

  function insuranceRegistry() {
    var s = get();
    if (!s.insuranceRegistry) { s.insuranceRegistry = defaultInsuranceRegistry(); save(); }
    return s.insuranceRegistry;
  }

  // ---------- Environmental Compliance ----------
  function defaultEnvironmentalCompliance() {
    return [
      { id: uid(), country: "Indonesia", eiaStatus: "approved", marineLicense: "approved", protectedAreas: "Coral Triangle overlap (3 segments)", mitigation: "Route deviation around coral reefs, seasonal dredging restrictions", monitoringRequired: "Quarterly marine surveys, coral health reports" },
      { id: uid(), country: "Thailand", eiaStatus: "approved", marineLicense: "approved", protectedAreas: "Gulf of Thailand fisheries zone", mitigation: "Night-time cable lay to avoid fishing, compensation fund", monitoringRequired: "Bi-annual seabed impact assessment" },
      { id: uid(), country: "Vietnam", eiaStatus: "in-progress", marineLicense: "in-progress", protectedAreas: "Con Dao marine park buffer zone", mitigation: "100m exclusion from park boundary, HDD shore crossing", monitoringRequired: "Monthly turbidity monitoring during installation" },
      { id: uid(), country: "Taiwan", eiaStatus: "approved", marineLicense: "approved", protectedAreas: "Penghu marine sanctuary (avoided)", mitigation: "Alternative route south of Penghu, whale migration timing", monitoringRequired: "Marine mammal observation during cable lay" },
      { id: uid(), country: "Philippines", eiaStatus: "approved", marineLicense: "in-progress", protectedAreas: "Tubbataha Reef Natural Park (avoided), Apo Reef", mitigation: "30km buffer from Tubbataha, pre-lay grapnel run, coral relocation", monitoringRequired: "Annual reef health survey, fisher livelihood monitoring" },
      { id: uid(), country: "Guam", eiaStatus: "in-progress", marineLicense: "not-started", protectedAreas: "Mariana Trench Monument buffer, coral habitat", mitigation: "Directional drilling shore approach, silt curtains", monitoringRequired: "NOAA compliance reporting, coral monitoring program" },
      { id: uid(), country: "Malaysia", eiaStatus: "approved", marineLicense: "approved", protectedAreas: "Sipadan marine park (avoided), Sabah coastal waters", mitigation: "Route south of protected areas, mangrove avoidance", monitoringRequired: "Quarterly environmental audit, mangrove health check" },
      { id: uid(), country: "Brunei", eiaStatus: "not-started", marineLicense: "not-started", protectedAreas: "Brunei Bay heritage site", mitigation: "Pending EIA - preliminary HDD assessment for shore crossing", monitoringRequired: "To be determined post-EIA" }
    ];
  }

  function environmentalCompliance() {
    var s = get();
    if (!s.environmentalCompliance) { s.environmentalCompliance = defaultEnvironmentalCompliance(); save(); }
    return s.environmentalCompliance;
  }

  // ---------- Permit Tracker ----------
  function defaultPermits() {
    return [
      { id: uid(), country: "Indonesia", authority: "DJPL", permitType: "Submarine Cable Route Approval", submittedDate: "2025-06-01", expectedDays: 120, status: "in-progress", notes: "Requires coordination with TNI-AL naval clearance" },
      { id: uid(), country: "Thailand", authority: "Marine Department", permitType: "Seabed Usage Permit", submittedDate: "2025-06-10", expectedDays: 90, status: "in-progress", notes: "Gulf of Thailand route section" },
      { id: uid(), country: "Vietnam", authority: "Vinamarine", permitType: "Maritime Safety Zone Approval", submittedDate: "2025-05-15", expectedDays: 150, status: "in-progress", notes: "Central coast landing site" },
      { id: uid(), country: "Taiwan", authority: "NCC", permitType: "Submarine Cable Landing License", submittedDate: "2025-04-20", expectedDays: 100, status: "approved", notes: "Toucheng landing station approved" },
      { id: uid(), country: "Philippines", authority: "DENR", permitType: "Environmental Compliance Certificate", submittedDate: "2025-05-01", expectedDays: 180, status: "in-progress", notes: "ECC for Luzon Strait segment" },
      { id: uid(), country: "Guam", authority: "USACE", permitType: "Section 10/404 Cable Installation Permit", submittedDate: "2025-07-01", expectedDays: 200, status: "in-progress", notes: "NEPA review in progress, coral mitigation plan required" },
      { id: uid(), country: "Malaysia", authority: "MCMC", permitType: "Network Facility Provider License", submittedDate: "2025-03-15", expectedDays: 60, status: "approved", notes: "NFP license granted for submarine cable operation" },
      { id: uid(), country: "Brunei", authority: "AITI", permitType: "Telecom Infrastructure License", submittedDate: "2025-08-01", expectedDays: 90, status: "in-progress", notes: "Pending BEDB foreign investment clearance" }
    ];
  }

  function _permits() {
    var s = get();
    if (!Array.isArray(s.permits)) { s.permits = defaultPermits(); save(); }
    return s.permits;
  }

  function addPermit(opts) {
    opts = opts || {};
    var permit = {
      id: uid(),
      country: opts.country || "",
      authority: opts.authority || "",
      permitType: opts.permitType || "",
      submittedDate: opts.submittedDate || new Date().toISOString().slice(0, 10),
      expectedDays: Number(opts.expectedDays) || 90,
      status: opts.status || "in-progress",
      notes: opts.notes || ""
    };
    _permits().push(permit);
    logAudit("Added", "Permit", (permit.permitType || "").slice(0, 60));
    save();
    return permit;
  }

  function listPermits(filter) {
    filter = filter || {};
    var permits = _permits().slice();
    if (filter.country) permits = permits.filter(function (p) { return p.country === filter.country; });
    if (filter.status) permits = permits.filter(function (p) { return p.status === filter.status; });
    return permits;
  }

  function updatePermit(id, patch) {
    var permits = _permits();
    var idx = -1;
    for (var i = 0; i < permits.length; i++) { if (permits[i].id === id) { idx = i; break; } }
    if (idx < 0) return null;
    patch = patch || {};
    var keys = Object.keys(patch);
    for (var k = 0; k < keys.length; k++) {
      if (keys[k] !== "id") permits[idx][keys[k]] = patch[keys[k]];
    }
    logAudit("Updated", "Permit", (permits[idx].permitType || "").slice(0, 60));
    save();
    return permits[idx];
  }

  // ---------- SLA & Availability Management ----------
  function listSLAs() {
    return [
      { id: "sla-1", metric: "System Availability", target: "99.99% (52.6 min downtime/year max)", actual: "99.995%", actualNum: 99.995, targetNum: 99.99, status: "green", trend: "up" },
      { id: "sla-2", metric: "Fault Restoration Time (Shallow <200m)", target: "<24 hours", actual: "Avg 18 hours", actualNum: 18, targetNum: 24, status: "green", trend: "stable" },
      { id: "sla-3", metric: "Fault Restoration Time (Deep >1000m)", target: "<72 hours", actual: "Avg 36 hours", actualNum: 36, targetNum: 72, status: "green", trend: "up" },
      { id: "sla-4", metric: "Latency (One-way Singapore-Guam)", target: "<120ms", actual: "95ms", actualNum: 95, targetNum: 120, status: "green", trend: "stable" },
      { id: "sla-5", metric: "Packet Loss", target: "<0.001%", actual: "0.0003%", actualNum: 0.0003, targetNum: 0.001, status: "green", trend: "up" },
      { id: "sla-6", metric: "Planned Maintenance Windows", target: "Max 4 per year per segment", actual: "2 per year avg", actualNum: 2, targetNum: 4, status: "green", trend: "stable" },
      { id: "sla-7", metric: "Spare Cable Availability", target: ">2% of system length at each depot", actual: "2.4% avg across depots", actualNum: 2.4, targetNum: 2, status: "green", trend: "stable" },
      { id: "sla-8", metric: "Mean Time Between Failures (MTBF)", target: ">5 years per segment", actual: "6.2 years", actualNum: 6.2, targetNum: 5, status: "green", trend: "up" },
      { id: "sla-9", metric: "Network Utilization Alert Threshold", target: "Alert at >80% capacity", actual: "Currently at 62%", actualNum: 62, targetNum: 80, status: "amber", trend: "up" },
      { id: "sla-10", metric: "Incident Response Time", target: "<30 minutes acknowledgment", actual: "22 minutes avg", actualNum: 22, targetNum: 30, status: "green", trend: "stable" }
    ];
  }

  // ---------- Training & Competency Register ----------
  function listTrainingRecords() {
    return [
      { id: "tr-1", name: "Ahmad Razak", role: "Cable Jointing Engineer", certification: "IEC 60794 Submarine Cable Jointing", issued: "2024-03-15", expiry: "2026-03-15", status: "Valid" },
      { id: "tr-2", name: "Nguyen Van Minh", role: "ROV Pilot", certification: "IMCA ROV Pilot/Technician Class II", issued: "2023-11-01", expiry: "2025-11-01", status: "Expired" },
      { id: "tr-3", name: "Maria Santos", role: "Marine Operations Manager", certification: "STCW Master Mariner (Unlimited)", issued: "2024-06-20", expiry: "2029-06-20", status: "Valid" },
      { id: "tr-4", name: "Chen Wei Lin", role: "Fiber Test Engineer", certification: "OTDR & Fiber Characterization (FOA CFOT)", issued: "2025-01-10", expiry: "2027-01-10", status: "Valid" },
      { id: "tr-5", name: "Takeshi Yamamoto", role: "System Design Engineer", certification: "SubOptic Submarine System Design", issued: "2024-09-05", expiry: "2026-09-05", status: "Expiring" },
      { id: "tr-6", name: "Budi Santoso", role: "Shore End Installation Lead", certification: "Horizontal Directional Drilling (HDD) Level 3", issued: "2023-08-12", expiry: "2025-08-12", status: "Expired" },
      { id: "tr-7", name: "Priya Chandra", role: "Quality Inspector", certification: "ISO 9001:2015 Lead Auditor (IRCA)", issued: "2025-02-28", expiry: "2028-02-28", status: "Valid" },
      { id: "tr-8", name: "David Thompson", role: "Health & Safety Officer", certification: "NEBOSH International General Certificate", issued: "2024-12-01", expiry: "2026-12-01", status: "Expiring" },
      { id: "tr-9", name: "Somchai Prasert", role: "Cable Ship Captain", certification: "DP2 Dynamic Positioning Operator", issued: "2024-04-18", expiry: "2026-04-18", status: "Expiring" },
      { id: "tr-10", name: "Rizal Fernandez", role: "Network Operations Engineer", certification: "DWDM Systems (Ciena/Infinera Certified)", issued: "2025-05-01", expiry: "2027-05-01", status: "Valid" }
    ];
  }

  // ---------- Incident Management ----------
  function listIncidents() {
    return [
      { id: "inc-1", date: "2026-02-14", segment: "SEA-2", description: "Anchor strike - bulk carrier MV Pacific Fortune dragged anchor in anchorage zone", rfo: "External Aggression", impactMinutes: 342, status: "Resolved", resolution: "Emergency splice repair, reroute via protection path, full restoration in 5.7 hours" },
      { id: "inc-2", date: "2026-04-03", segment: "SEA-4", description: "Power feed equipment alarm - PFE voltage fluctuation at CLS Bangkok", rfo: "Equipment Failure", impactMinutes: 78, status: "Resolved", resolution: "Redundant PFE switchover, faulty module replaced during maintenance window" },
      { id: "inc-3", date: "2025-11-22", segment: "SEA-1", description: "Fishing trawler bottom-trawl net entanglement near Batam approach", rfo: "External Aggression", impactMinutes: 520, status: "Resolved", resolution: "Cable ship mobilized from Singapore depot, disentanglement and inspection complete" },
      { id: "inc-4", date: "2025-08-09", segment: "SEA-6", description: "Seabed movement detected via DTS monitoring - lateral displacement 2.3m", rfo: "Natural Event", impactMinutes: 0, status: "Monitoring", resolution: "No service impact, scheduled survey for next maintenance window, route re-profiling planned" },
      { id: "inc-5", date: "2026-01-18", segment: "SEA-3", description: "Amplifier degradation - EDFA output power drop 1.8dB at repeater RP-31", rfo: "Component Aging", impactMinutes: 0, status: "Scheduled Repair", resolution: "Compensated via gain equalization, repeater replacement planned Q3 2026" }
    ];
  }

  // ---------- Capacity Dashboard ----------
  function listCapacity() {
    return [
      { segment: "SEA-1", fiberPairs: 8, wavelengthsPerPair: 120, soldPercent: 45 },
      { segment: "SEA-2", fiberPairs: 6, wavelengthsPerPair: 120, soldPercent: 30 },
      { segment: "SEA-3", fiberPairs: 4, wavelengthsPerPair: 120, soldPercent: 15 },
      { segment: "SEA-4", fiberPairs: 6, wavelengthsPerPair: 120, soldPercent: 55 },
      { segment: "SEA-5", fiberPairs: 8, wavelengthsPerPair: 120, soldPercent: 72 },
      { segment: "SEA-6", fiberPairs: 4, wavelengthsPerPair: 120, soldPercent: 25 }
    ];
  }

  const API = { uid, seed, load, save, get, workspace, reset, replace, addCase, updateCase, deleteCase, moveStatus,
    undoDelete, clearUndo, hasUndo, bulkUpdate, bulkDelete, togglePin, reorderPin,
    enriched, validCases, kpis, groupCounts, rpnByCategory, topRisks, sigmaRows, budgetByCategory, health,
    auditList, clearAudit, takeSnapshot, snapshots, restoreSnapshot, deleteSnapshot, renameSnapshot, diffSnapshots, paretoRPN, controlChartData,
    savedViews, saveView, deleteSavedView,
    listProjects, activeProjectId, switchProject, addProject, renameProject, duplicateProject, deleteProject, importAsProject,
    brand, setBrand, aiSettings, setAi, portfolio,
    regRows, regAdd, regUpdate, regDelete, regLabel, regBulkDelete, regTogglePin, evm: () => C.evm(validCases(), get().project),
    gage, setGageCell, setGageConfig, gageResult, cashflow, setCashflow,
    xbar, setXbarCell, setXbarConfig, xbarResult, scorecard,
    spec, setSpec, capabilityResult, prioritised, ncrPareto, ncrParetoBy,
    addDocument, listDocuments, updateDocument, deleteDocument, DOC_CATEGORIES: DOC_CATEGORIES_LIST,
    addWorkflow, listWorkflows, deleteWorkflow, startWorkflowInstance, advanceWorkflow, rejectWorkflow, getWorkflowStatus,
    listSpares, updateSpare, insuranceRegistry, environmentalCompliance,
    addPermit, listPermits, updatePermit,
    listSLAs, listTrainingRecords, listIncidents, listCapacity };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.QIStore = API;
})(typeof window !== "undefined" ? window : globalThis);
