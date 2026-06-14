/* Headless tests for the Project Brain analyzer (deterministic, offline). */
const B = require("./js/brain.js");

let fails = 0;
function ok(cond, msg) { console.log((cond ? "  ok  " : "FAIL  ") + msg); if (!cond) fails++; }

// A realistic (non-confidential, synthetic) fibre-network brief.
const fibreBrief = `Regional FTTH Backbone Rollout
Deploy a 1,200 km fibre optic backbone across 3 provinces, connecting 45 sites
and passing 120,000 homes. Includes route survey, right-of-way permitting,
trenching and HDD civil works, cable blowing, fusion splicing and OTDR testing.
Target duration 18 months. GPON last-mile to subscribers.`;

console.log("-- fibre profile detection --");
const r = B.analyzeProject(fibreBrief);
ok(r.summary.domain === "fibre-telecom", "detects fibre/telecom domain (got " + r.summary.domain + ")");
ok(r.summary.scale.routeKm === 1200, "parses 1,200 km route length (got " + r.summary.scale.routeKm + ")");
ok(r.summary.scale.sites === 45, "parses 45 sites (got " + r.summary.scale.sites + ")");
ok(r.summary.scale.homesPassed === 120000, "parses 120,000 homes passed (got " + r.summary.scale.homesPassed + ")");
ok(r.summary.scale.durationMonths === 18, "parses 18 months duration");
ok(r.coverage.confidence >= 0.6, "confidence is high for a clear brief (" + r.coverage.confidence + ")");

console.log("\n-- plan completeness --");
ok(r.phases.length >= 6, "produces a multi-phase WBS (" + r.phases.length + " phases)");
ok(r.cases.length >= 10, "produces task cases (" + r.cases.length + ")");
ok(r.risks.length >= 5, "produces a domain risk set (" + r.risks.length + ")");
ok(r.risks.every(x => x._brain === "risk"), "risks are tagged as risks");
ok(r.cases.every(x => x._brain === "task"), "tasks are tagged as tasks");
ok(r.milestones.length === r.phases.length, "one milestone per phase");
ok(r.procurement.length >= 3, "produces a procurement list");
ok(r.budget.total > 0 && r.budget.rows.some(x => /Contingency/.test(x.category)), "budget rolls up with contingency");
ok(r.roles.includes("Splicing Supervisor"), "suggests domain roles (splicing supervisor)");

console.log("\n-- standards / kpis / deliverables coverage --");
ok(r.standards.length >= 27, "standards array populated (" + r.standards.length + " standards)");
ok(r.kpis.length >= 12, "kpis array populated (" + r.kpis.length + " KPIs)");
ok(r.deliverables.length >= 22, "deliverables array populated (" + r.deliverables.length + " deliverables)");
ok(r.standards.every(s => s.id && s.title && s.scope && s.applicability), "every standard has id, title, scope, applicability keys");
ok(r.kpis.every(k => k.id && k.name && k.target), "every KPI has id, name, target keys");
ok(r.deliverables.every(d => d.id && d.name && d.phase && d.description), "every deliverable has id, name, phase, description keys");

console.log("\n-- deliverable-to-phase mapping integrity --");
const phaseNames = r.phases.map(p => p.name);
ok(r.deliverables.every(d => phaseNames.includes(d.phase)), "every deliverable phase matches a plan phase name");

console.log("\n-- civil cost scales with detected km --");
const small = B.analyzeProject("FTTH build, fibre, OTDR, splicing, 10 km route, 2 sites");
const big = B.analyzeProject("FTTH build, fibre, OTDR, splicing, 2000 km route, 2 sites");
const civilSmall = small.cases.find(c => /Trenching/.test(c.problem)).estCost;
const civilBig = big.cases.find(c => /Trenching/.test(c.problem)).estCost;
ok(civilBig > civilSmall * 50, "civil cost scales with route length (" + civilSmall + " -> " + civilBig + ")");

console.log("\n-- generic fallback + honest warnings --");
const g = B.analyzeProject("We want to reorganise the office filing system and onboarding.");
ok(g.summary.domain === "generic-pm", "falls back to generic PM when no domain signal");
ok(g.coverage.warnings.length >= 1, "warns when domain is not confidently detected");
ok(g.standards.length === 0, "generic profile returns empty standards array");
ok(g.kpis.length === 0, "generic profile returns empty kpis array");
ok(g.deliverables.length === 0, "generic profile returns empty deliverables array");
const noKm = B.analyzeProject("FTTH fibre OTDR splicing project with GPON");
ok(noKm.coverage.warnings.some(w => /km/.test(w)), "warns when no route length detected");

console.log("\n-- determinism (no hidden randomness) --");
ok(JSON.stringify(B.analyzeProject(fibreBrief)) === JSON.stringify(B.analyzeProject(fibreBrief)), "same input -> identical output");

// ============================================================================
// Intelligence Engine Tests
// ============================================================================

