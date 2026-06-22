/* QI Platform - state, persistence (localStorage), seed data, derived views. */
(function (root) {
  "use strict";
  const C = root.QICalc;
  const KEY = "qi_platform_v9";        // legacy single-project key (migrated)
  const WKEY = "qi_workspace_v9";      // workspace (multi-project) key
  const SCHEMA_VERSION = 10;           // workspace schema version (forward-only,
                                       // additive migrations in normalize/normalizeWs
                                       // so a NEW app build never breaks OLD saves)

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
    if (!s.routeProgress || typeof s.routeProgress !== "object") s.routeProgress = {};
    s.brainPlan = s.brainPlan || null;
    if (typeof s.brainDescription !== 'string') s.brainDescription = '';
    if (!Array.isArray(s.updates)) s.updates = [];
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
    // Stamp the schema version AFTER additive normalisation so old saves are
    // brought fully up to date, then marked current. A future build can read
    // w.schemaVersion to decide which forward migrations to run.
    w.schemaVersion = SCHEMA_VERSION;
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
    normalizeWs(ws); bind(); save();

    // If sync is enabled, fire an async server load in the background
    if (root.QISync && root.QISync.syncEnabled()) {
      root.QISync.loadFromServer().then(function (serverWs) {
        if (!serverWs) return;
        // Merge: server is authoritative for projects/cases; preserve local-only data
        serverWs.order.forEach(function (id) {
          var sp = serverWs.projects[id];
          var localProj = ws.projects[id];
          if (localProj) {
            // Server is authoritative for project metadata
            localProj.project.name = sp.project.name;
            localProj.project.status = sp.project.status;
            // Merge cases at the case level: keep local-only cases (created offline, not yet synced)
            var serverCaseIds = {};
            sp.cases.forEach(function (sc) { serverCaseIds[sc.id] = true; });
            // Identify local cases that do not exist on the server (offline additions)
            var localOnlyCases = (localProj.cases || []).filter(function (lc) {
              return !serverCaseIds[lc.id];
            });
            // Server cases are authoritative; append local-only cases
            localProj.cases = sp.cases.concat(localOnlyCases);
          } else {
            ws.projects[id] = sp;
            if (ws.order.indexOf(id) < 0) ws.order.push(id);
          }
        });
        normalizeWs(ws); bind(); save();
        // Notify the UI that data refreshed from server
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("qi-data-refreshed"));
          }
        } catch (e) { /* ignore */ }
      }).catch(function () { /* network failure - continue with localStorage */ });
    }

    return state;
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
    workspace().projects[id] = normalize(s); ws.order.push(id); ws.activeId = id; bind(); save();
    if (root.QISync && root.QISync.syncEnabled()) { root.QISync.syncCreateProject(name || "New Project", id); }
    return id;
  }
  function renameProject(id, name) {
    if (workspace().projects[id]) {
      ws.projects[id].project.name = name; save();
      if (root.QISync && root.QISync.syncEnabled()) { root.QISync.syncRenameProject(root.QISync.mapLocalToServer(id) || id, name); }
    }
  }
  function duplicateProject(id) {
    const src = workspace().projects[id]; if (!src) return null;
    const nid = uid(), copy = JSON.parse(JSON.stringify(src));
    copy.project.name = (src.project.name || "Project") + " (copy)";
    ws.projects[nid] = copy; ws.order.push(nid); ws.activeId = nid; bind(); save(); return nid;
  }
  function deleteProject(id) {
    if (workspace().order.length <= 1) return false;
    var serverId = (root.QISync && root.QISync.mapLocalToServer) ? root.QISync.mapLocalToServer(id) || id : null;
    delete ws.projects[id]; ws.order = ws.order.filter(x => x !== id);
    if (ws.activeId === id) ws.activeId = ws.order[0];
    bind(); save();
    if (root.QISync && root.QISync.syncEnabled() && serverId) { root.QISync.syncDeleteProject(serverId); }
    return true;
  }
  function importAsProject(obj) { const id = uid(); workspace().projects[id] = normalize(obj); ws.order.push(id); ws.activeId = id; bind(); save(); return id; }

  // ---- full-workspace backup (ALL projects) — assurance for saved files ----
  // Produces a single portable file containing EVERY saved project plus brand
  // settings. The API key is deliberately stripped so a backup never leaks a
  // secret. schemaVersion lets a future app build migrate the file safely.
  function exportWorkspace() {
    const clone = JSON.parse(JSON.stringify(workspace()));
    if (clone.ai) clone.ai.key = "";   // never write secrets into a backup file
    return {
      app: "QI Platform", kind: "qi-workspace-backup", schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(), projectCount: (clone.order || []).length,
      workspace: clone
    };
  }
  // Restore a full backup WITHOUT destroying current data: every project in the
  // backup is added ALONGSIDE the existing ones with fresh ids (no collisions,
  // nothing overwritten). Returns the number of projects restored.
  function importWorkspaceProjects(backup) {
    const w = (backup && backup.workspace) ? backup.workspace : backup;
    if (!w || !w.projects) return 0;
    const order = (w.order && w.order.length) ? w.order.filter(id => w.projects[id]) : Object.keys(w.projects);
    let n = 0, lastId = null;
    order.forEach(function (id) {
      try {
        const proj = w.projects[id];
        if (!proj || !proj.project) return;
        const nid = uid();
        workspace().projects[nid] = normalize(JSON.parse(JSON.stringify(proj)));
        ws.order.push(nid); lastId = nid; n++;
      } catch (e) { /* skip a corrupt project, keep the rest */ }
    });
    if (lastId) { ws.activeId = lastId; bind(); }
    save();
    return n;
  }
  function schemaVersion() { return SCHEMA_VERSION; }

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
    save();
    if (root.QISync && root.QISync.syncEnabled()) {
      var projServerId = root.QISync.mapLocalToServer(ws.activeId) || ws.activeId;
      root.QISync.syncCreateCase(projServerId, c, c.id);
    }
    // Real-time broadcast
    if (root.QISync && root.QISync.wsSendChange) {
      root.QISync.wsSendChange("case", "add", { id: c.id, problem: (c.problem || "").slice(0, 80) });
    }
    return c;
  }
  function updateCase(id, patch) {
    const i = caseIndex(id); if (i < 0) return null;
    const old = get().cases[i];
    const changes = Object.keys(patch).filter(k => k !== "whys" && String(old[k]) !== String(patch[k]))
      .map(k => `${k}: ${old[k] === "" || old[k] == null ? "\u2014" : old[k]}\u2192${patch[k] === "" || patch[k] == null ? "\u2014" : patch[k]}`);
    Object.assign(get().cases[i], patch);
    if (changes.length) logAudit("Updated", codeOf(i), changes.slice(0, 4).join("; ").slice(0, 120));
    save();
    if (root.QISync && root.QISync.syncEnabled()) {
      var projServerId = root.QISync.mapLocalToServer(ws.activeId) || ws.activeId;
      var caseServerId = root.QISync.mapLocalToServer(id) || id;
      root.QISync.syncUpdateCase(projServerId, caseServerId, patch);
    }
    // Real-time broadcast
    if (root.QISync && root.QISync.wsSendChange && changes.length) {
      root.QISync.wsSendChange("case", "update", { id: id, fields: changes.slice(0, 3) });
    }
    return get().cases[i];
  }
  let __lastDelete = null;
  let __bulkDeleteInProgress = false;
  function deleteCase(id) {
    const i = caseIndex(id); if (i < 0) return false;
    const code = codeOf(i), prob = (get().cases[i].problem || "").slice(0, 60);
    __lastDelete = { record: get().cases[i], index: i, code };
    get().cases.splice(i, 1);
    logAudit("Deleted", code, prob);
    save();
    if (!__bulkDeleteInProgress && root.QISync && root.QISync.syncEnabled()) {
      var projServerId = root.QISync.mapLocalToServer(ws.activeId) || ws.activeId;
      var caseServerId = root.QISync.mapLocalToServer(id) || id;
      root.QISync.syncDeleteCase(projServerId, caseServerId);
    }
    // Real-time broadcast
    if (!__bulkDeleteInProgress && root.QISync && root.QISync.wsSendChange) {
      root.QISync.wsSendChange("case", "delete", { id: id, problem: prob });
    }
    return true;
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
    save();
    if (root.QISync && root.QISync.syncEnabled()) {
      var projServerId = root.QISync.mapLocalToServer(ws.activeId) || ws.activeId;
      var serverIds = ids.map(function (id) { return root.QISync.mapLocalToServer(id) || id; });
      root.QISync.syncBulkUpdate(projServerId, serverIds, patch);
    }
    return map;
  }
  function bulkDelete(ids) {
    if (root.QISync && root.QISync.syncEnabled()) {
      var projServerId = root.QISync.mapLocalToServer(ws.activeId) || ws.activeId;
      var serverIds = ids.map(function (id) { return root.QISync.mapLocalToServer(id) || id; });
      root.QISync.syncBulkDelete(projServerId, serverIds);
    }
    __bulkDeleteInProgress = true;
    let n = 0;
    ids.slice().sort((a, b) => caseIndex(b) - caseIndex(a)).forEach(id => { if (deleteCase(id)) n++; });
    __bulkDeleteInProgress = false;
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

  // ---- Project updates / news / references (the living project log) ----
  // A simple, persisted, per-project feed the team uses to post news, results
  // and reference links. Each add/delete is broadcast over the real-time
  // channel so every signed-in user is informed of the change.
  function updatesList() { const s = get(); if (!Array.isArray(s.updates)) s.updates = []; return s.updates; }
  function addUpdate(type, text, author) {
    text = String(text == null ? "" : text).trim();
    if (!text) return null;
    var entry = {
      id: uid(),
      type: String(type || "note").slice(0, 24),
      text: text.slice(0, 2000),
      author: String(author || "").slice(0, 80),
      ts: new Date().toISOString()
    };
    updatesList().unshift(entry);
    if (get().updates.length > 200) get().updates.length = 200;
    logAudit("Added", "Project update", entry.type);
    save();
    if (root.QISync && root.QISync.wsSendChange) {
      root.QISync.wsSendChange("Project update", "add", { id: entry.id, type: entry.type, text: entry.text.slice(0, 80) });
    }
    return entry;
  }
  function deleteUpdate(id) {
    var arr = updatesList();
    var i = arr.findIndex(function (u) { return u.id === id; });
    if (i < 0) return false;
    arr.splice(i, 1);
    logAudit("Deleted", "Project update", "");
    save();
    if (root.QISync && root.QISync.wsSendChange) {
      root.QISync.wsSendChange("Project update", "delete", { id: id });
    }
    return true;
  }  function regRows(regId) { const s = get(); s.registers = s.registers || {}; return s.registers[regId] || (s.registers[regId] = []); }
  function regAdd(regId, row) { row = row || {}; row._id = row._id || uid(); if (typeof row._pinned !== "boolean") row._pinned = false; regRows(regId).push(row); logAudit("Added", regLabel(regId), ""); save();
    if (root.QISync && root.QISync.syncEnabled()) {
      var projServerId = root.QISync.mapLocalToServer(ws.activeId) || ws.activeId;
      root.QISync.syncRegAdd(projServerId, regId, row, row._id);
    }
    if (root.QISync && root.QISync.wsSendChange) {
      root.QISync.wsSendChange(regLabel(regId), "add", { id: row._id, regId: regId });
    }
    return row; }
  function regUpdate(regId, rowId, patch) {
    const rows = regRows(regId), i = rows.findIndex(r => r._id === rowId); if (i < 0) return null;
    const changed = Object.keys(patch).filter(k => String(rows[i][k]) !== String(patch[k]));
    Object.assign(rows[i], patch);
    if (changed.length) logAudit("Updated", regLabel(regId), changed.slice(0, 3).map(k => `${k}→${patch[k]}`).join("; ").slice(0, 100));
    save();
    if (root.QISync && root.QISync.syncEnabled()) {
      var projServerId = root.QISync.mapLocalToServer(ws.activeId) || ws.activeId;
      var rowServerId = root.QISync.mapLocalToServer(rowId) || rowId;
      root.QISync.syncRegUpdate(projServerId, regId, rowServerId, patch);
    }
    if (root.QISync && root.QISync.wsSendChange && changed.length) {
      root.QISync.wsSendChange(regLabel(regId), "update", { id: rowId, regId: regId, fields: changed.slice(0, 3) });
    }
    return rows[i];
  }
  function regDelete(regId, rowId) {
    const rows = regRows(regId), i = rows.findIndex(r => r._id === rowId); if (i < 0) return false;
    rows.splice(i, 1); logAudit("Deleted", regLabel(regId), ""); save();
    if (root.QISync && root.QISync.syncEnabled()) {
      var projServerId = root.QISync.mapLocalToServer(ws.activeId) || ws.activeId;
      var rowServerId = root.QISync.mapLocalToServer(rowId) || rowId;
      root.QISync.syncRegDelete(projServerId, regId, rowServerId);
    }
    if (root.QISync && root.QISync.wsSendChange) {
      root.QISync.wsSendChange(regLabel(regId), "delete", { id: rowId, regId: regId });
    }
    return true;
  }
  function regBulkDelete(regId, ids) {
    if (root.QISync && root.QISync.syncEnabled()) {
      var projServerId = root.QISync.mapLocalToServer(ws.activeId) || ws.activeId;
      var serverIds = ids.map(function (id) { return root.QISync.mapLocalToServer(id) || id; });
      root.QISync.syncRegBulkDelete(projServerId, regId, serverIds);
    }
    const rows = regRows(regId);
    let n = 0;
    ids.slice().sort((a, b) => rows.findIndex(r => r._id === b) - rows.findIndex(r => r._id === a)).forEach(id => {
      const i = rows.findIndex(r => r._id === id);
      if (i >= 0) { rows.splice(i, 1); n++; }
    });
    if (n) { logAudit("Bulk deleted", regLabel(regId), n + " row(s)"); save(); }
    return n;
  }
  function regTogglePin(regId, rowId) {
    const r = regRows(regId).find(x => x._id === rowId); if (!r) return false;
    r._pinned = !r._pinned;
    logAudit(r._pinned ? "Pinned" : "Unpinned", regLabel(regId), "");
    save();
    if (root.QISync && root.QISync.syncEnabled()) {
      var projServerId = root.QISync.mapLocalToServer(ws.activeId) || ws.activeId;
      var rowServerId = root.QISync.mapLocalToServer(rowId) || rowId;
      root.QISync.syncRegTogglePin(projServerId, regId, rowServerId);
    }
    return r._pinned;
  }

  // ---- Gage R&R + cash flow ----
  function gage() { const s = get(); if (!s.gage) s.gage = defaultGage(); return s.gage; }
  function setGageCell(o, p, t, v) {
    gage().data[`${o}_${p}_${t}`] = (v === "" ? "" : Number(v)); save();
    if (root.QISync && root.QISync.syncEnabled()) { root.QISync.syncProjectData(root.QISync.mapLocalToServer(ws.activeId) || ws.activeId, 'gage', gage()); }
  }
  function setGageConfig(patch) {
    Object.assign(gage(), patch); save();
    if (root.QISync && root.QISync.syncEnabled()) { root.QISync.syncProjectData(root.QISync.mapLocalToServer(ws.activeId) || ws.activeId, 'gage', gage()); }
  }
  function gageResult() { return C.gageRR(gage()); }
  function cashflow() { const s = get(); if (!Array.isArray(s.cashflow)) s.cashflow = defaultCashflow(); return s.cashflow; }
  function setCashflow(i, field, v) {
    const c = cashflow(); if (c[i]) { c[i][field] = (field === "month") ? v : (v === "" ? null : Number(v)); save(); }
    if (root.QISync && root.QISync.syncEnabled()) { root.QISync.syncProjectData(root.QISync.mapLocalToServer(ws.activeId) || ws.activeId, 'cashflow', cashflow()); }
  }
  function xbar() { const s = get(); if (!s.xbarR) s.xbarR = defaultXbar(); return s.xbarR; }
  function setXbarCell(i, j, v) {
    xbar().data[`${i}_${j}`] = (v === "" ? "" : Number(v)); save();
    if (root.QISync && root.QISync.syncEnabled()) { root.QISync.syncProjectData(root.QISync.mapLocalToServer(ws.activeId) || ws.activeId, 'xbarR', xbar()); }
  }
  function setXbarConfig(patch) {
    Object.assign(xbar(), patch); save();
    if (root.QISync && root.QISync.syncEnabled()) { root.QISync.syncProjectData(root.QISync.mapLocalToServer(ws.activeId) || ws.activeId, 'xbarR', xbar()); }
  }
  function xbarResult() { return C.xbarR(xbar()); }
  function spec() { const s = get(); s.project.spec = s.project.spec || { usl: "", lsl: "", target: "" }; return s.project.spec; }
  function setSpec(patch) {
    Object.assign(spec(), patch); save();
    if (root.QISync && root.QISync.syncEnabled()) { root.QISync.syncProjectData(root.QISync.mapLocalToServer(ws.activeId) || ws.activeId, 'spec', spec()); }
  }
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
    var snapId = uid();
    s.snapshots.unshift({ id: snapId, ts: new Date().toISOString(), label: label || ("Snapshot " + new Date().toLocaleString()), data: copy });
    if (s.snapshots.length > 25) s.snapshots.length = 25;
    logAudit("Snapshot", "", label || "manual"); save();
    if (root.QISync && root.QISync.syncEnabled()) {
      root.QISync.syncTakeSnapshot(root.QISync.mapLocalToServer(ws.activeId) || ws.activeId, label || ("Snapshot " + new Date().toLocaleString()), snapId);
    }
    return s.snapshots[0];
  }
  function snapshots() { return get().snapshots; }
  function restoreSnapshot(id) {
    const snap = get().snapshots.find(x => x.id === id); if (!snap) return false;
    takeSnapshot("Auto-backup before restore");
    const s = get(), d = JSON.parse(JSON.stringify(snap.data));
    s.project = d.project; s.roster = d.roster; s.cases = d.cases; s.sigma = d.sigma; s.stakeholders = d.stakeholders; if (d.registers) s.registers = d.registers; if (d.gage) s.gage = d.gage; if (d.cashflow) s.cashflow = d.cashflow; if (d.xbarR) s.xbarR = d.xbarR;
    normalize(s); logAudit("Restored", "", snap.label); save();
    if (root.QISync && root.QISync.syncEnabled()) {
      var projServerId = root.QISync.mapLocalToServer(ws.activeId) || ws.activeId;
      var snapshotServerId = root.QISync.mapLocalToServer(id);
      // Only sync restore if the snapshot has a known server-side ID
      if (snapshotServerId) {
        root.QISync.syncRestoreSnapshot(projServerId, snapshotServerId);
      }
    }
    return true;
  }
  function deleteSnapshot(id) {
    const i = get().snapshots.findIndex(x => x.id === id); if (i < 0) return false;
    get().snapshots.splice(i, 1); save();
    if (root.QISync && root.QISync.syncEnabled()) {
      var projServerId = root.QISync.mapLocalToServer(ws.activeId) || ws.activeId;
      var snapshotServerId = root.QISync.mapLocalToServer(id);
      if (snapshotServerId) {
        root.QISync.syncDeleteSnapshot(projServerId, snapshotServerId);
      }
    }
    return true;
  }
  function renameSnapshot(id, label) {
    const s = get().snapshots.find(x => x.id === id); if (!s) return false;
    s.label = label || s.label;
    logAudit("Renamed snapshot", "", s.label);
    save();
    if (root.QISync && root.QISync.syncEnabled()) {
      var projServerId = root.QISync.mapLocalToServer(ws.activeId) || ws.activeId;
      var snapshotServerId = root.QISync.mapLocalToServer(id);
      if (snapshotServerId) {
        root.QISync.syncRenameSnapshot(projServerId, snapshotServerId, s.label);
      }
    }
    return true;
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
    // "Critical" = items the user sees labelled 1-CRITICAL in the priority column.
    // (Unified with the Risk Register nav badge so every "critical" count agrees.)
    const crit = e.filter(c => c.priority === "1-CRITICAL").length;
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

  // Single plain-language project health score (0-100) for decision-makers who
  // just want to know "is my project OK?". Derived from live KPIs; conservative
  // (penalises blocked work, critical risks, and spending ahead of progress).
  function healthScore() {
    const k = kpis();
    let score = 100;
    const reasons = [];
    if (k.total === 0) {
      return { score: null, verdict: "No data yet", color: "#6b7686",
        reasons: ["Upload a project description in the Project Brain to begin."] };
    }
    if (k.blocked > 0) { const p = Math.min(30, k.blocked * 8); score -= p; reasons.push(k.blocked + " blocked item" + (k.blocked === 1 ? "" : "s")); }
    if (k.crit > 0) { const p = Math.min(30, k.crit * 5); score -= p; reasons.push(k.crit + " critical risk" + (k.crit === 1 ? "" : "s")); }
    if (k.pctSpent > k.avgDone + 0.15) { score -= 15; reasons.push("spending is ahead of progress"); }
    if (k.open > 0 && k.total > 0 && (k.open / k.total) > 0.8 && k.avgDone < 0.1) { score -= 5; reasons.push("work has not started on most items"); }
    if (score < 0) score = 0; if (score > 100) score = 100;
    score = Math.round(score);
    let verdict, color;
    if (score >= 80) { verdict = "On track"; color = "#27ae60"; }
    else if (score >= 60) { verdict = "Needs attention"; color = "#e0a800"; }
    else { verdict = "At risk"; color = "#e74c3c"; }
    if (!reasons.length) reasons.push("No blockers or critical risks — looking good.");
    return { score, verdict, color, reasons };
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

  // ---- Route Progress (submarine-cable construction / GIS delivery tracking) ----
  // Each cable segment from QIGlobe.CABLES tracks the real submarine-cable
  // lifecycle through 7 phases plus an overall "% laid" (km completed). Data is
  // persisted per project under s.routeProgress, keyed by cable id.
  const ROUTE_PHASES = [
    { key: "survey",   label: "Marine Route Survey",          abbr: "Survey" },
    { key: "permit",   label: "Permitting & Landing Licence", abbr: "Permit" },
    { key: "shore",    label: "Shore-end / HDD & Civil",      abbr: "Shore" },
    { key: "lay",      label: "Cable Lay (main lay)",         abbr: "Lay" },
    { key: "joint",    label: "Jointing / Splicing",          abbr: "Joint" },
    { key: "otdr",     label: "OTDR & Commissioning Test",    abbr: "OTDR" },
    { key: "handover", label: "Handover / Commissioned",      abbr: "Handover" }
  ];
  const ROUTE_STATUS = ["Not started", "In progress", "Complete"];

  // The cable inventory comes from the (separately-loaded) globe module. Stay
  // resilient when it is absent (e.g. the jsdom smoke run without globe data).
  function routeCables() {
    try {
      if (root.QIGlobe && Array.isArray(root.QIGlobe.CABLES)) return root.QIGlobe.CABLES;
    } catch (e) { /* ignore */ }
    return [];
  }
  // Derive a sensible initial per-segment state from the cable's existing status.
  function seedRouteEntry(cable) {
    const phases = {};
    ROUTE_PHASES.forEach(p => { phases[p.key] = "Not started"; });
    let laidKm = 0;
    const len = Number(cable.lengthKm) || 0;
    if (cable.status === "commissioned") {
      ROUTE_PHASES.forEach(p => { phases[p.key] = "Complete"; });
      laidKm = len;                                   // 100% laid
    } else if (cable.status === "in-progress") {
      phases.survey = "Complete"; phases.permit = "Complete"; phases.shore = "Complete";
      phases.lay = "In progress";                     // mid main-lay
      laidKm = Math.round(len * 0.6);                 // ~60% laid
    }
    return { phases, laidKm };
  }
  // Getter — seeds any missing segments from QIGlobe.CABLES and back-fills phases.
  function routeProgress() {
    const s = get();
    if (!s.routeProgress || typeof s.routeProgress !== "object") s.routeProgress = {};
    const rp = s.routeProgress;
    let changed = false;
    routeCables().forEach(cable => {
      if (!rp[cable.id]) { rp[cable.id] = seedRouteEntry(cable); changed = true; return; }
      const e = rp[cable.id];
      e.phases = e.phases || {};
      ROUTE_PHASES.forEach(p => { if (ROUTE_STATUS.indexOf(e.phases[p.key]) < 0) { e.phases[p.key] = "Not started"; changed = true; } });
      if (typeof e.laidKm !== "number") { e.laidKm = Number(e.laidKm) || 0; changed = true; }
    });
    if (changed) save();
    return rp;
  }
  function routeEntry(cableId) {
    const rp = routeProgress();
    if (!rp[cableId]) { rp[cableId] = { phases: {}, laidKm: 0 }; ROUTE_PHASES.forEach(p => { rp[cableId].phases[p.key] = "Not started"; }); }
    return rp[cableId];
  }
  function setRoutePhase(cableId, phaseKey, status) {
    if (ROUTE_STATUS.indexOf(status) < 0) return null;
    if (!ROUTE_PHASES.some(p => p.key === phaseKey)) return null;
    const e = routeEntry(cableId);
    e.phases[phaseKey] = status;
    logAudit("Route phase", cableId, phaseKey + " \u2192 " + status);
    save();
    if (root.QISync && root.QISync.syncEnabled()) { root.QISync.syncProjectData(root.QISync.mapLocalToServer(ws.activeId) || ws.activeId, 'routeProgress', routeProgress()); }
    return e;
  }
  function setRouteLaidKm(cableId, km) {
    const e = routeEntry(cableId);
    e.laidKm = Math.max(0, Number(km) || 0);
    logAudit("Route % laid", cableId, e.laidKm + " km");
    save();
    if (root.QISync && root.QISync.syncEnabled()) { root.QISync.syncProjectData(root.QISync.mapLocalToServer(ws.activeId) || ws.activeId, 'routeProgress', routeProgress()); }
    return e;
  }
  // Phase-weighted completion fraction (In progress counts as half).
  function routePhaseFraction(entry) {
    if (!entry || !entry.phases) return 0;
    let done = 0;
    ROUTE_PHASES.forEach(p => { const st = entry.phases[p.key]; if (st === "Complete") done += 1; else if (st === "In progress") done += 0.5; });
    return done / ROUTE_PHASES.length;
  }
  // Blended overall progress (0..100): half phase-weighted, half physical km laid.
  function routeOverall(cable, entry) {
    const phaseFrac = routePhaseFraction(entry);
    const len = Number(cable && cable.lengthKm) || 0;
    const laidFrac = len ? Math.min(1, (Number(entry && entry.laidKm) || 0) / len) : 0;
    return Math.round(((phaseFrac * 0.5) + (laidFrac * 0.5)) * 100);
  }
  // Programme-level rollup across every cable segment.
  function routeRollup() {
    const rp = routeProgress();
    const cables = routeCables();
    let totalKm = 0, laidKm = 0, commissioned = 0, inProgress = 0, planned = 0, overallSum = 0;
    cables.forEach(c => {
      const len = Number(c.lengthKm) || 0;
      const e = rp[c.id] || { phases: {}, laidKm: 0 };
      totalKm += len;
      laidKm += Math.min(Number(e.laidKm) || 0, len);
      if (c.status === "commissioned") commissioned++;
      else if (c.status === "in-progress") inProgress++;
      else planned++;
      overallSum += routeOverall(c, e);
    });
    return {
      segments: cables.length, totalKm, laidKm,
      pctComplete: totalKm ? laidKm / totalKm : 0,
      avgOverall: cables.length ? Math.round(overallSum / cables.length) : 0,
      commissioned, inProgress, planned
    };
  }

  // ---- Brain Plan persistence (per-project) ----
  function setBrainPlan(plan) { get().brainPlan = plan || null; save(); }
  function getBrainPlan() { return get().brainPlan || null; }

  // ---- Brain Description persistence (per-project) ----
  function setBrainDescription(text) { get().brainDescription = String(text || ''); save(); }
  function getBrainDescription() { return get().brainDescription || ''; }

  // ---- What-If Scenario Simulator ----
  // Pure in-memory computation — never persists. The user toggles countries or
  // cables on/off, slides permit delays or cost multipliers, and gets an instant
  // recalculated snapshot (budget, timeline, capacity, risk assessment) compared
  // to the baseline. Designed for non-PM decision-makers asking "what happens if…?"
  function whatIf(scenario) {
    scenario = scenario || {};
    const G = root.QIGlobe || {};
    const cables = (Array.isArray(G.CABLES) ? G.CABLES : []);
    const stations = (Array.isArray(G.STATIONS) ? G.STATIONS : []);
    const prog = G.PROGRAMME || { budgetUsd: 1300e6, durationMonths: 60 };

    // scenario.excludeCountries: string[] of station ids to skip
    // scenario.excludeCables: string[] of cable ids to skip
    // scenario.costMultiplier: 1.0 = baseline, 1.2 = +20%
    // scenario.permitDelayMonths: extra months added
    const exC = (scenario.excludeCountries || []).map(s => String(s).toLowerCase());
    const exCab = (scenario.excludeCables || []).map(s => String(s).toLowerCase());
    const costMul = Math.max(0.5, Math.min(3, Number(scenario.costMultiplier) || 1));
    const permitDelay = Math.max(0, Math.min(36, Number(scenario.permitDelayMonths) || 0));

    // Determine which cables remain (a cable is excluded if either endpoint is
    // excluded OR it's explicitly excluded).
    const activeCables = cables.filter(function (c) {
      if (exCab.indexOf(c.id.toLowerCase()) !== -1) return false;
      if (exC.indexOf(c.from) !== -1 || exC.indexOf(c.to) !== -1) return false;
      return true;
    });

    // Determine which stations remain (any station that still has at least one connected cable).
    const liveStations = {};
    activeCables.forEach(function (c) { liveStations[c.from] = true; liveStations[c.to] = true; });
    const activeStations = stations.filter(function (s) { return !!liveStations[s.id]; });

    // Budget & capacity
    var baseW = 0, activeW = 0;
    cables.forEach(function (c) { baseW += (c.lengthKm || 0) * (c.fibrePairs || 0); });
    activeCables.forEach(function (c) { activeW += (c.lengthKm || 0) * (c.fibrePairs || 0); });
    baseW = baseW || 1;
    var baseBudget = prog.budgetUsd;
    var scenarioBudget = Math.round(baseBudget * (activeW / baseW) * costMul);
    var savedUsd = baseBudget - scenarioBudget;
    var totalKm = activeCables.reduce(function (a, c) { return a + (c.lengthKm || 0); }, 0);
    var totalCap = activeCables.reduce(function (a, c) { return a + (c.capacityTbps || 0); }, 0);
    var baseCap = cables.reduce(function (a, c) { return a + (c.capacityTbps || 0); }, 0);
    var baseKm = cables.reduce(function (a, c) { return a + (c.lengthKm || 0); }, 0);

    // Timeline — uses critical-path logic: only TRUNK segments (sequential)
    // determine the timeline. Branch segments run in parallel and removing them
    // does NOT reduce the total duration.
    var baseMonths = prog.durationMonths;
    var totalTrunkCount = cables.filter(function (c) { return /^STP-T/i.test(c.id); }).length || 1;
    var activeTrunkCount = activeCables.filter(function (c) { return /^STP-T/i.test(c.id); }).length;
    var scenarioMonths = activeTrunkCount > 0
      ? Math.round(baseMonths * (activeTrunkCount / totalTrunkCount)) + permitDelay
      : permitDelay;

    // Risk assessment (plain language)
    var risks = [];
    var removedCountries = stations.filter(function (s) { return !liveStations[s.id]; }).map(function (s) { return s.name + " (" + s.country + ")"; });
    if (removedCountries.length > 0) {
      risks.push("You lose connectivity to " + removedCountries.join(", ") + ".");
    }
    // Check for single points of failure (any station with only 1 cable left)
    // — only flag this if the scenario actually removed something (otherwise these
    // are inherent to the base topology, not a scenario-introduced risk).
    if (exC.length > 0 || exCab.length > 0) {
      var stationLinks = {};
      activeCables.forEach(function (c) { stationLinks[c.from] = (stationLinks[c.from] || 0) + 1; stationLinks[c.to] = (stationLinks[c.to] || 0) + 1; });
      var singles = activeStations.filter(function (s) { return (stationLinks[s.id] || 0) === 1; });
      if (singles.length > 0) {
        risks.push(singles.map(function (s) { return s.name; }).join(", ") + (singles.length === 1 ? " becomes" : " become") + " a single point of failure (only one cable \u2014 no redundancy).");
      }
    }
    if (costMul > 1.15) {
      risks.push("At +" + Math.round((costMul - 1) * 100) + "% cost increase, the budget may exceed lender comfort zones — consider phasing.");
    }
    if (permitDelay > 6) {
      risks.push("A " + permitDelay + "-month permit delay pushes the timeline significantly — consider starting that approval immediately.");
    }
    if (activeCables.length < cables.length * 0.5) {
      risks.push("You're cutting more than half the network — reconsider whether the remaining capacity justifies the programme overhead.");
    }

    // Plain-language verdict
    var parts = [];
    if (removedCountries.length > 0) parts.push("skip " + removedCountries.length + " countr" + (removedCountries.length === 1 ? "y" : "ies"));
    if (costMul !== 1) parts.push((costMul > 1 ? "+" : "") + Math.round((costMul - 1) * 100) + "% on costs");
    if (permitDelay > 0) parts.push("+" + permitDelay + " months permit delay");
    var scenarioLabel = parts.length ? "If you " + parts.join(" and ") + ":" : "Baseline (no changes):";
    var verdict = scenarioLabel + " about " + fmtUsdShort(scenarioBudget) + " total (" + (savedUsd >= 0 ? "save " : "add ") + fmtUsdShort(Math.abs(savedUsd)) + "), " + scenarioMonths + " months, " + activeStations.length + " of " + stations.length + " countries, " + Math.round(totalCap) + " Tbps capacity.";

    return {
      verdict: verdict,
      label: scenarioLabel,
      budget: { base: baseBudget, scenario: scenarioBudget, saved: savedUsd, multiplier: costMul },
      timeline: { base: baseMonths, scenario: scenarioMonths, permitDelay: permitDelay },
      network: { cables: activeCables.length, baseCables: cables.length, stations: activeStations.length, baseStations: stations.length, totalKm: totalKm, baseKm: baseKm, totalCap: totalCap, baseCap: baseCap },
      risks: risks,
      excludedCountries: removedCountries,
      excludedCableIds: exCab,
      activeCableIds: activeCables.map(function (c) { return c.id; }),
      activeStationIds: activeStations.map(function (s) { return s.id; })
    };
  }
  function fmtUsdShort(n) {
    n = Math.abs(Number(n) || 0);
    if (n >= 1e9) return "USD " + (Math.round(n / 1e8) / 10) + "B";
    if (n >= 1e6) return "USD " + Math.round(n / 1e6) + "M";
    if (n >= 1e3) return "USD " + Math.round(n / 1e3) + "K";
    return "USD " + n;
  }

  const API = { uid, seed, load, save, get, workspace, reset, replace, addCase, updateCase, deleteCase, moveStatus,
    undoDelete, clearUndo, hasUndo, bulkUpdate, bulkDelete, togglePin, reorderPin,
    enriched, validCases, kpis, groupCounts, rpnByCategory, topRisks, sigmaRows, budgetByCategory, health,
    auditList, clearAudit, takeSnapshot, snapshots, restoreSnapshot, deleteSnapshot, renameSnapshot, diffSnapshots, paretoRPN, controlChartData,
    savedViews, saveView, deleteSavedView,
    listProjects, activeProjectId, switchProject, addProject, renameProject, duplicateProject, deleteProject, importAsProject,
    exportWorkspace, importWorkspaceProjects, schemaVersion,
    brand, setBrand, aiSettings, setAi, portfolio,
    regRows, regAdd, regUpdate, regDelete, regLabel, regBulkDelete, regTogglePin, evm: () => C.evm(validCases(), get().project),
    updatesList, addUpdate, deleteUpdate,
    healthScore,
    gage, setGageCell, setGageConfig, gageResult, cashflow, setCashflow,
    xbar, setXbarCell, setXbarConfig, xbarResult, scorecard,
    spec, setSpec, capabilityResult, prioritised, ncrPareto, ncrParetoBy,
    ROUTE_PHASES, ROUTE_STATUS, routeProgress, setRoutePhase, setRouteLaidKm, routeOverall, routePhaseFraction, routeRollup,
    setBrainPlan, getBrainPlan,
    setBrainDescription, getBrainDescription,
    whatIf, weeklySummary, healthHistory };

  // --- Feature #7: Weekly project summary snapshot ---
  // Stores a KPI snapshot each week and generates a plain-language comparison
  // between now and the previous saved snapshot. Designed for zero-PM users.
  var WSNAP_KEY = "qi_weekly_snap";
  function _wsnapKey() {
    return WSNAP_KEY + "_" + (ws && ws.activeId ? ws.activeId : "default");
  }
  function _loadWeeklySnap() {
    try {
      var key = _wsnapKey();
      var raw = localStorage.getItem(key);
      // Backward-compat: migrate old shared key to project-specific key
      if (!raw) {
        var legacy = localStorage.getItem(WSNAP_KEY);
        if (legacy) {
          localStorage.setItem(key, legacy);
          localStorage.removeItem(WSNAP_KEY);
          raw = legacy;
        }
      }
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      // Backward-compat: migrate old single-object format to 1-element array
      if (parsed && !Array.isArray(parsed) && parsed.ts) return [parsed];
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch (e) { return []; }
  }
  function _saveWeeklySnap(snap) {
    try {
      var arr = _loadWeeklySnap();
      arr.push(snap);
      if (arr.length > 5) arr = arr.slice(arr.length - 5);
      localStorage.setItem(_wsnapKey(), JSON.stringify(arr));
    } catch (e) {}
  }
  function healthHistory() {
    var arr = _loadWeeklySnap();
    return arr.map(function(entry) { return entry.healthScore || 0; });
  }
  function weeklySummary() {
    var now = kpis();
    var hs = healthScore();
    var arr = _loadWeeklySnap();
    var prev = arr.length > 0 ? arr[arr.length - 1] : null;
    var today = new Date();
    var dayMs = 86400000;
    // Decide if we should save a new snapshot (once every 7 days max)
    var shouldSave = !prev || !prev.ts || (today.getTime() - prev.ts > 6 * dayMs);
    var summary = { generated: today.toISOString(), current: now, health: hs, prev: prev, delta: null, text: "" };
    if (prev && prev.kpis) {
      var d = {};
      d.total = (now.total || 0) - (prev.kpis.total || 0);
      d.open = (now.open || 0) - (prev.kpis.open || 0);
      d.crit = (now.crit || 0) - (prev.kpis.crit || 0);
      d.blocked = (now.blocked || 0) - (prev.kpis.blocked || 0);
      d.avgDone = Math.round(((now.avgDone || 0) - (prev.kpis.avgDone || 0)) * 100);
      d.healthDelta = (hs.score || 0) - (prev.healthScore || 0);
      summary.delta = d;
      // Build plain-language text
      var parts = [];
      if (d.healthDelta > 0) parts.push("Health improved by " + d.healthDelta + " points (now " + (hs.score || 0) + "/100).");
      else if (d.healthDelta < 0) parts.push("Health dropped " + Math.abs(d.healthDelta) + " points to " + (hs.score || 0) + "/100 - needs attention.");
      else parts.push("Health is steady at " + (hs.score || 0) + "/100.");
      if (d.total > 0) parts.push(d.total + " new item" + (d.total === 1 ? "" : "s") + " added.");
      if (d.crit > 0) parts.push(d.crit + " more critical risk" + (d.crit === 1 ? "" : "s") + " appeared.");
      else if (d.crit < 0) parts.push(Math.abs(d.crit) + " critical risk" + (Math.abs(d.crit) === 1 ? "" : "s") + " resolved.");
      if (d.blocked > 0) parts.push(d.blocked + " more item" + (d.blocked === 1 ? " is" : "s are") + " now blocked.");
      else if (d.blocked < 0) parts.push(Math.abs(d.blocked) + " blocked item" + (Math.abs(d.blocked) === 1 ? "" : "s") + " cleared.");
      if (d.avgDone > 0) parts.push("Average completion up " + d.avgDone + " percentage points.");
      if (!parts.length) parts.push("No significant changes since last week.");
      summary.text = parts.join(" ");
    } else {
      summary.text = "This is the first snapshot. Next week, the app will compare and tell you what changed.";
    }
    // Save new snapshot if enough time has passed
    if (shouldSave) {
      _saveWeeklySnap({ ts: today.getTime(), kpis: now, healthScore: hs.score || 0 });
    }
    return summary;
  }

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.QIStore = API;
})(typeof window !== "undefined" ? window : globalThis);
