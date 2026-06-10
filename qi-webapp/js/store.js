/* QI Platform - state, persistence (localStorage), seed data, derived views. */
(function (root) {
  "use strict";
  const C = root.QICalc;
  const KEY = "qi_platform_v9";

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
      ]
    };
  }

  let state = null;

  function load() {
    try {
      const raw = (typeof localStorage !== "undefined") && localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : seed();
    } catch (e) { state = seed(); }
    return state;
  }
  function save() {
    try { if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function get() { return state || load(); }
  function reset() { state = seed(); save(); return state; }
  function replace(obj) { state = obj; save(); return state; }

  // ---- case CRUD ----
  function caseIndex(id) { return get().cases.findIndex(c => c.id === id); }
  function addCase(c) { c.id = c.id || uid(); get().cases.push(c); save(); return c; }
  function updateCase(id, patch) {
    const i = caseIndex(id); if (i < 0) return null;
    Object.assign(get().cases[i], patch); save(); return get().cases[i];
  }
  function deleteCase(id) {
    const i = caseIndex(id); if (i < 0) return false;
    get().cases.splice(i, 1); save(); return true;
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

  const API = { uid, seed, load, save, get, reset, replace, addCase, updateCase, deleteCase,
    enriched, validCases, kpis, groupCounts, rpnByCategory, topRisks, sigmaRows, budgetByCategory, health };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.QIStore = API;
})(typeof window !== "undefined" ? window : globalThis);