console.log("\n-- analyzeStatus: overbudget, stalled, overloaded owner --");
(function () {
  // Create a project state with known problematic cases
  var stalledStart = "2025-01-01"; // well over 30 days ago
  var projectState = {
    cases: [
      // Overbudget cases
      { id: "C01", problem: "Cable procurement", category: "Materials", priority: "2-HIGH", sev: 5, occ: 4, det: 3, owner: "Alice", status: "IN PROGRESS", percent: 0.5, startDate: "2025-04-01", costCat: "Capex", estCost: 100000, actCost: 150000 },
      { id: "C02", problem: "Trenching phase 1", category: "Civil", priority: "1-CRITICAL", sev: 6, occ: 5, det: 4, owner: "Bob", status: "IN PROGRESS", percent: 0.4, startDate: "2025-04-01", costCat: "Civil", estCost: 200000, actCost: 280000 },
      // Stalled case (IN PROGRESS, percent < 0.2, startDate > 30 days ago)
      { id: "C03", problem: "Permit acquisition zone A", category: "Regulatory", priority: "1-CRITICAL", sev: 8, occ: 7, det: 5, owner: "OverloadedGuy", status: "IN PROGRESS", percent: 0.1, startDate: stalledStart, costCat: "Opex", estCost: 50000, actCost: 40000 },
      // Cases to make OverloadedGuy have >5 open critical items
      { id: "C04", problem: "Right-of-way clearance", category: "Regulatory", priority: "1-CRITICAL", sev: 7, occ: 6, det: 4, owner: "OverloadedGuy", status: "OPEN", percent: 0, startDate: "2025-05-01", costCat: "Opex", estCost: 30000, actCost: 10000 },
      { id: "C05", problem: "Environmental assessment", category: "Regulatory", priority: "1-CRITICAL", sev: 6, occ: 5, det: 3, owner: "OverloadedGuy", status: "OPEN", percent: 0, startDate: "2025-05-01", costCat: "Opex", estCost: 20000, actCost: 5000 },
      { id: "C06", problem: "Community engagement", category: "Stakeholder", priority: "2-HIGH", sev: 5, occ: 4, det: 3, owner: "OverloadedGuy", status: "OPEN", percent: 0, startDate: "2025-05-01", costCat: "Opex", estCost: 15000, actCost: 3000 },
      { id: "C07", problem: "Safety compliance audit", category: "Quality", priority: "1-CRITICAL", sev: 7, occ: 5, det: 4, owner: "OverloadedGuy", status: "OPEN", percent: 0, startDate: "2025-05-01", costCat: "Opex", estCost: 25000, actCost: 8000 },
      { id: "C08", problem: "Subcontractor coordination", category: "Process / Flow", priority: "2-HIGH", sev: 6, occ: 5, det: 3, owner: "OverloadedGuy", status: "IN PROGRESS", percent: 0.15, startDate: stalledStart, costCat: "Opex", estCost: 40000, actCost: 12000 },
      { id: "C09", problem: "Utility relocation", category: "Civil", priority: "1-CRITICAL", sev: 8, occ: 6, det: 5, owner: "OverloadedGuy", status: "OPEN", percent: 0, startDate: "2025-05-01", costCat: "Civil", estCost: 60000, actCost: 20000 }
    ],
    registers: {
      milestones: [
        { milestone: "Design complete", baseline: "M+3", forecast: "M+5", status: "At Risk", owner: "Alice" },
        { milestone: "Civil works done", baseline: "M+6", forecast: "M+8", status: "At Risk", owner: "Bob" }
      ]
    },
    project: { start: "2025-01-01", end: "2026-06-30" }
  };

  var result = B.analyzeStatus(projectState);

  // Check overall structure
  ok(result.overallHealth === "critical" || result.overallHealth === "warning", "analyzeStatus returns health status (got " + result.overallHealth + ")");
  ok(Array.isArray(result.findings), "analyzeStatus returns findings array");
  ok(result.findings.length > 0, "analyzeStatus generates findings for problematic state (" + result.findings.length + " findings)");
  ok(typeof result.scores === "object", "analyzeStatus returns scores object");
  ok(typeof result.scores.spiEstimate === "number", "scores has spiEstimate");
  ok(typeof result.scores.cpiEstimate === "number", "scores has cpiEstimate");
  ok(typeof result.scores.riskExposure === "number", "scores has riskExposure");
  ok(typeof result.scores.qualityIndex === "number", "scores has qualityIndex");

  // Check for overbudget findings
  var costFindings = result.findings.filter(function (f) { return f.type === "cost"; });
  ok(costFindings.length >= 2, "detects overbudget cases (" + costFindings.length + " cost findings)");

  // Check for stalled findings
  var stalledFindings = result.findings.filter(function (f) { return f.type === "stalled"; });
  ok(stalledFindings.length >= 1, "detects stalled cases (" + stalledFindings.length + " stalled findings)");

  // Check for resource/overloaded owner findings
  var resourceFindings = result.findings.filter(function (f) { return f.type === "resource"; });
  ok(resourceFindings.length >= 1, "detects overloaded owner (" + resourceFindings.length + " resource findings)");
  ok(resourceFindings.some(function (f) { return f.detail.indexOf("OverloadedGuy") >= 0; }), "identifies the overloaded owner by name");

  // Check for schedule slippage findings
  var scheduleFindings = result.findings.filter(function (f) { return f.type === "schedule"; });
  ok(scheduleFindings.length >= 2, "detects milestone slippage (" + scheduleFindings.length + " schedule findings)");

  // CPI should be less than 1 since actCost > earned value for overbudget items
  ok(result.scores.cpiEstimate < 1, "CPI estimate reflects cost overrun (cpi=" + result.scores.cpiEstimate + ")");
})();

console.log("\n-- analyzeStatus: healthy project --");
(function () {
  var healthyState = {
    cases: [
      { id: "H01", problem: "Task A", category: "Process / Flow", priority: "3-MEDIUM", sev: 3, occ: 2, det: 2, owner: "Alice", status: "IN PROGRESS", percent: 0.8, startDate: "2025-05-01", costCat: "Opex", estCost: 10000, actCost: 8000 },
      { id: "H02", problem: "Task B", category: "Process / Flow", priority: "3-MEDIUM", sev: 2, occ: 2, det: 2, owner: "Bob", status: "RESOLVED", percent: 1.0, startDate: "2025-04-01", costCat: "Opex", estCost: 5000, actCost: 4500 }
    ],
    registers: { milestones: [{ milestone: "Phase 1", baseline: "M+3", forecast: "M+3", status: "On Track", owner: "Alice" }] },
    project: { start: "2025-01-01", end: "2026-12-31" }
  };
  var result = B.analyzeStatus(healthyState);
  ok(result.overallHealth === "on-track", "healthy project returns on-track (got " + result.overallHealth + ")");
  ok(result.scores.qualityIndex > 0.5, "healthy project has good quality index (" + result.scores.qualityIndex + ")");
})();

console.log("\n-- recordLesson + recallLessons round-trip --");
(function () {
  // Clear any previous lessons
  B._clearLessons();

  // Record a lesson
  var lesson1 = B.recordLesson({
    challenge: "Permit delays blocked civil works for 3 months",
    resolution: "Engage with local authorities 6 months before construction start",
    category: "Regulatory",
    tags: ["permits", "civil", "delay"],
    impact: "high",
    projectType: "fibre-telecom"
  });
  ok(lesson1.id && lesson1.id.indexOf("les_") === 0, "recordLesson returns entry with ID (got " + lesson1.id + ")");
  ok(lesson1.challenge === "Permit delays blocked civil works for 3 months", "recordLesson stores challenge");
  ok(lesson1.resolution === "Engage with local authorities 6 months before construction start", "recordLesson stores resolution");
  ok(lesson1.timesRecalled === 0, "new lesson starts with timesRecalled=0");

  // Record a second lesson
  B.recordLesson({
    challenge: "Fibre cable delivery delayed by 2 months due to global shortage",
    resolution: "Maintain buffer stock and diversify suppliers",
    category: "Materials",
    tags: ["supply-chain", "cable", "procurement"],
    impact: "medium",
    projectType: "fibre-telecom"
  });

  // Recall by category
  var recalled = B.recallLessons({ category: "Regulatory", query: "permit delays" });
  ok(recalled.length >= 1, "recallLessons finds lesson by category (" + recalled.length + " results)");
  ok(recalled[0].challenge.indexOf("Permit delays") >= 0, "recalled lesson matches the stored one");

  // Recall by tags
  var recalledByTags = B.recallLessons({ tags: ["permits", "civil"], query: "delay" });
  ok(recalledByTags.length >= 1, "recallLessons finds lesson by tags (" + recalledByTags.length + " results)");

  // Recall by query matching cable-related lesson
  var cableResults = B.recallLessons({ query: "cable supply shortage procurement" });
  ok(cableResults.length >= 1, "recallLessons finds cable lesson by query");
  ok(cableResults.some(function (l) { return l.challenge.indexOf("cable delivery") >= 0; }), "cable lesson content matches");

  // Verify timesRecalled increments
  var recalledAgain = B.recallLessons({ category: "Regulatory", query: "permit delays" });
  ok(recalledAgain[0].timesRecalled >= 1, "timesRecalled increments on recall (got " + recalledAgain[0].timesRecalled + ")");
})();

