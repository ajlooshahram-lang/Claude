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

  const API = { LISTS, SUGGEST, num, rpn, rpnBand, estDays, estEnd, health, aiRecommendation, sigmaFromDpmo, stakeholderStrategy, fmtDate, enrich };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.QICalc = API;
})(typeof window !== "undefined" ? window : globalThis);
