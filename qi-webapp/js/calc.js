/* QI Platform - pure calculation engine + controlled vocabularies.
   No DOM / no storage here, so it can be unit-tested in Node. */
(function (root) {
  "use strict";

  const LISTS = {
    category: ["Quality / Defects", "Delivery / Schedule", "Process / Flow",
      "People / Training", "Cost / Waste", "Safety / Compliance",
      "Technology / Tools", "Customer / VOC"],
    priority: ["1-CRITICAL", "2-HIGH", "3-MEDIUM", "4-LOW"],
    score: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    leanMethod: ["Value Stream Mapping", "Kanban", "PDCA", "Standard Work",
      "Gemba Walk", "Mistake-Proofing / Poka-Yoke", "5S", "A3",
      "Six Sigma DMAIC", "Root Cause / 5 Whys", "Kaizen Event", "Visual Management"],
    status: ["OPEN", "IN PROGRESS", "ON HOLD", "BLOCKED", "RESOLVED", "CLOSED"],
    costCat: ["Labour / Effort", "Tooling / Software", "Training", "Materials",
      "External / Consultant", "Downtime / Lost output", "Other"],
    hml: ["High", "Medium", "Low"],
    raci: ["R - Responsible", "A - Accountable", "C - Consulted", "I - Informed"],
    roles: ["Project Manager", "Sponsor", "Developer", "Dev Lead", "QA / Test",
      "QA Lead", "Operations", "Ops Lead", "Architect", "Business Analyst",
      "Team Lead", "Process Owner", "DevOps", "Tech Lead", "HR",
      "Engineering Lead", "Quality Manager", "Commissioning Engineer", "Stakeholder"]
  };

  const SUGGEST = {
    problem: [
      "Delivery targets missed consistently", "Defect rate too high - customer complaints",
      "Team overwhelmed - too many parallel tasks", "Approval bottleneck adds delay",
      "Onboarding takes too long", "Leader not visible to frontline team",
      "Cycle time too long vs customer demand", "High work-in-progress / bottleneck forming",
      "Rework loop consuming team capacity", "Cost overrun against budget",
      "Safety near-miss reported", "Audit / compliance finding raised",
      "Knowledge lost when staff leave", "Manual process prone to error",
      "Handoffs between teams causing delay", "Instrument calibration behind schedule",
      "Electrical loop tests failing repeatedly", "Control system commissioning delayed",
      "HAZOP action items not closed", "As-built documentation incomplete"
    ],
    root: [
      "Handoff delays invisible; no WIP limits", "No quality check at source",
      "No WIP limits; everything is priority 1", "Wrong routing; unclear decision authority",
      "No documented process; tribal knowledge", "No structured cadence in place",
      "Process not standardised", "No clear ownership / RACI",
      "Insufficient training or skills", "Tooling / system limitation",
      "Unclear or changing requirements", "Lack of data to make decisions"
    ],
    target: [
      "On-time delivery >95% in 8 weeks", "Zero defect escapes within 4 weeks",
      "Max 3 active tasks per person", "Approval time <4 hours",
      "Onboard in 2 weeks, consistent quality", "Reduce cycle time by 30% in 8 weeks",
      "Cut defect rate below 2% in 6 weeks", "Reduce cost of poor quality by 25%",
      "Close all critical risks within 2 weeks", "Achieve Sigma level >= 4.0",
      "Zero safety incidents this quarter", "Cut approval lead time to < 4 hours"
    ]
  };

  function num(v) { return (v === "" || v === null || v === undefined) ? null : Number(v); }

  function rpn(c) {
    const s = num(c.sev), o = num(c.occ), d = num(c.det);
    if (s === null || o === null || d === null) return null;
    return s * o * d;
  }

  function rpnBand(r) {
    if (r === null) return "";
    if (r >= 200) return "1-CRITICAL";
    if (r >= 100) return "2-HIGH";
    if (r >= 50) return "3-MEDIUM";
    return "4-LOW";
  }

  function estDays(c) {
    if (!c.problem) return null;
    const base = c.priority === "1-CRITICAL" ? 7 :
      c.priority === "2-HIGH" ? 14 :
        c.priority === "3-MEDIUM" ? 30 : 45;
    const r = rpn(c) || 0;
    return Math.round(base * (1 + r / 400));
  }

  function estEnd(c) {
    if (!c.startDate || !c.problem) return null;
    const days = estDays(c);
    if (days === null) return null;
    const d = new Date(c.startDate + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function health(c) {
    if (!c.problem) return "";
    if (c.status === "CLOSED") return "Closed";
    if (c.status === "RESOLVED") return "Resolved";
    if (c.status === "BLOCKED") return "Blocked";
    const r = rpn(c);
    if (r !== null && r >= 200) return "Critical";
    if (r !== null && r >= 100) return "High";
    if (c.priority === "1-CRITICAL") return "High";
    return "On track";
  }

  function aiRecommendation(c) {
    if (!c.problem) return "";
    if (c.status === "CLOSED") return "Closed - capture lessons learned in the PDCA Act phase.";
    const r = rpn(c);
    const owner = c.owner || "the owner";
    const method = c.leanMethod || "a Lean method";
    const end = estEnd(c);
    const by = end ? fmtDate(end) : "ASAP";
    if (r !== null && r >= 200)
      return `CRITICAL (RPN ${r}): Escalate today. Open an FMEA action + daily PDCA. Owner ${owner}. Apply ${method}. Close by ${by}.`;
    if (r !== null && r >= 100)
      return `HIGH (RPN ${r}): Add to the current sprint. Mitigate via ${method}. Review weekly with ${owner}.`;
    if (c.priority === "1-CRITICAL" || c.priority === "2-HIGH")
      return `Priority case: schedule ${method} within 2 weeks. Track to "${c.target || "the target"}".`;
    return `Monitor: apply ${method} on the normal cadence. Re-score if conditions change.`;
  }

  function sigmaFromDpmo(dpmo) {
    if (dpmo === null || dpmo <= 0) return null;
    const v = 29.37 - 2.221 * Math.log(dpmo);
    return Math.round((0.8406 + Math.sqrt(Math.max(v, 0))) * 100) / 100;
  }

  function stakeholderStrategy(infl, interest) {
    if (!infl || !interest) return "";
    if (infl === "High" && interest === "High") return "Manage closely";
    if (infl === "High") return "Keep satisfied";
    if (interest === "High") return "Keep informed";
    return "Monitor";
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
    if (isNaN(d)) return iso;
    const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${String(d.getDate()).padStart(2, "0")}-${m[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
  }

  function enrich(c) {
    const r = rpn(c);
    return Object.assign({}, c, {
      rpn: r,
      rpnBand: rpnBand(r),
      estDays: estDays(c),
      estEnd: estEnd(c),
      health: health(c),
      ai: aiRecommendation(c),
      rankKey: r === null ? 0 : r
    });
  }

  // Pareto: sorted descending with cumulative %.
  function pareto(pairs) {
    const sorted = pairs.filter(p => p.value > 0).sort((a, b) => b.value - a.value);
    const total = sorted.reduce((a, p) => a + p.value, 0) || 1;
    let run = 0;
    return sorted.map(p => { run += p.value; return { label: p.label, value: p.value, cum: (run / total) * 100 }; });
  }

  // Control chart stats for a numeric series (ignores null). Center + 3-sigma limits.
  function controlStats(series) {
    const vals = series.filter(v => v !== null && v !== undefined && !isNaN(v));
    if (!vals.length) return { mean: null, ucl: null, lcl: null, sd: 0 };
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length);
    return { mean, sd, ucl: mean + 3 * sd, lcl: Math.max(mean - 3 * sd, 0) };
  }

  // Build an A3 one-pager (plain object) from a case.
  function a3(c) {
    const e = enrich(c);
    const whys = (c.whys || []).filter(Boolean);
    return {
      title: c.problem || "(untitled case)",
      owner: c.owner || "(unassigned)",
      background: `Category: ${c.category || "-"} | Priority: ${c.priority || "-"} | Status: ${c.status || "-"}`,
      current: `RPN ${e.rpn ?? "-"} (${e.rpnBand || "-"}). ${c.problem || ""}`,
      goal: c.target || "(define a measurable target)",
      rootCause: c.rootCause || "(run a root-cause analysis)",
      whys,
      countermeasure: `Method: ${c.leanMethod || "(choose a Lean method)"}. ${e.ai}`,
      plan: `Start ${fmtDate(c.startDate) || "-"} -> due ${fmtDate(e.estEnd) || "-"} (est. ${e.estDays ?? "-"} days). Owner: ${c.owner || "-"}.`,
      followup: "Verify the target metric weekly; standardise once stable; close with lessons learned."
    };
  }

  // ===================== Engineering / Business registers =====================
  // extra controlled vocabularies
  Object.assign(LISTS, {
    discipline: ["Process", "Mechanical", "Piping", "Electrical", "Instrumentation / Control",
      "Civil / Structural", "HSE / Safety", "Software", "Commissioning", "Quality", "Project Controls"],
    scale5: [1, 2, 3, 4, 5],
    regStatus: ["OPEN", "IN PROGRESS", "ON HOLD", "CLOSED"],
    punchCat: ["A - Before start-up", "B - Before handover", "C - Minor / post-handover"],
    sil: ["None", "SIL 1", "SIL 2", "SIL 3", "SIL 4"],
    yesNoPartial: ["Yes", "No", "Partial"],
    disposition: ["Use as is", "Rework", "Repair", "Reject", "Regrade"],
    docStatus: ["Draft", "Issued for review", "Approved", "As-built", "Superseded"],
    mocStatus: ["Requested", "Under review", "Approved", "Rejected", "Implemented"],
    poStatus: ["RFQ", "PO placed", "In manufacture", "Shipped", "Delivered", "Closed"],
    verifyStatus: ["Not started", "In progress", "Verified", "Failed"]
  });

  function addMonths(iso, m) {
    if (!iso || !m) return "";
    const d = new Date(iso + "T00:00:00"); if (isNaN(d)) return "";
    d.setMonth(d.getMonth() + Number(m));
    return d.toISOString().slice(0, 10);
  }
  function daysBetween(a, b) {
    if (!a || !b) return null;
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }
  const today = () => new Date().toISOString().slice(0, 10);

  // Each register: id, label, group, icon, idPrefix, columns[{key,label,type,list|opts|dyn,w,compute,fmt,badge}]
  const REGISTERS = [
    { id: "hazop", label: "HAZOP / Hazards", group: "Engineering", icon: "☢", idPrefix: "HZ",
      columns: [
        { key: "node", label: "Node / Study point", type: "text", w: 150 },
        { key: "deviation", label: "Deviation", type: "text", w: 150 },
        { key: "cause", label: "Cause", type: "text", w: 170 },
        { key: "consequence", label: "Consequence", type: "text", w: 170 },
        { key: "sev", label: "Sev (1-5)", type: "select", list: "scale5", w: 70 },
        { key: "lik", label: "Likelihood (1-5)", type: "select", list: "scale5", w: 80 },
        { key: "risk", label: "Risk", type: "computed", w: 80, compute: r => (r.sev && r.lik) ? r.sev * r.lik : "", badge: v => v >= 15 ? "crit" : v >= 8 ? "high" : v ? "ok" : "" },
        { key: "safeguard", label: "Safeguard", type: "text", w: 160 },
        { key: "action", label: "Recommended action", type: "text", w: 180 },
        { key: "owner", label: "Owner", type: "select", dyn: "owners", w: 120 },
        { key: "status", label: "Status", type: "select", list: "regStatus", w: 120, badge: "status" },
        { key: "case", label: "Linked case", type: "select", dyn: "cases", w: 120 }
      ] },
    { id: "calibration", label: "Calibration", group: "Engineering", icon: "🎚", idPrefix: "CAL",
      columns: [
        { key: "tag", label: "Tag no.", type: "text", w: 110 },
        { key: "instrument", label: "Instrument", type: "text", w: 160 },
        { key: "range", label: "Range / Units", type: "text", w: 120 },
        { key: "discipline", label: "Discipline", type: "select", list: "discipline", w: 150 },
        { key: "lastCal", label: "Last cal.", type: "date", w: 120 },
        { key: "interval", label: "Interval (mo)", type: "num", w: 90 },
        { key: "nextDue", label: "Next due", type: "computed", w: 120, fmt: "date", compute: r => addMonths(r.lastCal, r.interval) },
        { key: "calState", label: "Status", type: "computed", w: 110, badge: "raw", compute: r => {
            const nd = addMonths(r.lastCal, r.interval); if (!nd) return "";
            const d = daysBetween(today(), nd);
            return d == null ? "" : d < 0 ? "Overdue" : d <= 30 ? "Due soon" : "OK";
          } },
        { key: "technician", label: "Technician", type: "select", dyn: "owners", w: 120 },
        { key: "result", label: "Result", type: "select", opts: ["Pass", "Adjusted", "Fail"], w: 100 }
      ] },
    { id: "punch", label: "Punch List", group: "Engineering", icon: "📌", idPrefix: "PL",
      columns: [
        { key: "item", label: "Punch item", type: "text", w: 220 },
        { key: "system", label: "System / Area", type: "text", w: 140 },
        { key: "discipline", label: "Discipline", type: "select", list: "discipline", w: 150 },
        { key: "category", label: "Category", type: "select", list: "punchCat", w: 160, badge: "raw" },
        { key: "raisedBy", label: "Raised by", type: "select", dyn: "owners", w: 120 },
        { key: "responsible", label: "Responsible", type: "select", dyn: "owners", w: 120 },
        { key: "due", label: "Due", type: "date", w: 120 },
        { key: "status", label: "Status", type: "select", list: "regStatus", w: 120, badge: "status" }
      ] },
    { id: "sil", label: "SIL / Functional Safety", group: "Engineering", icon: "🛡", idPrefix: "SIF",
      columns: [
        { key: "sif", label: "SIF tag", type: "text", w: 110 },
        { key: "function", label: "Safety function", type: "text", w: 220 },
        { key: "required", label: "Required SIL", type: "select", list: "sil", w: 110 },
        { key: "achieved", label: "Achieved SIL", type: "select", list: "sil", w: 110 },
        { key: "gap", label: "Meets target?", type: "computed", w: 110, badge: "raw", compute: r => {
            if (!r.required || !r.achieved) return "";
            const rank = s => ["None", "SIL 1", "SIL 2", "SIL 3", "SIL 4"].indexOf(s);
            return rank(r.achieved) >= rank(r.required) ? "Met" : "Gap";
          } },
        { key: "proofTest", label: "Proof test (mo)", type: "num", w: 100 },
        { key: "verified", label: "Verified", type: "select", list: "yesNoPartial", w: 100 },
        { key: "owner", label: "Owner", type: "select", dyn: "owners", w: 120 },
        { key: "status", label: "Status", type: "select", list: "regStatus", w: 120, badge: "status" }
      ] },
    { id: "rtm", label: "Requirements Traceability", group: "Engineering", icon: "🔗", idPrefix: "REQ",
      columns: [
        { key: "req", label: "Requirement", type: "text", w: 240 },
        { key: "source", label: "Source / Spec", type: "text", w: 150 },
        { key: "discipline", label: "Discipline", type: "select", list: "discipline", w: 150 },
        { key: "design", label: "Design ref", type: "text", w: 130 },
        { key: "test", label: "Test / Verification ref", type: "text", w: 150 },
        { key: "verify", label: "Verification", type: "select", list: "verifyStatus", w: 120, badge: "raw" },
        { key: "case", label: "Linked case", type: "select", dyn: "cases", w: 120 }
      ] },
    { id: "docs", label: "Document Register", group: "Engineering", icon: "📄", idPrefix: "DOC",
      columns: [
        { key: "docNo", label: "Document no.", type: "text", w: 140 },
        { key: "title", label: "Title", type: "text", w: 240 },
        { key: "discipline", label: "Discipline", type: "select", list: "discipline", w: 150 },
        { key: "rev", label: "Rev", type: "text", w: 70 },
        { key: "status", label: "Status", type: "select", list: "docStatus", w: 150, badge: "raw" },
        { key: "due", label: "Due", type: "date", w: 120 },
        { key: "owner", label: "Owner", type: "select", dyn: "owners", w: 120 }
      ] },
    { id: "ncr", label: "Non-Conformance", group: "Engineering", icon: "⛔", idPrefix: "NCR",
      columns: [
        { key: "desc", label: "Description", type: "text", w: 240 },
        { key: "discipline", label: "Discipline", type: "select", list: "discipline", w: 150 },
        { key: "severity", label: "Severity", type: "select", opts: ["Minor", "Major", "Critical"], w: 100, badge: "raw" },
        { key: "disposition", label: "Disposition", type: "select", list: "disposition", w: 120 },
        { key: "owner", label: "Owner", type: "select", dyn: "owners", w: 120 },
        { key: "raised", label: "Raised", type: "date", w: 120 },
        { key: "status", label: "Status", type: "select", list: "regStatus", w: 120, badge: "status" },
        { key: "case", label: "Linked case", type: "select", dyn: "cases", w: 120 }
      ] },
    { id: "moc", label: "Management of Change", group: "Engineering", icon: "♺", idPrefix: "MOC",
      columns: [
        { key: "change", label: "Proposed change", type: "text", w: 240 },
        { key: "reason", label: "Reason / Driver", type: "text", w: 180 },
        { key: "impact", label: "Impact", type: "text", w: 180 },
        { key: "risk", label: "Risk", type: "select", list: "hml", w: 90, badge: "raw" },
        { key: "approver", label: "Approver", type: "select", dyn: "owners", w: 120 },
        { key: "status", label: "Status", type: "select", list: "mocStatus", w: 140, badge: "raw" },
        { key: "date", label: "Date", type: "date", w: 120 }
      ] },
    { id: "milestones", label: "Milestones", group: "Business", icon: "🚩", idPrefix: "MS",
      columns: [
        { key: "milestone", label: "Milestone", type: "text", w: 220 },
        { key: "baseline", label: "Baseline date", type: "date", w: 130 },
        { key: "forecast", label: "Forecast date", type: "date", w: 130 },
        { key: "actual", label: "Actual date", type: "date", w: 130 },
        { key: "variance", label: "Slip (days)", type: "computed", w: 100, compute: r => daysBetween(r.baseline, r.actual || r.forecast), badge: v => v == null || v === "" ? "" : v > 0 ? "crit" : "ok" },
        { key: "status", label: "Status", type: "select", opts: ["Planned", "On track", "At risk", "Slipped", "Done"], w: 120, badge: "raw" },
        { key: "owner", label: "Owner", type: "select", dyn: "owners", w: 120 }
      ] },
    { id: "decisions", label: "Decision Log", group: "Business", icon: "⚖", idPrefix: "DEC",
      columns: [
        { key: "decision", label: "Decision", type: "text", w: 240 },
        { key: "context", label: "Context / Options", type: "text", w: 220 },
        { key: "owner", label: "Decided by", type: "select", dyn: "owners", w: 120 },
        { key: "date", label: "Date", type: "date", w: 120 },
        { key: "status", label: "Status", type: "select", opts: ["Proposed", "Approved", "Rejected", "Deferred"], w: 120, badge: "raw" }
      ] },
    { id: "procurement", label: "Procurement", group: "Business", icon: "📦", idPrefix: "PO",
      columns: [
        { key: "package", label: "Package / Item", type: "text", w: 200 },
        { key: "vendor", label: "Vendor", type: "text", w: 150 },
        { key: "value", label: "Value", type: "num", w: 110, fmt: "money" },
        { key: "poStatus", label: "PO status", type: "select", list: "poStatus", w: 130, badge: "raw" },
        { key: "delivery", label: "Delivery date", type: "date", w: 130 },
        { key: "owner", label: "Buyer / Owner", type: "select", dyn: "owners", w: 120 }
      ] }
  ];

  // Earned Value Management from cases (budget + % done) and the schedule.
  function evm(cases, project) {
    const v = cases.filter(c => c.problem);
    const bac = v.reduce((a, c) => a + (Number(c.estCost) || 0), 0);
    const ev = v.reduce((a, c) => a + (Number(c.estCost) || 0) * (Number(c.percent) || 0), 0);
    const ac = v.reduce((a, c) => a + (Number(c.actCost) || 0), 0);
    let frac = 0;
    if (project && project.start && project.end) {
      const s = +new Date(project.start), e = +new Date(project.end), n = Date.now();
      frac = e > s ? Math.min(Math.max((n - s) / (e - s), 0), 1) : 0;
    }
    const pv = bac * frac;
    const cpi = ac ? ev / ac : 0, spi = pv ? ev / pv : 0;
    const eac = cpi ? bac / cpi : bac;
    return { bac, ev, ac, pv, cpi, spi, cv: ev - ac, sv: ev - pv, eac, vac: bac - (cpi ? bac / cpi : bac), frac };
  }

  const API = { LISTS, SUGGEST, num, rpn, rpnBand, estDays, estEnd, health, aiRecommendation, sigmaFromDpmo, stakeholderStrategy, fmtDate, enrich, pareto, controlStats, a3, REGISTERS, addMonths, daysBetween, evm };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.QICalc = API;
})(typeof window !== "undefined" ? window : globalThis);