console.log("\n-- suggestMitigations --");
(function () {
  // Lessons already stored from previous test block
  var suggestions = B.suggestMitigations("permitting delays blocking civil works in zone B");
  ok(Array.isArray(suggestions), "suggestMitigations returns array");
  ok(suggestions.length >= 1, "suggestMitigations finds relevant lessons (" + suggestions.length + " results)");
  ok(suggestions[0].resolution.indexOf("authorities") >= 0, "suggestion resolution matches stored lesson");
  ok(typeof suggestions[0].confidence === "number" && suggestions[0].confidence > 0, "suggestion has confidence score (" + suggestions[0].confidence + ")");
  ok(suggestions[0].lessonId, "suggestion includes lessonId reference");
})();

console.log("\n-- detectPatterns: category clustering --");
(function () {
  // >40% of high-RPN (sev*occ*det > 200) cases in same category
  var clusterState = {
    cases: [
      // 4 high-RPN cases in "Civil" category (4/5 = 80% > 40%)
      { id: "P01", problem: "Trench collapse risk", category: "Civil", sev: 8, occ: 6, det: 5, owner: "A", status: "OPEN", percent: 0, estCost: 10000, actCost: 5000 },
      { id: "P02", problem: "Road crossing permit", category: "Civil", sev: 7, occ: 7, det: 5, owner: "B", status: "OPEN", percent: 0, estCost: 10000, actCost: 5000 },
      { id: "P03", problem: "HDD bore failure", category: "Civil", sev: 9, occ: 5, det: 5, owner: "C", status: "OPEN", percent: 0, estCost: 10000, actCost: 5000 },
      { id: "P04", problem: "Duct congestion", category: "Civil", sev: 8, occ: 5, det: 6, owner: "D", status: "OPEN", percent: 0, estCost: 10000, actCost: 5000 },
      // 1 high-RPN case in different category
      { id: "P05", problem: "Splice loss high", category: "Quality", sev: 7, occ: 6, det: 5, owner: "E", status: "OPEN", percent: 0, estCost: 10000, actCost: 5000 },
      // 1 low-RPN case (should not count)
      { id: "P06", problem: "Minor labeling issue", category: "Admin", sev: 2, occ: 2, det: 2, owner: "F", status: "OPEN", percent: 0, estCost: 1000, actCost: 500 }
    ],
    registers: { milestones: [] },
    project: { start: "2025-01-01", end: "2026-06-30" }
  };
  var patternResult = B.detectPatterns(clusterState);
  ok(patternResult.patterns.length >= 1, "detectPatterns finds patterns (" + patternResult.patterns.length + ")");
  var clustering = patternResult.patterns.filter(function (p) { return p.type === "category_clustering"; });
  ok(clustering.length >= 1, "detects category_clustering pattern");
  ok(clustering[0].description.indexOf("Civil") >= 0, "clustering pattern references the clustered category");
  ok(clustering[0].severity === "high", "clustering pattern severity is high");
  ok(typeof clustering[0].suggestedAction === "string" && clustering[0].suggestedAction.length > 0, "clustering pattern has suggestedAction");
})();

console.log("\n-- detectPatterns: cost drift --");
(function () {
  // >3 cases in same costCat with actCost > estCost
  var costDriftState = {
    cases: [
      { id: "D01", problem: "Item 1", category: "Civil", costCat: "Labour", sev: 3, occ: 3, det: 3, owner: "A", status: "OPEN", percent: 0.5, estCost: 10000, actCost: 15000 },
      { id: "D02", problem: "Item 2", category: "Civil", costCat: "Labour", sev: 3, occ: 3, det: 3, owner: "B", status: "OPEN", percent: 0.5, estCost: 20000, actCost: 28000 },
      { id: "D03", problem: "Item 3", category: "Civil", costCat: "Labour", sev: 3, occ: 3, det: 3, owner: "C", status: "OPEN", percent: 0.5, estCost: 15000, actCost: 22000 },
      { id: "D04", problem: "Item 4", category: "Civil", costCat: "Labour", sev: 3, occ: 3, det: 3, owner: "D", status: "OPEN", percent: 0.5, estCost: 12000, actCost: 18000 }
    ],
    registers: { milestones: [] },
    project: { start: "2025-01-01", end: "2026-06-30" }
  };
  var patternResult = B.detectPatterns(costDriftState);
  var costDrift = patternResult.patterns.filter(function (p) { return p.type === "cost_drift"; });
  ok(costDrift.length >= 1, "detects cost_drift pattern (" + costDrift.length + " found)");
  ok(costDrift[0].description.indexOf("Labour") >= 0, "cost drift references the correct costCat");
})();

console.log("\n-- recommend: combines findings with lessons --");
(function () {
  // Clear and record a schedule-related lesson
  B._clearLessons();
  var scheduleLesson = B.recordLesson({
    challenge: "Schedule delay due to milestone slippage in civil works",
    resolution: "Add weekly progress checkpoints and fast-track critical path",
    category: "Delivery / Schedule",
    tags: ["schedule", "delay", "milestone"],
    impact: "high",
    projectType: "fibre-telecom"
  });

  // State with schedule + cost findings to trigger recommendations
  var recommendState = {
    cases: [
      { id: "R01", problem: "Trenching delayed", category: "Civil", priority: "1-CRITICAL", sev: 8, occ: 7, det: 6, owner: "Alice", status: "IN PROGRESS", percent: 0.3, startDate: "2025-04-01", costCat: "Civil", estCost: 100000, actCost: 130000 },
      { id: "R02", problem: "Cable delivery late", category: "Materials", priority: "2-HIGH", sev: 7, occ: 5, det: 4, owner: "Bob", status: "IN PROGRESS", percent: 0.2, startDate: "2025-04-01", costCat: "Capex", estCost: 80000, actCost: 95000 }
    ],
    registers: {
      milestones: [
        { milestone: "Civil phase 1", baseline: "M+3", forecast: "M+5", status: "At Risk", owner: "Alice" },
        { milestone: "Cable install", baseline: "M+5", forecast: "M+7", status: "At Risk", owner: "Bob" }
      ]
    },
    project: { start: "2025-01-01", end: "2026-06-30" }
  };

  var recResult = B.recommend(recommendState);
  ok(recResult.recommendations.length >= 2, "recommend generates multiple recommendations (" + recResult.recommendations.length + ")");

  // Check recommendation structure
  var first = recResult.recommendations[0];
  ok(typeof first.priority === "number" && first.priority >= 1 && first.priority <= 5, "recommendation has priority 1-5 (got " + first.priority + ")");
  ok(typeof first.title === "string" && first.title.length > 0, "recommendation has title");
  ok(typeof first.action === "string" && first.action.length > 0, "recommendation has action");
  ok(typeof first.rationale === "string" && first.rationale.length > 0, "recommendation has rationale");
  ok(typeof first.confidence === "number" && first.confidence > 0, "recommendation has confidence score");

  // Check that at least one recommendation references a lesson
  var withLesson = recResult.recommendations.filter(function (r) { return r.relatedLessonId !== null; });
  ok(withLesson.length >= 1, "at least one recommendation references a lesson (found " + withLesson.length + ")");
})();

