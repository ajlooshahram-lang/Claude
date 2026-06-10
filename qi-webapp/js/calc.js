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
    verifyStatus: ["Not started", "In progress", "Verified", "Failed"],
    guideword: ["No / None", "More", "Less", "Reverse", "As well as", "Part of", "Other than", "Early", "Late", "Before", "After"],
    parameter: ["Flow", "Pressure", "Temperature", "Level", "Composition", "Reaction", "Phase", "Mixing", "Time", "Viscosity", "Corrosion", "Voltage", "Signal"],
    personNames: ["PM", "Sponsor", "Dev Lead", "QA Lead", "Ops Lead", "Architect", "BA", "Team Lead", "Process Owner", "DevOps", "Tech Lead", "Engineering Lead", "Quality Manager", "Commissioning Engineer", "Alex Chen", "Maria Santos", "Sam Patel", "Jordan Lee", "Priya Singh", "Chris Doyle", "Robin Fox", "Dana Cole"],
    orgs: ["Engineering", "Operations", "Projects", "Quality", "HSE", "Maintenance", "IT / Digital", "Commercial", "R&D"],
    projectNames: ["QI Intelligence Program", "Plant Upgrade Project", "Commissioning Programme", "Digital Transformation", "New Product Introduction", "Reliability Improvement", "Capital Project Alpha", "Turnaround 2026"]
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
        { key: "parameter", label: "Parameter", type: "select", list: "parameter", w: 120 },
        { key: "guideword", label: "Guideword", type: "select", list: "guideword", w: 120 },
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
      ] },
    { id: "resources", label: "Resources / Capacity", group: "Business", icon: "👥", idPrefix: "RES",
      columns: [
        { key: "person", label: "Person", type: "select", dyn: "owners", w: 140 },
        { key: "role", label: "Role", type: "select", list: "discipline", w: 150 },
        { key: "capacity", label: "Capacity (hrs)", type: "num", w: 110 },
        { key: "allocated", label: "Allocated (hrs)", type: "num", w: 110 },
        { key: "available", label: "Available", type: "computed", w: 100, compute: r => (r.capacity === "" || r.capacity == null) ? "" : (Number(r.capacity) - (Number(r.allocated) || 0)) },
        { key: "util", label: "Utilisation", type: "computed", w: 110, fmt: "pct", compute: r => r.capacity ? (Number(r.allocated) || 0) / Number(r.capacity) : "", badge: v => v === "" ? "" : v > 1 ? "crit" : v >= 0.85 ? "high" : "ok" },
        { key: "status", label: "Status", type: "computed", w: 110, badge: "raw", compute: r => { if (!r.capacity) return ""; const u = (Number(r.allocated) || 0) / Number(r.capacity); return u > 1 ? "Over-allocated" : u >= 0.85 ? "Near full" : "OK"; } }
      ] },
    { id: "okr", label: "OKR Scorecard", group: "Business", icon: "🎯", idPrefix: "OKR",
      columns: [
        { key: "objective", label: "Objective", type: "text", w: 220 },
        { key: "keyResult", label: "Key result (measurable)", type: "text", w: 220 },
        { key: "owner", label: "Owner", type: "select", dyn: "owners", w: 120 },
        { key: "baseline", label: "Baseline", type: "num", w: 90 },
        { key: "target", label: "Target", type: "num", w: 90 },
        { key: "current", label: "Current", type: "num", w: 90 },
        { key: "progress", label: "Progress", type: "computed", w: 110, fmt: "pct", compute: r => { const b = +r.baseline, t = +r.target, c = +r.current; if ([b, t, c].some(x => isNaN(x)) || t === b) return ""; return Math.max(0, Math.min((c - b) / (t - b), 1)); }, badge: v => v === "" ? "" : v >= 1 ? "ok" : v >= 0.7 ? "high" : "crit" },
        { key: "okrStatus", label: "Status", type: "computed", w: 110, badge: "raw", compute: r => { const b = +r.baseline, t = +r.target, c = +r.current; if ([b, t, c].some(x => isNaN(x)) || t === b) return ""; const p = (c - b) / (t - b); return p >= 1 ? "Achieved" : p >= 0.7 ? "On track" : "At risk"; } }
      ] }
  ];

  // ---- Gage R&R (Measurement System Analysis, AIAG average-range method) ----
  const GAGE_K1 = { 2: 0.8862, 3: 0.5908 };                    // trials (repeatability)
  const GAGE_K2 = { 2: 0.7071, 3: 0.5231 };                    // operators (reproducibility)
  const GAGE_K3 = { 2: 0.7071, 3: 0.5231, 4: 0.4467, 5: 0.4030, 6: 0.3742, 7: 0.3534, 8: 0.3375, 9: 0.3249, 10: 0.3146 };
  function gageRR(g) {
    const P = g.parts, O = g.operators, T = g.trials;
    const val = (o, p, t) => { const v = g.data[`${o}_${p}_${t}`]; return (v === "" || v == null || isNaN(v)) ? null : Number(v); };
    // operator part ranges & operator means
    let opRbar = [], opMean = [];
    for (let o = 0; o < O; o++) {
      let ranges = [], all = [];
      for (let p = 0; p < P; p++) {
        let vs = [];
        for (let t = 0; t < T; t++) { const v = val(o, p, t); if (v !== null) { vs.push(v); all.push(v); } }
        if (vs.length >= 1) ranges.push(Math.max(...vs) - Math.min(...vs));
      }
      opRbar.push(ranges.length ? ranges.reduce((a, b) => a + b, 0) / ranges.length : 0);
      opMean.push(all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0);
    }
    const Rbar = opRbar.reduce((a, b) => a + b, 0) / (O || 1);
    const Xdiff = Math.max(...opMean) - Math.min(...opMean);
    // part averages across operators+trials
    let partAvg = [];
    for (let p = 0; p < P; p++) {
      let vs = [];
      for (let o = 0; o < O; o++) for (let t = 0; t < T; t++) { const v = val(o, p, t); if (v !== null) vs.push(v); }
      if (vs.length) partAvg.push(vs.reduce((a, b) => a + b, 0) / vs.length);
    }
    const Rp = partAvg.length ? Math.max(...partAvg) - Math.min(...partAvg) : 0;
    const k1 = GAGE_K1[T] || 0.5908, k2 = GAGE_K2[O] || 0.5231, k3 = GAGE_K3[P] || 0.3146;
    const EV = Rbar * k1;
    const AV = Math.sqrt(Math.max(Math.pow(Xdiff * k2, 2) - (EV * EV) / (P * T), 0));
    const GRR = Math.sqrt(EV * EV + AV * AV);
    const PV = Rp * k3;
    const TV = Math.sqrt(GRR * GRR + PV * PV);
    const pct = x => TV ? 100 * x / TV : 0;
    const grrPct = pct(GRR);
    const verdict = grrPct < 10 ? "Acceptable" : grrPct <= 30 ? "Marginal" : "Unacceptable";
    return { EV, AV, GRR, PV, TV, pctEV: pct(EV), pctAV: pct(AV), pctGRR: grrPct, pctPV: pct(PV),
      ndc: GRR ? Math.floor(1.41 * PV / GRR) : 0, verdict };
  }

  // ---- click-only helpers: numeric option sequences + curated text vocabularies ----
  function numSeq(min, max, step) { const a = []; for (let v = min; v <= max + 1e-9; v += step) a.push(Math.round(v * 100) / 100); return a; }
  const MONEY = [0, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000, 75000, 100000, 150000, 200000, 250000, 500000, 1000000];
  const HOURS = numSeq(0, 200, 8);
  const GAGEVALS = numSeq(0, 2, 0.01);
  const NUMOPTS = {
    "calibration.interval": [3, 6, 12, 18, 24, 36],
    "sil.proofTest": [3, 6, 12, 18, 24, 36],
    "resources.capacity": HOURS, "resources.allocated": HOURS,
    "procurement.value": MONEY,
    "okr.baseline": numSeq(0, 100, 5), "okr.target": numSeq(0, 100, 5), "okr.current": numSeq(0, 100, 5),
    "rice.reach": [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000],
    "rice.impact": [0.25, 0.5, 1, 2, 3, 5, 8],
    "rice.confidence": [50, 60, 70, 80, 90, 100],
    "rice.effort": [0.5, 1, 2, 3, 5, 8, 13, 21],
    "wsjf.score": [1, 2, 3, 5, 8, 13, 20]
  };
  const OPT = {
    "hazop.node": ["Feed line to reactor", "Reactor", "Cooling water system", "Separator", "Compressor suction", "Storage tank", "Flare header", "Pump discharge", "Heat exchanger", "Control loop"],
    "hazop.cause": ["Control valve fails open", "Control valve fails closed", "Pump trip", "Power failure", "Blocked outlet", "Operator error", "Instrument failure", "Loss of utilities", "External fire", "Tube rupture"],
    "hazop.consequence": ["Overpressure / relief lift", "Loss of cooling / high temp", "Loss of containment", "Process upset / trip", "Equipment damage", "Safety incident / injury", "Environmental release", "Production loss", "Quality off-spec"],
    "hazop.safeguard": ["PSV + high-pressure trip", "Standby pump auto-start", "High/low alarm", "Interlock / SIS trip", "Non-return valve", "Operating procedure", "Bund / containment", "Relief to flare", "Regular inspection"],
    "hazop.action": ["Verify trip setpoint at commissioning", "Test auto-start logic", "Add independent alarm", "Confirm SIL rating", "Update procedure", "Add interlock", "Schedule inspection", "Review relief sizing", "Operator training"],
    "hazop.deviation": ["No / low flow", "High flow", "Reverse flow", "High pressure", "Low pressure", "High temperature", "Low temperature", "High level", "Low level", "Wrong composition", "Contamination"],
    "docs.rev": ["A", "B", "C", "D", "0", "1", "2", "3"],
    "calibration.tag": ["PT-1001", "PT-1002", "TT-2003", "FT-3001", "LT-4002", "PT-5001", "TT-6004", "FT-7002", "AT-8001", "LT-9003"],
    "calibration.instrument": ["Pressure transmitter", "Temperature transmitter", "Flow transmitter", "Level transmitter", "Analyser", "Control valve", "Pressure gauge", "Thermocouple", "Vibration probe"],
    "calibration.range": ["0-10 barg", "0-25 barg", "0-100 barg", "0-150 C", "0-400 C", "0-100 %", "0-500 m3/h", "4-20 mA", "0-10 m"],
    "punch.item": ["Missing pipe support", "Insulation incomplete", "Cable gland not sealed", "Valve actuator misaligned", "Instrument not calibrated", "Paint / coating damage", "Earthing not connected", "Label / tag missing", "Drain point blocked", "Access platform incomplete"],
    "punch.system": ["Unit 100", "Unit 200", "Unit 300", "Utilities", "Flare system", "Cooling water", "Electrical room", "Control room", "Tank farm"],
    "sil.sif": ["SIF-01", "SIF-02", "SIF-03", "SIF-04", "SIF-05", "SIF-06"],
    "sil.function": ["Reactor high-pressure trip", "High-temperature shutdown", "Low-level pump protection", "Emergency depressurisation", "Fire & gas shutdown", "Overfill protection", "Compressor anti-surge trip"],
    "rtm.req": ["System shall trip on high pressure within 1s", "System shall log all alarms", "System shall fail safe on power loss", "Throughput shall be >= design rate", "Availability shall be >= 99.5%", "Operator response within 30s", "Data retained for 12 months"],
    "rtm.source": ["FDS-3.2", "URS-1.1", "SRS-2.4", "Cause & Effect", "P&ID", "Datasheet", "Contract spec", "Standard IEC 61511"],
    "rtm.design": ["Logic diagram L-12", "C&E matrix", "Architecture A-01", "Loop drawing", "Network diagram", "ERD / data model"],
    "rtm.test": ["FAT-07", "SAT-03", "Loop test", "Functional test", "Performance test", "Integration test", "Witness test"],
    "docs.docNo": ["P&ID-100-01", "P&ID-200-01", "PFD-001", "C&E-01", "SLD-01", "DS-PT-1001", "SPEC-MECH-01", "LAYOUT-01", "ITP-01"],
    "docs.title": ["P&ID Unit 100", "P&ID Unit 200", "Process flow diagram", "Cause & effect matrix", "Single-line diagram", "Instrument datasheet", "Mechanical specification", "Plot plan / layout", "Inspection & test plan"],
    "ncr.desc": ["Weld defect found on inspection", "Material certificate missing", "Dimension out of tolerance", "Wrong component installed", "Coating thickness below spec", "Calibration out of date", "Procedure not followed", "Documentation incomplete"],
    "moc.change": ["Upsize relief valve PSV-1001", "Change pump material", "Revise control philosophy", "Add bypass line", "Relocate instrument", "Update trip setpoint", "Change vendor / supplier", "Modify layout"],
    "moc.reason": ["Revised relief load", "Obsolete component", "Performance improvement", "Safety recommendation", "Cost reduction", "Constructability", "Client request", "Regulatory requirement"],
    "moc.impact": ["Schedule + cost", "Cost only", "Schedule only", "Safety case update", "Re-validation required", "Documentation only", "No material impact"],
    "milestones.milestone": ["Project kickoff", "Design freeze", "Procurement complete", "Construction start", "Mechanical completion", "Pre-commissioning", "Commissioning", "Start-up / RFSU", "Handover", "Project close-out"],
    "decisions.decision": ["Adopt Kanban for delivery team", "Select DCS vendor", "Approve design change", "Defer scope to phase 2", "Outsource fabrication", "Increase test coverage", "Re-baseline schedule"],
    "decisions.context": ["WIP too high; chose Kanban over Scrum", "Best value of three bids", "Risk reduction outweighs cost", "Budget constraint", "Resource availability", "Client preference", "Lessons from prior project"],
    "procurement.package": ["Control system (DCS)", "Field instruments", "Pumps", "Valves", "Cabling & containment", "Switchgear", "Structural steel", "Piping bulks", "Analyser package"],
    "procurement.vendor": ["TBD", "Vendor A", "Vendor B", "Vendor C", "Framework supplier", "OEM", "Local fabricator"],
    "okr.objective": ["Improve on-time delivery", "Reduce defects", "Cut cycle time", "Improve safety performance", "Increase customer satisfaction", "Deliver within budget", "Build team capability"],
    "okr.keyResult": ["On-time delivery >95%", "Defect rate <2%", "Cycle time reduced 30%", "Zero recordable incidents", "Customer satisfaction >90%", "Cost performance index >=1.0", "100% of staff trained"]
  };
  function imr(series) {
    const v = series.filter(x => x !== null && x !== undefined && !isNaN(x)).map(Number);
    if (v.length < 2) return { values: v, mr: [], mean: null, ucl: null, lcl: null, mrbar: null, mrUcl: null };
    const mr = v.map((x, i) => i === 0 ? null : Math.abs(x - v[i - 1]));
    const mrVals = mr.filter(x => x !== null);
    const mrbar = mrVals.reduce((a, b) => a + b, 0) / mrVals.length;
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    return { values: v, mr, mean, ucl: mean + 2.66 * mrbar, lcl: Math.max(mean - 2.66 * mrbar, 0), mrbar, mrUcl: 3.267 * mrbar };
  }
  function riskMatrix(cases) {
    const band = v => Math.min(Math.max(Math.ceil((Number(v) || 1) / 2), 1), 5);
    const m = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ n: 0, codes: [] })));
    cases.forEach(c => {
      if (c.sev == null || c.occ == null || c.sev === "" || c.occ === "") return;
      const s = band(c.sev), o = band(c.occ);
      m[5 - s][o - 1].n++; m[5 - s][o - 1].codes.push(c.code);
    });
    return m;
  }

  const XBAR_A2 = { 2: 1.88, 3: 1.023, 4: 0.729, 5: 0.577, 6: 0.483 };
  const XBAR_D4 = { 2: 3.267, 3: 2.574, 4: 2.282, 5: 2.114, 6: 2.004 };
  function xbarR(g) {
    const K = g.subgroups, N = g.size;
    const val = (i, j) => { const v = g.data[`${i}_${j}`]; return (v === "" || v == null || isNaN(v)) ? null : Number(v); };
    const means = [], ranges = [];
    for (let i = 0; i < K; i++) {
      let vs = []; for (let j = 0; j < N; j++) { const v = val(i, j); if (v !== null) vs.push(v); }
      if (vs.length) { means.push(vs.reduce((a, b) => a + b, 0) / vs.length); ranges.push(Math.max(...vs) - Math.min(...vs)); }
      else { means.push(null); ranges.push(null); }
    }
    const mV = means.filter(x => x !== null), rV = ranges.filter(x => x !== null);
    const xbb = mV.length ? mV.reduce((a, b) => a + b, 0) / mV.length : 0;
    const rbar = rV.length ? rV.reduce((a, b) => a + b, 0) / rV.length : 0;
    const A2 = XBAR_A2[N] || 0.577, D4 = XBAR_D4[N] || 2.114;
    return { means, ranges, xbb, rbar, xUcl: xbb + A2 * rbar, xLcl: xbb - A2 * rbar, rUcl: D4 * rbar, rLcl: 0 };
  }

  // ---- Process Capability (Cp/Cpk + Pp/Ppk) ----
  // Cp/Cpk use the within-subgroup short-term sigma (R̄ / d2);
  // Pp/Ppk use the overall standard deviation of all observations.
  const D2 = { 2: 1.128, 3: 1.693, 4: 2.059, 5: 2.326, 6: 2.534, 7: 2.704, 8: 2.847, 9: 2.970, 10: 3.078 };
  function capability(g, spec) {
    if (!spec) return null;
    const usl = num(spec.usl), lsl = num(spec.lsl);
    if (usl === null && lsl === null) return null;
    const x = xbarR(g);
    // gather all observations
    const all = [];
    for (let i = 0; i < g.subgroups; i++) for (let j = 0; j < g.size; j++) {
      const v = g.data[`${i}_${j}`]; if (v !== "" && v != null && !isNaN(v)) all.push(Number(v));
    }
    if (all.length < 2) return null;
    const mean = x.xbb, n = all.length;
    const overallVar = all.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1);
    const sigmaLT = Math.sqrt(overallVar);                   // long-term (overall)
    const d2 = D2[g.size] || 2.326;
    const sigmaST = x.rbar > 0 ? x.rbar / d2 : sigmaLT;       // short-term (within)
    const cap = (sig) => {
      const cp = (usl !== null && lsl !== null && sig > 0) ? (usl - lsl) / (6 * sig) : null;
      const cpu = (usl !== null && sig > 0) ? (usl - mean) / (3 * sig) : null;
      const cpl = (lsl !== null && sig > 0) ? (mean - lsl) / (3 * sig) : null;
      const cpk = (cpu === null) ? cpl : (cpl === null) ? cpu : Math.min(cpu, cpl);
      return { cp, cpu, cpl, cpk, sigma: sig };
    };
    // % out of spec (assume normal)
    function nCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
    const pAbove = (usl !== null && sigmaLT > 0) ? 1 - nCdf((usl - mean) / sigmaLT) : 0;
    const pBelow = (lsl !== null && sigmaLT > 0) ? nCdf((lsl - mean) / sigmaLT) : 0;
    return {
      mean, n, usl, lsl, target: num(spec.target),
      st: cap(sigmaST), lt: cap(sigmaLT),
      ppmOut: Math.round((pAbove + pBelow) * 1e6),
      verdict: (() => {
        const c = cap(sigmaST).cpk;
        if (c == null) return "—";
        if (c >= 1.67) return "Excellent (>=1.67)";
        if (c >= 1.33) return "Capable (>=1.33)";
        if (c >= 1.00) return "Marginal (1.00–1.33)";
        return "Not capable (<1.00)";
      })()
    };
  }

  // ---- Prioritisation: RICE & WSJF ----
  // RICE = (Reach × Impact × Confidence) / Effort
  // WSJF = Cost-of-Delay / Job-size; CoD = userValue + timeCriticality + riskReduction
  function rice(c) {
    const r = num(c.reach), i = num(c.impact), cf = num(c.confidence), e = num(c.effort);
    if ([r, i, cf, e].some(x => x === null) || e <= 0) return null;
    return Math.round((r * i * (cf / 100) / e) * 100) / 100;
  }
  function wsjf(c) {
    const uv = num(c.userValue), tc = num(c.timeCrit), rr = num(c.riskRed), js = num(c.jobSize);
    if ([uv, tc, rr, js].some(x => x === null) || js <= 0) return null;
    return Math.round(((uv + tc + rr) / js) * 100) / 100;
  }
  function prioritise(cases, method) {
    const fn = method === "wsjf" ? wsjf : rice;
    return cases.map(c => Object.assign({}, c, { _score: fn(c) }))
      .sort((a, b) => (b._score == null ? -Infinity : b._score) - (a._score == null ? -Infinity : a._score));
  }

  // Earned Value Management from cases (budget + % done) and the schedule.

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

  const API = { LISTS, SUGGEST, num, rpn, rpnBand, estDays, estEnd, health, aiRecommendation, sigmaFromDpmo, stakeholderStrategy, fmtDate, enrich, pareto, controlStats, a3, REGISTERS, addMonths, daysBetween, evm, gageRR, numSeq, MONEY, HOURS, GAGEVALS, NUMOPTS, OPT, imr, riskMatrix, xbarR, capability, rice, wsjf, prioritise };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.QICalc = API;
})(typeof window !== "undefined" ? window : globalThis);