console.log("\n-- selfImproveCheck --");
(function () {
  var cases = [
    // Resolved + high RPN: should generate pending lesson
    { id: "SI01", problem: "Major cable damage during install", category: "Quality", sev: 9, occ: 5, det: 5, owner: "Alice", status: "RESOLVED", percent: 1.0, estCost: 50000, actCost: 40000 },
    // Blocked + overbudget: should generate pending lesson
    { id: "SI02", problem: "Permit rejection by authority", category: "Regulatory", sev: 8, occ: 6, det: 4, owner: "Bob", status: "BLOCKED", percent: 0.1, estCost: 20000, actCost: 35000 },
    // Open + high RPN: should NOT generate (not resolved/blocked)
    { id: "SI03", problem: "Supply chain risk", category: "Materials", sev: 8, occ: 7, det: 5, owner: "Carol", status: "OPEN", percent: 0, estCost: 30000, actCost: 5000 }
  ];
  var result = B.selfImproveCheck(cases);
  ok(Array.isArray(result.pendingLessons), "selfImproveCheck returns pendingLessons array");
  ok(result.pendingLessons.length === 2, "selfImproveCheck identifies 2 pending lessons (got " + result.pendingLessons.length + ")");
  ok(result.pendingLessons[0].challenge.indexOf("cable damage") >= 0, "first pending lesson references the resolved case");
  ok(result.pendingLessons[1].challenge.indexOf("Permit rejection") >= 0, "second pending lesson references the blocked case");
  ok(result.pendingLessons[1].tags.length >= 2, "pending lesson has tags populated");
})();

console.log("\n-- determinism: analyzeStatus same input -> same output --");
(function () {
  var state = {
    cases: [
      { id: "DT1", problem: "Test item", category: "Process / Flow", priority: "2-HIGH", sev: 6, occ: 5, det: 4, owner: "Alice", status: "IN PROGRESS", percent: 0.5, startDate: "2025-04-01", costCat: "Opex", estCost: 50000, actCost: 55000 }
    ],
    registers: { milestones: [{ milestone: "Phase A", baseline: "M+2", forecast: "M+3", status: "At Risk", owner: "Alice" }] },
    project: { start: "2025-01-01", end: "2026-06-30" }
  };
  var run1 = JSON.stringify(B.analyzeStatus(state));
  var run2 = JSON.stringify(B.analyzeStatus(state));
  var run3 = JSON.stringify(B.analyzeStatus(state));
  ok(run1 === run2, "analyzeStatus deterministic: run1 === run2");
  ok(run2 === run3, "analyzeStatus deterministic: run2 === run3");
})();

// ============================================================================
// Vendor Directory Tests
// ============================================================================

console.log("\n-- vendor directory: data completeness --");
(function () {
  var profile = B._profiles.find(function (p) { return p.id === "fibre-telecom"; });
  var vendors = profile.vendors;
  ok(Array.isArray(vendors), "vendors is an array");
  ok(vendors.length >= 35, "vendors array has >= 35 entries (got " + vendors.length + ")");

  // All vendors have required fields
  var requiredFields = ["id", "company", "hq", "category", "capabilities"];
  var allHaveRequired = vendors.every(function (v) {
    return requiredFields.every(function (f) { return v[f] !== undefined && v[f] !== null; });
  });
  ok(allHaveRequired, "all vendors have required fields (id, company, hq, category, capabilities)");

  // All vendors have full set of fields
  var fullFields = ["id", "company", "hq", "category", "capabilities", "products", "notableProjects", "website", "priceRange", "leadTime", "strengths", "considerations"];
  var allHaveFull = vendors.every(function (v) {
    return fullFields.every(function (f) { return v[f] !== undefined && v[f] !== null; });
  });
  ok(allHaveFull, "all vendors have complete field set (12 fields each)");

  // Check all categories are represented
  var categories = ["turnkey-systems", "cable-manufacturers", "installation-vessels", "survey-engineering", "equipment-components", "landing-stations", "consulting"];
  var presentCats = categories.filter(function (cat) {
    return vendors.some(function (v) { return v.category === cat; });
  });
  ok(presentCats.length === categories.length, "all 7 vendor categories represented (got " + presentCats.length + ")");

  // Unique IDs
  var ids = vendors.map(function (v) { return v.id; });
  var uniqueIds = ids.filter(function (id, i) { return ids.indexOf(id) === i; });
  ok(uniqueIds.length === vendors.length, "all vendor IDs are unique");
})();

console.log("\n-- vendorSearch: by category --");
(function () {
  var turnkey = B.vendorSearch({ category: "turnkey-systems" });
  ok(turnkey.length === 4, "vendorSearch category=turnkey-systems returns 4 vendors (got " + turnkey.length + ")");
  ok(turnkey.every(function (v) { return v.category === "turnkey-systems"; }), "all returned vendors have correct category");

  var cableMfg = B.vendorSearch({ category: "cable-manufacturers" });
  ok(cableMfg.length >= 5 && cableMfg.length <= 10, "vendorSearch category=cable-manufacturers returns telecom-only vendors (got " + cableMfg.length + ")");

  var consulting = B.vendorSearch({ category: "consulting" });
  ok(consulting.length === 5, "vendorSearch category=consulting returns 5 vendors (got " + consulting.length + ")");
})();

console.log("\n-- vendorSearch: by region --");
(function () {
  var asiaVendors = B.vendorSearch({ region: "asia" });
  ok(asiaVendors.length > 0, "vendorSearch region=asia returns vendors (got " + asiaVendors.length + ")");
  ok(asiaVendors.some(function (v) { return v.hq === "Japan"; }), "asia region includes Japanese vendors");
  ok(asiaVendors.some(function (v) { return v.hq === "China"; }), "asia region includes Chinese vendors");

  var europeVendors = B.vendorSearch({ region: "europe" });
  ok(europeVendors.length > 0, "vendorSearch region=europe returns vendors (got " + europeVendors.length + ")");
  ok(europeVendors.some(function (v) { return v.hq === "France"; }), "europe region includes French vendors");
  ok(europeVendors.some(function (v) { return v.hq === "United Kingdom"; }), "europe region includes UK vendors");

  // Direct HQ match
  var japanVendors = B.vendorSearch({ region: "Japan" });
  ok(japanVendors.length >= 3, "vendorSearch region=Japan returns Japanese vendors (got " + japanVendors.length + ")");
})();

console.log("\n-- vendorSearch: by capability --");
(function () {
  var submarineCapable = B.vendorSearch({ capability: "submarine" });
  ok(submarineCapable.length > 10, "vendorSearch capability=submarine returns many vendors (got " + submarineCapable.length + ")");

  var coherent = B.vendorSearch({ capability: "coherent" });
  ok(coherent.length >= 2, "vendorSearch capability=coherent finds optical vendors (got " + coherent.length + ")");
})();

console.log("\n-- vendorSearch: by budgetTier --");
(function () {
  var premium = B.vendorSearch({ budgetTier: "premium" });
  ok(premium.length > 0, "vendorSearch budgetTier=premium returns vendors (got " + premium.length + ")");
  ok(premium.every(function (v) { return v.priceRange === "premium"; }), "all premium results have priceRange=premium");

  var competitive = B.vendorSearch({ budgetTier: "competitive" });
  ok(competitive.length > 0, "vendorSearch budgetTier=competitive returns vendors (got " + competitive.length + ")");
  ok(competitive.every(function (v) { return v.priceRange === "competitive"; }), "all competitive results have priceRange=competitive");
})();

console.log("\n-- vendorSearch: combined criteria --");
(function () {
  var asianCable = B.vendorSearch({ category: "cable-manufacturers", region: "asia" });
  ok(asianCable.length >= 4, "combined search (Asian cable mfg) returns results (got " + asianCable.length + ")");
  ok(asianCable.every(function (v) { return v.category === "cable-manufacturers"; }), "combined results match category");
})();

console.log("\n-- vendorComparison: structured comparison --");
(function () {
  var result = B.vendorComparison(["v-subcom", "v-asn", "v-nec"]);
  ok(result.vendors.length === 3, "vendorComparison returns 3 selected vendors (got " + result.vendors.length + ")");
  ok(typeof result.comparison === "object", "vendorComparison returns comparison object");
  ok(Array.isArray(result.comparison.companies), "comparison has companies array");
  ok(result.comparison.companies.length === 3, "comparison companies has 3 entries");
  ok(result.comparison.companies[0] === "SubCom", "first company is SubCom");
  ok(Array.isArray(result.comparison.priceRanges), "comparison has priceRanges array");
  ok(Array.isArray(result.comparison.leadTimes), "comparison has leadTimes array");
  ok(Array.isArray(result.comparison.strengths), "comparison has strengths array");
  ok(Array.isArray(result.comparison.capabilities), "comparison has capabilities array");
  ok(typeof result.summary === "string" && result.summary.length > 0, "comparison has summary string");
  ok(result.summary.indexOf("SubCom") >= 0, "summary mentions vendor names");

  // Test with invalid IDs
  var empty = B.vendorComparison(["nonexistent-id"]);
  ok(empty.vendors.length === 0, "vendorComparison with invalid IDs returns empty (got " + empty.vendors.length + ")");

  // Test partial match
  var partial = B.vendorComparison(["v-subcom", "nonexistent"]);
  ok(partial.vendors.length === 1, "vendorComparison with one valid ID returns 1 vendor");
})();

// ============================================================================
// Country Database Tests
// ============================================================================

console.log("\n-- country database: all 8 countries present --");
(function () {
  var profile = B._profiles.find(function (p) { return p.id === "fibre-telecom"; });
  var db = profile.COUNTRY_DATABASE;
  ok(Array.isArray(db), "COUNTRY_DATABASE is an array");
  ok(db.length === 8, "COUNTRY_DATABASE has exactly 8 countries (got " + db.length + ")");

  var expectedCodes = ["ID", "TH", "VN", "TW", "PH", "GU", "MY", "BN"];
  var actualCodes = db.map(function (c) { return c.code; });
  ok(expectedCodes.every(function (code) { return actualCodes.indexOf(code) >= 0; }), "all 8 expected country codes present: " + actualCodes.join(", "));

  var expectedNames = ["Indonesia", "Thailand", "Vietnam", "Taiwan", "Philippines", "Guam", "Malaysia", "Brunei"];
  var actualNames = db.map(function (c) { return c.name; });
  ok(expectedNames.every(function (name) { return actualNames.indexOf(name) >= 0; }), "all 8 country names present");
})();

console.log("\n-- country database: data completeness per country --");
(function () {
  var profile = B._profiles.find(function (p) { return p.id === "fibre-telecom"; });
  var db = profile.COUNTRY_DATABASE;

  var allComplete = db.every(function (c) {
    return c.code && c.name && Array.isArray(c.aliases) && c.aliases.length > 0 &&
      typeof c.regulatoryAuthorities === "object" &&
      c.regulatoryAuthorities.telecom && c.regulatoryAuthorities.maritime &&
      c.regulatoryAuthorities.environment && c.regulatoryAuthorities.investment &&
      Array.isArray(c.geopoliticalChallenges) && c.geopoliticalChallenges.length >= 3 &&
      Array.isArray(c.geographicalChallenges) && c.geographicalChallenges.length >= 3 &&
      typeof c.keyContacts === "object" &&
      c.keyContacts.feasibility && c.keyContacts.permitting &&
      c.keyContacts.construction && c.keyContacts.operations;
  });
  ok(allComplete, "every country has code, name, aliases, regulatoryAuthorities (telecom/maritime/environment/investment), geopolitical+geographical challenges (3+), keyContacts (4 phases)");

  // Check authority field structure
  var allAuthoritiesComplete = db.every(function (c) {
    var auths = c.regulatoryAuthorities;
    var keys = ["telecom", "maritime", "environment", "investment"];
    return keys.every(function (k) {
      return auths[k] && auths[k].name && auths[k].fullName && auths[k].jurisdiction;
    });
  });
  ok(allAuthoritiesComplete, "every authority entry has name, fullName, and jurisdiction");
})();

console.log("\n-- country database: specific authority verification --");
(function () {
  var profile = B._profiles.find(function (p) { return p.id === "fibre-telecom"; });
  var db = profile.COUNTRY_DATABASE;
  var findCountry = function (code) { return db.find(function (c) { return c.code === code; }); };

  // Indonesia
  var id = findCountry("ID");
  ok(id.regulatoryAuthorities.telecom.name.indexOf("Kominfo") >= 0 || id.regulatoryAuthorities.telecom.name.indexOf("BAKTI") >= 0, "Indonesia telecom: Kominfo/BAKTI");
  ok(id.regulatoryAuthorities.maritime.name === "DJPL", "Indonesia maritime: DJPL");
  ok(id.regulatoryAuthorities.environment.name === "KLHK", "Indonesia environment: KLHK");
  ok(id.regulatoryAuthorities.investment.name.indexOf("BKPM") >= 0 || id.regulatoryAuthorities.investment.name.indexOf("OSS") >= 0, "Indonesia investment: BKPM/OSS");

  // Thailand
  var th = findCountry("TH");
  ok(th.regulatoryAuthorities.telecom.name === "NBTC", "Thailand telecom: NBTC");
  ok(th.regulatoryAuthorities.maritime.name === "Marine Department", "Thailand maritime: Marine Department");
  ok(th.regulatoryAuthorities.environment.name === "ONEP", "Thailand environment: ONEP");
  ok(th.regulatoryAuthorities.investment.name === "BOI", "Thailand investment: BOI");

  // Vietnam
  var vn = findCountry("VN");
  ok(vn.regulatoryAuthorities.telecom.name === "MIC", "Vietnam telecom: MIC");
  ok(vn.regulatoryAuthorities.maritime.name === "Vinamarine", "Vietnam maritime: Vinamarine");

  // Taiwan
  var tw = findCountry("TW");
  ok(tw.regulatoryAuthorities.telecom.name === "NCC", "Taiwan telecom: NCC");

  // Philippines
  var ph = findCountry("PH");
  ok(ph.regulatoryAuthorities.telecom.name === "NTC", "Philippines telecom: NTC");
  ok(ph.regulatoryAuthorities.maritime.name === "MARINA", "Philippines maritime: MARINA");

  // Guam
  var gu = findCountry("GU");
  ok(gu.regulatoryAuthorities.telecom.name === "FCC", "Guam telecom: FCC");
  ok(gu.regulatoryAuthorities.maritime.name === "USACE", "Guam maritime: USACE");

  // Malaysia
  var my = findCountry("MY");
  ok(my.regulatoryAuthorities.telecom.name === "MCMC", "Malaysia telecom: MCMC");

  // Brunei
  var bn = findCountry("BN");
  ok(bn.regulatoryAuthorities.telecom.name === "AITI", "Brunei telecom: AITI");
  ok(bn.regulatoryAuthorities.investment.name === "BEDB", "Brunei investment: BEDB");
})();

console.log("\n-- country detection in analyzeProject --");
(function () {
  var brief = "Submarine fibre cable deployment connecting Indonesia, Thailand, and Vietnam. " +
    "Route passes through Jakarta to Bangkok via 3000 km undersea cable. " +
    "GPON termination at 20 sites passing 50000 homes over 24 months.";

  var result = B.analyzeProject(brief);

  // Check that country arrays are present in output
  ok(Array.isArray(result.regulatoryAuthorities), "analyzeProject output includes regulatoryAuthorities array");
  ok(Array.isArray(result.countryRisks), "analyzeProject output includes countryRisks array");
  ok(Array.isArray(result.countryTasks), "analyzeProject output includes countryTasks array");

  // Should detect Indonesia, Thailand, and Vietnam
  ok(result.regulatoryAuthorities.length === 3, "detects 3 countries in brief (got " + result.regulatoryAuthorities.length + ")");
  var countryCodes = result.regulatoryAuthorities.map(function (r) { return r.code; });
  ok(countryCodes.indexOf("ID") >= 0, "detects Indonesia (ID)");
  ok(countryCodes.indexOf("TH") >= 0, "detects Thailand (TH)");
  ok(countryCodes.indexOf("VN") >= 0, "detects Vietnam (VN)");

  // Verify structure of regulatory authorities output
  var idAuth = result.regulatoryAuthorities.find(function (r) { return r.code === "ID"; });
  ok(idAuth.country === "Indonesia", "regulatory entry has country name");
  ok(idAuth.authorities.telecom.name.indexOf("Kominfo") >= 0, "regulatory entry includes telecom authority");
  ok(idAuth.authorities.maritime.name === "DJPL", "regulatory entry includes maritime authority");

  // Verify country risks output
  var idRisks = result.countryRisks.find(function (r) { return r.code === "ID"; });
  ok(Array.isArray(idRisks.geopolitical) && idRisks.geopolitical.length >= 3, "countryRisks includes geopolitical challenges");
  ok(Array.isArray(idRisks.geographical) && idRisks.geographical.length >= 3, "countryRisks includes geographical challenges");

  // Verify country tasks output
  var idTasks = result.countryTasks.find(function (r) { return r.code === "ID"; });
  ok(typeof idTasks.keyContacts === "object", "countryTasks includes keyContacts");
  ok(Array.isArray(idTasks.keyContacts.feasibility), "keyContacts has feasibility phase");
  ok(Array.isArray(idTasks.keyContacts.permitting), "keyContacts has permitting phase");
  ok(Array.isArray(idTasks.keyContacts.construction), "keyContacts has construction phase");
  ok(Array.isArray(idTasks.keyContacts.operations), "keyContacts has operations phase");
})();

console.log("\n-- country detection: alias matching --");
(function () {
  // Test alias detection (city names, etc.)
  var brief = "Fibre optic cable landing at Manila and Kaohsiung connecting to Apra Harbor. " +
    "OTDR testing at 5 sites, 10 km submarine cable route.";
  var result = B.analyzeProject(brief);
  var codes = result.regulatoryAuthorities.map(function (r) { return r.code; });
  ok(codes.indexOf("PH") >= 0, "detects Philippines via alias 'manila'");
  ok(codes.indexOf("TW") >= 0, "detects Taiwan via alias 'kaohsiung'");
  ok(codes.indexOf("GU") >= 0, "detects Guam via alias 'apra harbor'");
})();

console.log("\n-- country detection: no countries in generic text --");
(function () {
  var brief = "Fibre optic deployment project, OTDR testing, splicing, 100 km route.";
  var result = B.analyzeProject(brief);
  ok(result.regulatoryAuthorities.length === 0, "no countries detected in generic text (got " + result.regulatoryAuthorities.length + ")");
  ok(result.countryRisks.length === 0, "countryRisks empty for generic text");
  ok(result.countryTasks.length === 0, "countryTasks empty for generic text");
})();

console.log("\n-- getCountryInfo: by code --");
(function () {
  var info = B.getCountryInfo("ID");
  ok(info !== null, "getCountryInfo('ID') returns data");
  ok(info.name === "Indonesia", "getCountryInfo('ID') returns Indonesia");
  ok(info.regulatoryAuthorities.telecom.name.indexOf("Kominfo") >= 0, "getCountryInfo returns regulatory authorities");
  ok(info.geopoliticalChallenges.length >= 3, "getCountryInfo returns geopolitical challenges");
  ok(info.geographicalChallenges.length >= 3, "getCountryInfo returns geographical challenges");
  ok(info.keyContacts.feasibility.length >= 2, "getCountryInfo returns key contacts");

  // Test all 8 codes return valid data
  var allCodes = ["ID", "TH", "VN", "TW", "PH", "GU", "MY", "BN"];
  var allFound = allCodes.every(function (code) { return B.getCountryInfo(code) !== null; });
  ok(allFound, "getCountryInfo returns data for all 8 country codes");
})();

console.log("\n-- getCountryInfo: by name and alias --");
(function () {
  var byName = B.getCountryInfo("Indonesia");
  ok(byName !== null && byName.code === "ID", "getCountryInfo by name 'Indonesia' works");

  var byAlias = B.getCountryInfo("bangkok");
  ok(byAlias !== null && byAlias.code === "TH", "getCountryInfo by alias 'bangkok' returns Thailand");

  var notFound = B.getCountryInfo("Antarctica");
  ok(notFound === null, "getCountryInfo returns null for unknown country");

  var lowerCase = B.getCountryInfo("my");
  ok(lowerCase !== null && lowerCase.name === "Malaysia", "getCountryInfo handles lowercase code 'my'");
})();

console.log("\n-- getCountryInfo: data integrity spot check --");
(function () {
  // Verify specific real-world data across different countries
  var tw = B.getCountryInfo("TW");
  ok(tw.regulatoryAuthorities.maritime.name.indexOf("Maritime and Port Bureau") >= 0, "Taiwan maritime authority correct");
  ok(tw.geopoliticalChallenges.some(function (c) { return c.indexOf("Cross-strait") >= 0; }), "Taiwan has cross-strait challenge");

  var gu = B.getCountryInfo("GU");
  ok(gu.regulatoryAuthorities.environment.name.indexOf("EPA") >= 0, "Guam environment authority includes EPA");
  ok(gu.geopoliticalChallenges.some(function (c) { return c.indexOf("military") >= 0 || c.indexOf("DoD") >= 0 || c.indexOf("Military") >= 0; }), "Guam mentions military restrictions");

  var bn = B.getCountryInfo("BN");
  ok(bn.geopoliticalChallenges.some(function (c) { return c.indexOf("Islamic") >= 0 || c.indexOf("Sharia") >= 0; }), "Brunei mentions Islamic law considerations");
  ok(bn.geographicalChallenges.some(function (c) { return c.indexOf("shallow") >= 0 || c.indexOf("Shallow") >= 0; }), "Brunei mentions shallow bay");
})();

// ============================================================================
// Submarine Cable Detection Tests
// ============================================================================

console.log("\n-- submarine detection: keyword triggers isSubmarine --");
(function () {
  var subBrief = "Submarine fibre optic cable system connecting 8 Asian countries. " +
    "Undersea route of 5000 km across the seabed with repeaters every 80 km. " +
    "Shore end landings at each country with cable ship installation. " +
    "Branching units for multi-landing topology. 36 months duration.";

  var result = B.analyzeProject(subBrief);
  ok(result.summary.isSubmarine === true, "submarine keywords trigger isSubmarine=true (got " + result.summary.isSubmarine + ")");
  ok(result.summary.domain === "fibre-telecom", "submarine project still picks fibre-telecom domain");
  ok(result.summary.scale.routeKm === 5000, "parses 5000 km route for submarine project");
})();

console.log("\n-- submarine detection: terrestrial brief stays non-submarine --");
(function () {
  // The existing fibreBrief has trenching and HDD - should NOT be submarine
  var result = B.analyzeProject(fibreBrief);
  ok(result.summary.isSubmarine === false, "terrestrial brief with trenching/HDD is NOT submarine (got " + result.summary.isSubmarine + ")");
})();

console.log("\n-- submarine phases: correct phase names --");
(function () {
  var subBrief = "Submarine undersea cable system 3000 km with landing stations, " +
    "repeater placement, cable ship deployment, seabed burial. " +
    "Shore end at each country. 8 sites, 24 months.";

  var result = B.analyzeProject(subBrief);
  ok(result.summary.isSubmarine === true, "submarine mode detected for phase test");

  var phaseNames = result.phases.map(function (p) { return p.name; });
  ok(phaseNames.indexOf("Marine Installation") >= 0, "submarine plan has Marine Installation phase");
  ok(phaseNames.indexOf("Shore-End & Landing") >= 0, "submarine plan has Shore-End & Landing phase");
  ok(phaseNames.indexOf("Route Survey & Desktop Study") >= 0, "submarine plan has Route Survey phase");
  ok(phaseNames.indexOf("System Commissioning") >= 0, "submarine plan has System Commissioning phase");
  ok(phaseNames.indexOf("Cable Manufacturing & Factory Testing") >= 0, "submarine plan has Cable Manufacturing phase");
  ok(result.phases.length === 10, "submarine plan has 10 phases (got " + result.phases.length + ")");
})();

console.log("\n-- submarine phases: NO terrestrial phases --");
(function () {
  var subBrief = "Submarine undersea cable with repeaters, seabed survey, cable ship, " +
    "landing station, branching unit, 2000 km ocean route. 5 sites.";

  var result = B.analyzeProject(subBrief);
  ok(result.summary.isSubmarine === true, "submarine mode detected for exclusion test");

  var allProblems = result.cases.map(function (c) { return c.problem; }).join(" ");
  ok(allProblems.indexOf("Trenching, ducting, and HDD along planned route") < 0, "submarine plan does NOT have terrestrial trenching task");
  ok(allProblems.indexOf("Micro-trenching in urban") < 0, "submarine plan does NOT have micro-trenching task");
  ok(allProblems.indexOf("Road/pavement reinstatement") < 0, "submarine plan does NOT have road reinstatement");
  ok(allProblems.indexOf("Fibre cable blowing/pulling") < 0, "submarine plan does NOT have cable blowing task");
})();

console.log("\n-- submarine costs: higher per km than terrestrial --");
(function () {
  var subBrief = "Submarine undersea cable system with repeaters, cable ship, seabed, " +
    "landing station, branching unit, 1000 km ocean route. 8 sites.";
  var terrBrief = "FTTH fibre optic trenching HDD duct network, 1000 km route, 8 sites, 10000 homes passed.";

  var subResult = B.analyzeProject(subBrief);
  var terrResult = B.analyzeProject(terrBrief);

  ok(subResult.summary.isSubmarine === true, "submarine mode for cost comparison");
  ok(terrResult.summary.isSubmarine === false, "terrestrial mode for cost comparison");

  ok(subResult.budget.total > terrResult.budget.total, "submarine budget total (" + subResult.budget.total + ") > terrestrial budget total (" + terrResult.budget.total + ")");

  // Check procurement values are significantly higher
  var subProcTotal = subResult.procurement.reduce(function (s, p) { return s + (p.value || 0); }, 0);
  var terrProcTotal = terrResult.procurement.reduce(function (s, p) { return s + (p.value || 0); }, 0);
  ok(subProcTotal > terrProcTotal * 3, "submarine procurement (" + subProcTotal + ") is significantly higher than terrestrial (" + terrProcTotal + ")");
})();

console.log("\n-- submarine risks: mentions cable ship and anchor damage --");
(function () {
  var subBrief = "Submarine undersea cable system, 2000 km seabed route, " +
    "repeater every 80 km, cable ship, landing station, branching unit, ocean.";

  var result = B.analyzeProject(subBrief);
  ok(result.summary.isSubmarine === true, "submarine mode for risk test");

  var riskTexts = result.risks.map(function (r) { return r.problem; }).join(" ");
  ok(riskTexts.indexOf("Cable ship") >= 0 || riskTexts.indexOf("cable ship") >= 0, "submarine risks mention cable ship");
  ok(riskTexts.indexOf("Anchor damage") >= 0 || riskTexts.indexOf("anchor damage") >= 0 || riskTexts.indexOf("Anchor") >= 0, "submarine risks mention anchor damage");
  ok(riskTexts.indexOf("weather") >= 0 || riskTexts.indexOf("Weather") >= 0, "submarine risks mention weather");
  ok(riskTexts.indexOf("Fishing") >= 0 || riskTexts.indexOf("fishing") >= 0 || riskTexts.indexOf("trawler") >= 0, "submarine risks mention fishing/trawler");
  ok(result.risks.length === 10, "submarine plan has 10 risks (got " + result.risks.length + ")");
})();

console.log("\n-- submarine procurement: submarine-specific items --");
(function () {
  var subBrief = "Submarine undersea cable, seabed route 1500 km, cable ship installation, " +
    "landing station, branching unit, repeater, ocean deployment. 6 sites.";

  var result = B.analyzeProject(subBrief);
  ok(result.summary.isSubmarine === true, "submarine mode for procurement test");

  var packages = result.procurement.map(function (p) { return p.package; }).join(" | ");
  ok(packages.indexOf("Submarine cable") >= 0, "submarine procurement includes submarine cable");
  ok(packages.indexOf("repeaters") >= 0 || packages.indexOf("Repeaters") >= 0 || packages.indexOf("amplifiers") >= 0, "submarine procurement includes repeaters/amplifiers");
  ok(packages.indexOf("SLTE") >= 0, "submarine procurement includes SLTE");
  ok(packages.indexOf("Cable ship") >= 0 || packages.indexOf("cable ship") >= 0, "submarine procurement includes cable ship charter");
  ok(packages.indexOf("Shore-end") >= 0 || packages.indexOf("shore-end") >= 0, "submarine procurement includes shore-end cable");
  ok(packages.indexOf("Spare cable") >= 0 || packages.indexOf("spare cable") >= 0, "submarine procurement includes spare cable depot");
  ok(result.procurement.length === 10, "submarine plan has 10 procurement items (got " + result.procurement.length + ")");
})();

console.log("\n-- submarine: generic profile unaffected --");
(function () {
  var generic = B.analyzeProject("We want to reorganise the office filing system.");
  ok(generic.summary.isSubmarine === false, "generic project has isSubmarine=false (got " + generic.summary.isSubmarine + ")");
})();

// ============================================================
// checkAlerts tests
// ============================================================
console.log("\n-- checkAlerts: basic structure --");
(function () {
  var result = B.checkAlerts({ cases: [], registers: {}, project: {} });
  ok(result && Array.isArray(result.alerts), "checkAlerts returns object with alerts array");
  ok(result.summary && typeof result.summary.critical === "number", "checkAlerts returns summary with critical count");
  ok(typeof result.summary.warning === "number", "checkAlerts returns summary with warning count");
  ok(typeof result.summary.info === "number", "checkAlerts returns summary with info count");
  ok(result.alerts.length === 0, "empty project has no alerts");
})();

console.log("\n-- checkAlerts: overdue milestones --");
(function () {
  var state = {
    cases: [],
    registers: { milestones: [
      { milestone: "Phase 1", baseline: "2024-01-15", forecast: "2024-03-20" },
      { milestone: "Phase 2", baseline: "2024-06-01", forecast: "2024-05-01" }
    ]},
    project: {}
  };
  var result = B.checkAlerts(state);
  var schedAlerts = result.alerts.filter(function (a) { return a.category === "schedule" && a.title === "Overdue milestone"; });
  ok(schedAlerts.length === 1, "overdue milestone detected (forecast > baseline) (got " + schedAlerts.length + ")");
  ok(schedAlerts[0].severity === "warning", "overdue milestone severity is warning");
  ok(/Phase 1/.test(schedAlerts[0].detail), "overdue milestone detail mentions the milestone name");
})();

console.log("\n-- checkAlerts: overbudget cases --");
(function () {
  var state = {
    cases: [
      { problem: "Budget ok case", estCost: 1000, actCost: 1100, status: "OPEN", sev: 3, occ: 3, det: 3 },
      { problem: "Overbudget case", estCost: 1000, actCost: 1300, status: "OPEN", sev: 3, occ: 3, det: 3 }
    ],
    registers: {},
    project: {}
  };
  var result = B.checkAlerts(state);
  var costAlerts = result.alerts.filter(function (a) { return a.category === "cost" && a.title === "Case overbudget"; });
  ok(costAlerts.length === 1, "overbudget case detected (actCost > estCost * 1.2) (got " + costAlerts.length + ")");
  ok(costAlerts[0].severity === "warning", "overbudget case severity is warning");
  ok(/Overbudget case/.test(costAlerts[0].detail), "overbudget alert detail mentions the case");
})();

console.log("\n-- checkAlerts: blocked case >14 days --");
(function () {
  var oldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  var state = {
    cases: [
      { problem: "Long blocked case", status: "BLOCKED", startDate: oldDate, sev: 3, occ: 3, det: 3, estCost: 0, actCost: 0 }
    ],
    registers: {},
    project: {}
  };
  var result = B.checkAlerts(state);
  var blockedAlerts = result.alerts.filter(function (a) { return a.category === "blocked"; });
  ok(blockedAlerts.length === 1, "blocked case alert detected (got " + blockedAlerts.length + ")");
  ok(blockedAlerts[0].severity === "critical", "blocked case severity is critical");
  ok(/Long blocked case/.test(blockedAlerts[0].detail), "blocked alert detail mentions the case");
})();

console.log("\n-- checkAlerts: high-RPN risk still open --");
(function () {
  var state = {
    cases: [
      { problem: "Risky item", status: "OPEN", sev: 8, occ: 7, det: 5, estCost: 0, actCost: 0 }
    ],
    registers: {},
    project: {}
  };
  var result = B.checkAlerts(state);
  var riskAlerts = result.alerts.filter(function (a) { return a.category === "risk"; });
  ok(riskAlerts.length === 1, "high-RPN risk alert detected (RPN=280) (got " + riskAlerts.length + ")");
  ok(riskAlerts[0].severity === "warning", "high-RPN alert severity is warning");
  ok(/280/.test(riskAlerts[0].detail), "high-RPN alert detail mentions RPN value");
})();

console.log("\n-- checkAlerts: CPI below threshold --");
(function () {
  // Cases where earned is low compared to spent
  var state = {
    cases: [
      { problem: "Work A", estCost: 10000, actCost: 15000, percent: 0.5, status: "IN PROGRESS", sev: 3, occ: 3, det: 3 }
    ],
    registers: {},
    project: {}
  };
  // CPI = EV / AC = (10000 * 0.5) / 15000 = 5000/15000 = 0.333
  var result = B.checkAlerts(state);
  var cpiAlerts = result.alerts.filter(function (a) { return a.title === "CPI below threshold"; });
  ok(cpiAlerts.length === 1, "CPI alert detected when CPI < 0.9 (got " + cpiAlerts.length + ")");
  ok(cpiAlerts[0].severity === "critical", "CPI alert severity is critical");
})();

console.log("\n-- checkAlerts: config customization --");
(function () {
  var state = {
    cases: [
      { problem: "Slightly over", estCost: 1000, actCost: 1100, status: "OPEN", sev: 3, occ: 3, det: 3 }
    ],
    registers: {},
    project: {}
  };
  // Default factor 1.2: 1100 < 1200, no alert
  var r1 = B.checkAlerts(state);
  var costA1 = r1.alerts.filter(function (a) { return a.category === "cost" && a.title === "Case overbudget"; });
  ok(costA1.length === 0, "no overbudget alert with default 1.2 factor");

  // Custom factor 1.05: 1100 > 1050, alert triggered
  var r2 = B.checkAlerts(state, { overbudgetFactor: 1.05 });
  var costA2 = r2.alerts.filter(function (a) { return a.category === "cost" && a.title === "Case overbudget"; });
  ok(costA2.length === 1, "overbudget alert triggered with custom 1.05 factor");
})();

console.log("\n-- checkAlerts: alert object structure --");
(function () {
  var oldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  var state = {
    cases: [
      { id: "case-123", problem: "Blocked thing", status: "BLOCKED", startDate: oldDate, sev: 3, occ: 3, det: 3, estCost: 0, actCost: 0 }
    ],
    registers: {},
    project: {}
  };
  var result = B.checkAlerts(state);
  var alert = result.alerts.find(function (a) { return a.category === "blocked"; });
  ok(alert && typeof alert.id === "string" && alert.id.length > 0, "alert has an id");
  ok(alert.severity === "critical" || alert.severity === "warning" || alert.severity === "info", "alert has valid severity");
  ok(typeof alert.category === "string", "alert has category");
  ok(typeof alert.title === "string", "alert has title");
  ok(typeof alert.detail === "string", "alert has detail");
  ok(typeof alert.timestamp === "string" && alert.timestamp.length > 0, "alert has timestamp");
  ok(alert.affectedId === "case-123", "alert affectedId matches case id");
})();

console.log(fails === 0 ? "\nALL BRAIN TESTS PASSED" : "\n" + fails + " FAILURES");
process.exit(fails ? 1 : 0);
