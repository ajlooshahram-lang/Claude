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

console.log("\n-- contract templates: structure and completeness --");
(function () {
  var templates = B.getContractTemplates();
  ok(templates.length >= 15, "CONTRACT_TEMPLATES has >= 15 entries (got " + templates.length + ")");

  // Check required fields on every template
  var requiredFields = ["id", "name", "contractForm", "clause", "purpose", "whenToUse", "timeLimitDays", "requiredContent", "sampleSubject"];
  var allValid = templates.every(function (t) {
    return requiredFields.every(function (f) {
      return f in t;
    });
  });
  ok(allValid, "every template has all required fields: " + requiredFields.join(", "));

  // Check contractForm values are valid
  var validForms = ["NEC4", "FIDIC", "BOTH"];
  var allFormsValid = templates.every(function (t) {
    return validForms.indexOf(t.contractForm) >= 0;
  });
  ok(allFormsValid, "every template has valid contractForm (NEC4, FIDIC, or BOTH)");

  // Check requiredContent is array with at least one entry
  var allContentArrays = templates.every(function (t) {
    return Array.isArray(t.requiredContent) && t.requiredContent.length > 0;
  });
  ok(allContentArrays, "every template requiredContent is a non-empty array");

  // Check IDs are unique
  var ids = templates.map(function (t) { return t.id; });
  var uniqueIds = ids.filter(function (id, i) { return ids.indexOf(id) === i; });
  ok(uniqueIds.length === ids.length, "all template IDs are unique");
})();

console.log("\n-- contract templates: filter by contractForm --");
(function () {
  var nec4Only = B.getContractTemplates({ contractForm: "NEC4" });
  ok(nec4Only.length >= 4, "NEC4 filter returns >= 4 templates (got " + nec4Only.length + ")");
  ok(nec4Only.every(function (t) { return t.contractForm === "NEC4" || t.contractForm === "BOTH"; }), "NEC4 filter includes NEC4 and BOTH templates");

  var fidicOnly = B.getContractTemplates({ contractForm: "FIDIC" });
  ok(fidicOnly.length >= 3, "FIDIC filter returns >= 3 templates (got " + fidicOnly.length + ")");
  ok(fidicOnly.every(function (t) { return t.contractForm === "FIDIC" || t.contractForm === "BOTH"; }), "FIDIC filter includes FIDIC and BOTH templates");

  var bothOnly = B.getContractTemplates({ contractForm: "BOTH" });
  ok(bothOnly.length >= 5, "BOTH filter returns all templates (got " + bothOnly.length + ")");
})();

console.log("\n-- contract templates: filter by keyword --");
(function () {
  var weatherResults = B.getContractTemplates({ keyword: "weather" });
  ok(weatherResults.length >= 1, "keyword 'weather' returns at least 1 template (got " + weatherResults.length + ")");
  ok(weatherResults.some(function (t) { return t.name === "Weather event notification"; }), "weather keyword finds Weather event notification template");

  var paymentResults = B.getContractTemplates({ keyword: "payment" });
  ok(paymentResults.length >= 1, "keyword 'payment' returns at least 1 template (got " + paymentResults.length + ")");

  var cableShipResults = B.getContractTemplates({ keyword: "cable ship" });
  ok(cableShipResults.length >= 1, "keyword 'cable ship' returns at least 1 template (got " + cableShipResults.length + ")");

  // Combined filter: contractForm + keyword
  var nec4Weather = B.getContractTemplates({ contractForm: "NEC4", keyword: "weather" });
  ok(nec4Weather.length >= 1, "combined NEC4 + weather keyword returns results (got " + nec4Weather.length + ")");
})();

console.log("\n-- clause reference: NEC4 clauses --");
(function () {
  var clause15 = B.getClauseReference("NEC4-15");
  ok(clause15 !== null, "getClauseReference('NEC4-15') returns a result");
  ok(clause15.number === "15", "NEC4-15 has number '15'");
  ok(clause15.title === "Early warnings", "NEC4-15 title is 'Early warnings'");
  ok(typeof clause15.summary === "string" && clause15.summary.length > 10, "NEC4-15 has a summary");
  ok(typeof clause15.submarineRelevance === "string" && clause15.submarineRelevance.length > 10, "NEC4-15 has submarineRelevance");

  var clause60 = B.getClauseReference("NEC4-60");
  ok(clause60 !== null && clause60.title === "Compensation events", "NEC4-60 is 'Compensation events'");

  var clause84 = B.getClauseReference("NEC4-84");
  ok(clause84 !== null && clause84.title === "Insurance", "NEC4-84 is 'Insurance'");
})();

console.log("\n-- clause reference: FIDIC clauses --");
(function () {
  var clause4 = B.getClauseReference("FIDIC-4");
  ok(clause4 !== null, "getClauseReference('FIDIC-4') returns a result");
  ok(clause4.number === "4", "FIDIC-4 has number '4'");
  ok(clause4.title === "The Contractor", "FIDIC-4 title is 'The Contractor'");
  ok(typeof clause4.submarineRelevance === "string" && clause4.submarineRelevance.length > 10, "FIDIC-4 has submarineRelevance");

  var clause19 = B.getClauseReference("FIDIC-19");
  ok(clause19 !== null && clause19.title === "Force Majeure", "FIDIC-19 is 'Force Majeure'");

  var clause20 = B.getClauseReference("FIDIC-20");
  ok(clause20 !== null && clause20.title === "Claims, Disputes and Arbitration", "FIDIC-20 is 'Claims, Disputes and Arbitration'");
})();

console.log("\n-- clause reference: lookup by number only --");
(function () {
  // Should find NEC4-15 when searching just "15"
  var result = B.getClauseReference("15");
  ok(result !== null, "getClauseReference('15') finds NEC4-15 by number match");
  ok(result.title === "Early warnings", "number-only lookup finds correct clause");

  // Non-existent clause returns null
  var noResult = B.getClauseReference("99");
  ok(noResult === null, "getClauseReference('99') returns null for non-existent clause");

  // Null input returns null
  var nullResult = B.getClauseReference(null);
  ok(nullResult === null, "getClauseReference(null) returns null");
})();

// =========================================================================
// MONTE CARLO RISK QUANTIFICATION ENGINE TESTS
// =========================================================================

console.log("\n-- monteCarloSchedule: basic sequential tasks --");
(function () {
  var tasks = [
    { id: "t1", name: "Design", optimistic: 5, mostLikely: 10, pessimistic: 20, dependencies: [] },
    { id: "t2", name: "Build", optimistic: 10, mostLikely: 15, pessimistic: 30, dependencies: ["t1"] },
    { id: "t3", name: "Test", optimistic: 3, mostLikely: 7, pessimistic: 14, dependencies: ["t2"] }
  ];
  var result = B.monteCarloSchedule(tasks, 2000, { seed: 42 });
  ok(result.p50 > 0, "monteCarloSchedule p50 is positive (" + result.p50 + ")");
  ok(result.p80 > result.p50, "monteCarloSchedule p80 > p50 (" + result.p80 + " > " + result.p50 + ")");
  ok(result.p90 > result.p80, "monteCarloSchedule p90 > p80 (" + result.p90 + " > " + result.p80 + ")");
  ok(result.mean > 0, "monteCarloSchedule mean is positive (" + result.mean + ")");
  ok(result.stdDev > 0, "monteCarloSchedule stdDev is positive (" + result.stdDev + ")");
  ok(result.histogram.length > 0, "monteCarloSchedule produces histogram with buckets (" + result.histogram.length + ")");
  ok(result.criticalPathFrequency.length === 3, "criticalPathFrequency has 3 entries");
  // All tasks should be on critical path since they are sequential
  var allOnCP = result.criticalPathFrequency.every(function (f) { return f.frequency > 0.9; });
  ok(allOnCP, "all sequential tasks on critical path (frequency > 0.9)");
  // p50 should be near sum of most-likely values (10+15+7=32)
  ok(result.p50 > 25 && result.p50 < 45, "p50 near sum of most-likely (" + result.p50 + " between 25 and 45)");
})();

console.log("\n-- monteCarloSchedule: parallel tasks --");
(function () {
  var tasks = [
    { id: "t1", name: "Start", optimistic: 2, mostLikely: 3, pessimistic: 5, dependencies: [] },
    { id: "t2", name: "Path A", optimistic: 10, mostLikely: 15, pessimistic: 25, dependencies: ["t1"] },
    { id: "t3", name: "Path B", optimistic: 8, mostLikely: 12, pessimistic: 20, dependencies: ["t1"] },
    { id: "t4", name: "End", optimistic: 2, mostLikely: 3, pessimistic: 5, dependencies: ["t2", "t3"] }
  ];
  var result = B.monteCarloSchedule(tasks, 1000, { seed: 123 });
  // t2 is longer so should dominate critical path
  var t2Freq = result.criticalPathFrequency.find(function (f) { return f.taskId === "t2"; });
  var t3Freq = result.criticalPathFrequency.find(function (f) { return f.taskId === "t3"; });
  ok(t2Freq && t2Freq.frequency > t3Freq.frequency, "longer path (t2) more often critical than shorter (t3)");
  ok(result.p50 > 15, "parallel paths: p50 reflects longest path (" + result.p50 + ")");
})();

console.log("\n-- monteCarloSchedule: determinism with seed --");
(function () {
  var tasks = [
    { id: "a", name: "Task A", optimistic: 5, mostLikely: 10, pessimistic: 20, dependencies: [] },
    { id: "b", name: "Task B", optimistic: 8, mostLikely: 12, pessimistic: 18, dependencies: ["a"] }
  ];
  var r1 = B.monteCarloSchedule(tasks, 500, { seed: 999 });
  var r2 = B.monteCarloSchedule(tasks, 500, { seed: 999 });
  ok(r1.p50 === r2.p50, "determinism: same seed produces same p50 (" + r1.p50 + " === " + r2.p50 + ")");
  ok(r1.p80 === r2.p80, "determinism: same seed produces same p80");
  ok(r1.p90 === r2.p90, "determinism: same seed produces same p90");
  ok(r1.mean === r2.mean, "determinism: same seed produces same mean");
  ok(r1.stdDev === r2.stdDev, "determinism: same seed produces same stdDev");
})();

console.log("\n-- monteCarloSchedule: empty input --");
(function () {
  var result = B.monteCarloSchedule([], 100);
  ok(result.p50 === 0, "empty tasks returns p50=0");
  ok(result.histogram.length === 0, "empty tasks returns empty histogram");
  ok(result.criticalPathFrequency.length === 0, "empty tasks returns empty criticalPathFrequency");
})();

console.log("\n-- monteCarloCost: 5 items distribution --");
(function () {
  var items = [
    { id: "c1", name: "Civil works", low: 80000, likely: 100000, high: 150000, distribution: "triangular" },
    { id: "c2", name: "Cable", low: 40000, likely: 50000, high: 70000, distribution: "triangular" },
    { id: "c3", name: "Equipment", low: 20000, likely: 30000, high: 45000, distribution: "uniform" },
    { id: "c4", name: "Labour", low: 15000, likely: 20000, high: 35000, distribution: "normal" },
    { id: "c5", name: "Permits", low: 5000, likely: 8000, high: 20000, distribution: "triangular" }
  ];
  var baseCost = 100000 + 50000 + 30000 + 20000 + 8000; // 208000
  var result = B.monteCarloCost(items, 2000, { seed: 77 });
  ok(result.p50 > 0, "monteCarloCost p50 is positive (" + result.p50 + ")");
  ok(result.p80 > result.p50, "monteCarloCost p80 > p50");
  ok(result.p90 > result.p80, "monteCarloCost p90 > p80");
  // p50 should be near the sum of likely values
  ok(Math.abs(result.p50 - baseCost) < baseCost * 0.15, "p50 near sum of likely values (within 15%): " + result.p50 + " vs base " + baseCost);
  ok(result.stdDev > 0, "monteCarloCost stdDev > 0 (" + result.stdDev + ")");
  ok(result.histogram.length >= 5, "monteCarloCost histogram has multiple buckets (" + result.histogram.length + ")");
  // Histogram total count should equal iterations
  var histTotal = result.histogram.reduce(function (s, b) { return s + b.count; }, 0);
  ok(histTotal === 2000, "histogram bucket counts sum to iterations (" + histTotal + ")");
  // Contingency recommendation
  ok(result.contingencyRecommendation.p80Amount > 0, "contingencyRecommendation p80Amount > 0 (" + result.contingencyRecommendation.p80Amount + ")");
  ok(result.contingencyRecommendation.p90Amount > result.contingencyRecommendation.p80Amount, "p90Amount > p80Amount");
  ok(result.contingencyRecommendation.percentOfBase > 0, "percentOfBase > 0 (" + result.contingencyRecommendation.percentOfBase + "%)");
})();

console.log("\n-- monteCarloCost: determinism with seed --");
(function () {
  var items = [
    { id: "x1", name: "Item 1", low: 1000, likely: 2000, high: 4000, distribution: "triangular" },
    { id: "x2", name: "Item 2", low: 500, likely: 800, high: 1500, distribution: "uniform" }
  ];
  var r1 = B.monteCarloCost(items, 500, { seed: 555 });
  var r2 = B.monteCarloCost(items, 500, { seed: 555 });
  ok(r1.p50 === r2.p50, "cost determinism: same seed same p50");
  ok(r1.mean === r2.mean, "cost determinism: same seed same mean");
  ok(r1.p90 === r2.p90, "cost determinism: same seed same p90");
})();

console.log("\n-- monteCarloCost: empty input --");
(function () {
  var result = B.monteCarloCost([], 100);
  ok(result.p50 === 0, "empty cost items returns p50=0");
  ok(result.contingencyRecommendation.percentOfBase === 0, "empty items: percentOfBase=0");
})();

console.log("\n-- riskQuantification: combined analysis --");
(function () {
  var projectState = {
    cases: [
      { id: "c1", problem: "Civil works trenching", estCost: 100000, sev: 5, occ: 4, det: 3, priority: "2-HIGH", _brain: "task", status: "OPEN", startDate: "2024-01-01" },
      { id: "c2", problem: "Cable procurement", estCost: 50000, sev: 3, occ: 3, det: 3, priority: "3-MEDIUM", _brain: "task", status: "OPEN", startDate: "2024-02-01" },
      { id: "c3", problem: "CRITICAL: Permit approval delays", estCost: 80000, sev: 8, occ: 7, det: 4, priority: "1-CRITICAL", _brain: "task", status: "OPEN", startDate: "2024-01-15" },
      { id: "c4", problem: "Splicing operations", estCost: 30000, sev: 4, occ: 3, det: 3, priority: "3-MEDIUM", _brain: "task", status: "OPEN" },
      { id: "c5", problem: "Testing and commissioning", estCost: 20000, sev: 5, occ: 3, det: 3, priority: "3-MEDIUM", _brain: "task", status: "OPEN" }
    ],
    options: { seed: 321, iterations: 1000 }
  };
  var result = B.riskQuantification(projectState);
  ok(result.schedule !== undefined, "riskQuantification returns schedule");
  ok(result.cost !== undefined, "riskQuantification returns cost");
  ok(result.summary !== undefined, "riskQuantification returns summary");
  ok(result.summary.costItemsAnalyzed === 5, "analyzed 5 cost items (" + result.summary.costItemsAnalyzed + ")");
  ok(result.summary.tasksAnalyzed >= 3, "analyzed schedule tasks (" + result.summary.tasksAnalyzed + ")");
  ok(result.summary.totalBaseEstimate === 280000, "base estimate is sum of estCost (280000): " + result.summary.totalBaseEstimate);
  // Contingency recommendation
  ok(result.summary.recommendedContingency.p90Amount > 0, "recommends contingency > 0");
  ok(result.summary.recommendedContingency.percentOfBase > 0, "contingency percent > 0 (" + result.summary.recommendedContingency.percentOfBase + "%)");
  // Critical items should have higher pessimistic (2x vs 1.5x)
  ok(result.cost.p90 > result.cost.p50, "cost p90 > p50");
  ok(result.schedule.p90 > result.schedule.p50, "schedule p90 > p50");
})();

console.log("\n-- riskQuantification: empty state --");
(function () {
  var result = B.riskQuantification({});
  ok(result.summary.costItemsAnalyzed === 0, "empty state: 0 cost items");
  ok(result.summary.tasksAnalyzed === 0, "empty state: 0 schedule tasks");
  ok(result.schedule.p50 === 0, "empty state: schedule p50=0");
  ok(result.cost.p50 === 0, "empty state: cost p50=0");
})();

console.log("\n-- pertRandom: PERT distribution helper --");
(function () {
  // pertRandom should produce values within [min, max] range
  var rng = (function () {
    var s = 12345;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  })();
  var samples = [];
  for (var i = 0; i < 1000; i++) {
    var v = B.pertRandom(5, 10, 20, rng);
    samples.push(v);
  }
  var allInRange = samples.every(function (s) { return s >= 5 && s <= 20; });
  ok(allInRange, "pertRandom all samples in [5, 20] range");
  var avg = samples.reduce(function (s, v) { return s + v; }, 0) / samples.length;
  // PERT mean should be (5 + 4*10 + 20)/6 = 10.83
  var expectedMean = (5 + 4 * 10 + 20) / 6;
  ok(Math.abs(avg - expectedMean) < 1.5, "pertRandom mean near PERT expected (" + avg.toFixed(2) + " vs " + expectedMean.toFixed(2) + ")");
})();

console.log("\n-- histogram bucket distribution --");
(function () {
  var items = [
    { id: "h1", name: "A", low: 100, likely: 200, high: 400, distribution: "triangular" },
    { id: "h2", name: "B", low: 50, likely: 100, high: 200, distribution: "triangular" },
    { id: "h3", name: "C", low: 30, likely: 50, high: 80, distribution: "triangular" }
  ];
  var result = B.monteCarloCost(items, 5000, { seed: 888 });
  // Histogram should have a reasonable distribution (not all in one bucket)
  var nonZeroBuckets = result.histogram.filter(function (b) { return b.count > 0; });
  ok(nonZeroBuckets.length >= 5, "histogram has >= 5 non-zero buckets (" + nonZeroBuckets.length + ")");
  // Check that the peak is roughly in the middle (bell-shaped for sum of triangulars)
  var maxCount = 0;
  var maxIdx = 0;
  for (var i = 0; i < result.histogram.length; i++) {
    if (result.histogram[i].count > maxCount) {
      maxCount = result.histogram[i].count;
      maxIdx = i;
    }
  }
  // Peak should not be at the extreme edges (first 2 or last 2 buckets)
  ok(maxIdx > 1 && maxIdx < result.histogram.length - 2, "histogram peak is not at extremes (peak at index " + maxIdx + " of " + result.histogram.length + ")");
})();

// ---------- Energy Watchdog v2 (comprehensive rebuild) ----------
console.log("\n-- energyWatchdog v2: country-specific, engineering-grade --");
(function () {
  var ew = B.energyWatchdog();

  // 1. perCountryAnalysis with 8+ entries
  ok(ew.perCountryAnalysis && ew.perCountryAnalysis.length >= 8, "energyWatchdog perCountryAnalysis has 8+ entries (" + (ew.perCountryAnalysis ? ew.perCountryAnalysis.length : 0) + ")");

  // 2. Guam has highest electricity rate ($0.29)
  var guam = ew.perCountryAnalysis.filter(function (c) { return c.country === "Guam"; })[0];
  ok(guam && guam.electricityRate === 0.29, "Guam has highest electricity rate ($0.29)");

  // 3. Brunei has lowest electricity rate ($0.03)
  var brunei = ew.perCountryAnalysis.filter(function (c) { return c.country === "Brunei"; })[0];
  ok(brunei && brunei.electricityRate === 0.03, "Brunei has lowest electricity rate ($0.03)");

  // 4. Indonesia has highest carbon intensity (0.76)
  var indo = ew.perCountryAnalysis.filter(function (c) { return c.country === "Indonesia"; })[0];
  ok(indo && indo.carbonIntensity === 0.76, "Indonesia has highest carbon intensity (0.76)");

  // 5. degradationForecast has 25 years of data
  ok(ew.degradationForecast && ew.degradationForecast.length === 25, "degradationForecast has 25 years (" + (ew.degradationForecast ? ew.degradationForecast.length : 0) + ")");

  // 6. Year 25 power is higher than Year 1 (degradation modeled)
  var y1 = ew.degradationForecast[0];
  var y25 = ew.degradationForecast[24];
  ok(y25.totalPowerKW > y1.totalPowerKW, "Year 25 power (" + y25.totalPowerKW + " kW) > Year 1 (" + y1.totalPowerKW + " kW) - degradation modeled");

  // 7. carbonCredits.annualValue > 0
  ok(ew.carbonCredits && ew.carbonCredits.annualValue > 0, "carbonCredits.annualValue > 0 ($" + (ew.carbonCredits ? ew.carbonCredits.annualValue : 0) + ")");

  // 8. solarPotential has entries for all countries with landing stations
  ok(ew.solarPotential && ew.solarPotential.length === ew.perCountryAnalysis.length, "solarPotential has entries for all landing station countries (" + (ew.solarPotential ? ew.solarPotential.length : 0) + ")");

  // 9. Total system power includes cable I2R losses (not zero)
  ok(ew.currentState.cableI2RLossKW > 0, "Total system power includes cable I2R losses (" + ew.currentState.cableI2RLossKW + " kW, not zero)");

  // 10. engineeringNotes references IEC 62446 and ITU-T L.1410
  var notesStr = ew.engineeringNotes.join(" ");
  var hasIEC = notesStr.indexOf("IEC 62446") !== -1;
  var hasITU = notesStr.indexOf("ITU-T L.1410") !== -1;
  ok(hasIEC && hasITU, "engineeringNotes references IEC 62446 and ITU-T L.1410");
})();

// ---------- designCableSystem Engineering Tests ----------
(function() {
  console.log("\n--- designCableSystem Engineering Tests ---");
  var B = require("./js/brain.js");

  // Test 1: designCableSystem returns spans.count > 0 for 1000km route
  var r1 = B.designCableSystem({ routeKm: 1000, fiberPairs: 8, maxDepthM: 4000 });
  ok(r1.spans && r1.spans.count > 0, "designCableSystem returns spans.count > 0 for 1000km route (got " + (r1.spans ? r1.spans.count : 0) + ")");

  // Test 2: OSNR margin > 0 for a standard 1000km system
  ok(r1.osnr && r1.osnr.margin > 0, "OSNR margin > 0 for 1000km system (got " + (r1.osnr ? r1.osnr.margin : "N/A") + " dB)");

  // Test 3: Repeater spacing based on fiber attenuation (G.654.E gives longer spans than 80km)
  var r654 = B.designCableSystem({ routeKm: 1000, fiberPairs: 8, maxDepthM: 4000, fiberType: "G.654.E" });
  ok(r654.repeaterSpacing > 80, "G.654.E repeater spacing > 80km (got " + r654.repeaterSpacing + " km)");

  // Test 4: Power feed voltage scales with repeater count
  var rShort = B.designCableSystem({ routeKm: 500, fiberPairs: 8, maxDepthM: 4000 });
  var rLong = B.designCableSystem({ routeKm: 5000, fiberPairs: 8, maxDepthM: 4000 });
  ok(rLong.powerFeed.voltage > rShort.powerFeed.voltage, "Power feed voltage scales with repeater count (500km=" + rShort.powerFeed.voltage + "V, 5000km=" + rLong.powerFeed.voltage + "V)");

  // Test 5: Cable profile has multiple types for deep-water routes
  var rDeep = B.designCableSystem({ routeKm: 3000, fiberPairs: 8, maxDepthM: 5000 });
  ok(rDeep.cableProfile && rDeep.cableProfile.length >= 3, "Cable profile has multiple types for deep-water routes (got " + (rDeep.cableProfile ? rDeep.cableProfile.length : 0) + " types)");

  // Test 6: G.654.E fiber gives longer spans than G.652.D
  var r652 = B.designCableSystem({ routeKm: 1000, fiberPairs: 8, maxDepthM: 4000, fiberType: "G.652.D" });
  ok(r654.repeaterSpacing > r652.repeaterSpacing, "G.654.E gives longer spans than G.652.D (" + r654.repeaterSpacing + "km vs " + r652.repeaterSpacing + "km)");

  // Test 7: C+L band gives more capacity than C-band alone
  var rC = B.designCableSystem({ routeKm: 1000, fiberPairs: 8, maxDepthM: 4000, band: "C" });
  var rCL = B.designCableSystem({ routeKm: 1000, fiberPairs: 8, maxDepthM: 4000, band: "C+L" });
  ok(rCL.capacity.totalSystem > rC.capacity.totalSystem, "C+L band gives more capacity than C-band (" + rCL.capacity.totalSystem + " vs " + rC.capacity.totalSystem + " Tbps)");

  // Test 8: Routes >5000km use double-ended feeding
  var rUltraLong = B.designCableSystem({ routeKm: 6000, fiberPairs: 8, maxDepthM: 4000 });
  ok(rUltraLong.powerFeed.feeding === "double", "Routes >5000km use double-ended feeding (got '" + rUltraLong.powerFeed.feeding + "')");

  // Test 9: Cost total includes cable + repeaters + SLTE + shore ends + contingency
  ok(r1.costBreakdown.total > 0 &&
     r1.costBreakdown.cable > 0 &&
     r1.costBreakdown.repeaters > 0 &&
     r1.costBreakdown.slte > 0 &&
     r1.costBreakdown.shoreEnds > 0 &&
     r1.costBreakdown.contingency > 0,
    "Cost total includes cable + repeaters + SLTE + shore ends + contingency (total=$" + r1.costBreakdown.total.toLocaleString() + ")");

  // Test 10: Engineering references include ITU-T G.977
  ok(r1.references && r1.references.indexOf("ITU-T G.977") !== -1, "Engineering references include ITU-T G.977");

  // Test 11: 400G modulation only used for routes <2000km
  var rShortRoute = B.designCableSystem({ routeKm: 1000, fiberPairs: 8, maxDepthM: 2000, fiberType: "G.654.E" });
  var rLongRoute = B.designCableSystem({ routeKm: 4000, fiberPairs: 8, maxDepthM: 4000, fiberType: "G.654.E" });
  ok(rShortRoute.osnr.modulation === "16-QAM" && rLongRoute.osnr.modulation !== "16-QAM",
    "400G (16-QAM) only for routes <2000km (1000km=" + rShortRoute.osnr.modulation + ", 4000km=" + rLongRoute.osnr.modulation + ")");

  // Test 12: Shore-end cable (RA type) included in cable profile
  var hasRA = false;
  for (var i = 0; i < r1.cableProfile.length; i++) {
    if (r1.cableProfile[i].type === "RA") { hasRA = true; break; }
  }
  ok(hasRA, "Shore-end cable (RA type) included in cable profile");
})();

// ========== Revenue Model (revenueModel) ==========
(function () {
  var B = require("./js/brain.js");
  console.log("\n--- revenueModel tests ---");

  // Test 1: serviceUnit parameter controls totalLambdas calculation
  var r100 = B.revenueModel({ totalCapacityTbps: 100, serviceUnit: 100 });
  var r400 = B.revenueModel({ totalCapacityTbps: 100, serviceUnit: 400 });
  var r10 = B.revenueModel({ totalCapacityTbps: 100, serviceUnit: 10 });
  ok(r100.totalLambdas === 1000 && r400.totalLambdas === 250 && r10.totalLambdas === 10000,
    "serviceUnit controls totalLambdas: 100G=" + r100.totalLambdas + " (expect 1000), 400G=" + r400.totalLambdas + " (expect 250), 10G=" + r10.totalLambdas + " (expect 10000)");

  // Test 2: capex accepted in MILLIONS (1300 = $1.3B)
  var rCapex = B.revenueModel({ totalCapacityTbps: 100, capex: 1300 });
  ok(rCapex.capexMillions === 1300, "capex in millions: capexMillions=" + rCapex.capexMillions + " (expect 1300)");

  // Test 3: Projects over 25 years by default with configurable projectionYears
  var rDefault = B.revenueModel({ totalCapacityTbps: 100 });
  var r15 = B.revenueModel({ totalCapacityTbps: 100, projectionYears: 15 });
  ok(rDefault.yearlyProjection.length === 25 && r15.yearlyProjection.length === 15,
    "projectionYears: default=" + rDefault.yearlyProjection.length + " (expect 25), custom=" + r15.yearlyProjection.length + " (expect 15)");

  // Test 4: Take-up capped at 95%
  var rHighGrowth = B.revenueModel({ totalCapacityTbps: 100, takeUpRateYear1Pct: 50, growthRateAnnualPct: 30 });
  var maxTakeUp = 0;
  for (var i = 0; i < rHighGrowth.yearlyProjection.length; i++) {
    if (rHighGrowth.yearlyProjection[i].takeUpPct > maxTakeUp) {
      maxTakeUp = rHighGrowth.yearlyProjection[i].takeUpPct;
    }
  }
  ok(maxTakeUp <= 95, "Take-up capped at 95%: max observed=" + maxTakeUp + "%");

  // Test 5: OpEx includes 3%/year inflation
  var rInflation = B.revenueModel({ totalCapacityTbps: 100, operatingCostAnnualM: 20 });
  var year1Opex = rInflation.yearlyProjection[0].opex;
  var year5Opex = rInflation.yearlyProjection[4].opex;
  var expectedYear5 = 20000000 * Math.pow(1.03, 4);
  ok(Math.abs(year5Opex - Math.round(expectedYear5)) <= 1,
    "OpEx inflates 3%/yr: Y1=" + year1Opex + " Y5=" + year5Opex + " (expect ~" + Math.round(expectedYear5) + ")");

  // Test 6: IRR calculated via Newton-Raphson, NPV at 10%
  var rFinancials = B.revenueModel({
    totalCapacityTbps: 100,
    serviceUnit: 100,
    pricePerLambdaPerMonth: 8000,
    takeUpRateYear1Pct: 30,
    growthRateAnnualPct: 20,
    operatingCostAnnualM: 30,
    capex: 500
  });
  ok(typeof rFinancials.irr === "number" && rFinancials.irr > 0,
    "IRR calculated via Newton-Raphson: " + (rFinancials.irr * 100).toFixed(2) + "% (positive return)");
  ok(typeof rFinancials.npv === "number",
    "NPV calculated at 10%: $" + rFinancials.npv.toLocaleString());

  // Test 7: EBITDA tracked in yearly projection and paybackYears returned as decimal
  var rEbitda = B.revenueModel({ totalCapacityTbps: 100, serviceUnit: 100, capex: 200, takeUpRateYear1Pct: 40, pricePerLambdaPerMonth: 5000, operatingCostAnnualM: 10 });
  var hasEbitda = rEbitda.yearlyProjection[0].ebitda !== undefined;
  ok(hasEbitda, "EBITDA tracked in projection: Year 1 EBITDA=$" + rEbitda.yearlyProjection[0].ebitda.toLocaleString());
  ok(rEbitda.paybackYears !== null && typeof rEbitda.paybackYears === "number",
    "paybackYears as decimal: " + rEbitda.paybackYears + " years");

  // Test 8: marketContext with TeleGeography references and breakEvenUtilization
  var rMarket = B.revenueModel({ totalCapacityTbps: 100, serviceUnit: 100, pricePerLambdaPerMonth: 5000 });
  ok(rMarket.marketContext && rMarket.marketContext.source === "TeleGeography" &&
     rMarket.marketContext.references.length >= 3,
    "marketContext includes TeleGeography references (" + rMarket.marketContext.references.length + " refs)");
  ok(typeof rMarket.breakEvenUtilization === "number" && rMarket.breakEvenUtilization > 0,
    "breakEvenUtilization calculated: " + rMarket.breakEvenUtilization + "%");
})();

// === Power Budget Analysis Tests (ITU-T G.977 / IEC 61280) ===
(function() {
  // Test 1: G.654.E at 1550nm uses 0.17 dB/km attenuation coefficient
  var r1 = B.powerBudgetAnalysis({ routeKm: 1000, fiberType: "G.654.E", wavelength: 1550, spans: 1, spliceCount: 0, connectorPairs: 0, transmitPower: 0, receiverSensitivity: -28, additionalLosses: 0 });
  ok(r1.linkBudget.attenuationPerKm === 0.17,
    "G.654.E@1550nm attenuation: " + r1.linkBudget.attenuationPerKm + " dB/km (ITU-T G.977)");

  // Test 2: G.652.D at 1550nm uses 0.20 dB/km
  var r2 = B.powerBudgetAnalysis({ routeKm: 100, fiberType: "G.652.D", wavelength: 1550, spans: 1, spliceCount: 0, connectorPairs: 0 });
  ok(r2.linkBudget.attenuationPerKm === 0.20,
    "G.652.D@1550nm attenuation: " + r2.linkBudget.attenuationPerKm + " dB/km");

  // Test 3: Splice loss = 0.1 dB per splice (IEC 61073)
  var r3 = B.powerBudgetAnalysis({ routeKm: 100, fiberType: "G.654.E", wavelength: 1550, spans: 1, spliceCount: 20, connectorPairs: 0 });
  ok(r3.linkBudget.spliceLoss === 2.0,
    "Splice loss 20 splices x 0.1 dB = " + r3.linkBudget.spliceLoss + " dB (IEC 61073)");

  // Test 4: Connector loss = 0.3 dB per mated pair (IEC 61755)
  var r4 = B.powerBudgetAnalysis({ routeKm: 100, fiberType: "G.654.E", wavelength: 1550, spans: 1, spliceCount: 0, connectorPairs: 4 });
  ok(r4.linkBudget.connectorLoss === 1.2,
    "Connector loss 4 pairs x 0.3 dB = " + r4.linkBudget.connectorLoss + " dB (IEC 61755)");

  // Test 5: Amplification correctly calculates repeaterCount = spans - 1
  var r5 = B.powerBudgetAnalysis({ routeKm: 3000, fiberType: "G.654.E", wavelength: 1550, spans: 10, spliceCount: 50, connectorPairs: 2, repeaterGain: 15 });
  ok(r5.amplification.repeaterCount === 9 && r5.amplification.totalGain === 135,
    "Repeaters: " + r5.amplification.repeaterCount + " units, total gain: " + r5.amplification.totalGain + " dB");

  // Test 6: System margin > 6 dB gives EXCELLENT verdict
  var r6 = B.powerBudgetAnalysis({ routeKm: 100, fiberType: "G.654.E", wavelength: 1550, spans: 1, spliceCount: 5, connectorPairs: 2, transmitPower: 4, receiverSensitivity: -28 });
  ok(r6.verdict === "EXCELLENT" && r6.powerBalance.systemMargin > 6,
    "EXCELLENT verdict at " + r6.powerBalance.systemMargin + " dB margin (>6 dB)");

  // Test 7: System with no amplification on long route gives FAIL verdict
  var r7 = B.powerBudgetAnalysis({ routeKm: 500, fiberType: "G.652.D", wavelength: 1550, spans: 1, spliceCount: 100, connectorPairs: 4, transmitPower: 0, receiverSensitivity: -28 });
  ok(r7.verdict === "FAIL" && r7.powerBalance.systemMargin < 1,
    "FAIL verdict at " + r7.powerBalance.systemMargin + " dB margin (<1 dB) - redesign required");

  // Test 8: Per-span analysis returns correct number of spans with proper structure
  var r8 = B.powerBudgetAnalysis({ routeKm: 600, fiberType: "G.654.E", wavelength: 1550, spans: 6, spliceCount: 30, connectorPairs: 2, repeaterGain: 20 });
  ok(r8.perSpanAnalysis.length === 6 && r8.perSpanAnalysis[0].lengthKm === 100 && r8.perSpanAnalysis[0].fiberLoss === 17,
    "Per-span: " + r8.perSpanAnalysis.length + " spans, span 1 length=" + r8.perSpanAnalysis[0].lengthKm + "km, fiber loss=" + r8.perSpanAnalysis[0].fiberLoss + " dB");

  // Test 9: Aging margin = 0.02 dB/km, repair margin = 0.5 dB per 1000km, temperature = 0.01 dB/km
  var r9 = B.powerBudgetAnalysis({ routeKm: 2000, fiberType: "G.654.E", wavelength: 1550, spans: 1, spliceCount: 0, connectorPairs: 0 });
  ok(r9.linkBudget.agingMargin === 40 && r9.linkBudget.repairMargin === 1 && r9.linkBudget.temperatureMargin === 20,
    "Margins: aging=" + r9.linkBudget.agingMargin + " dB, repair=" + r9.linkBudget.repairMargin + " dB, temp=" + r9.linkBudget.temperatureMargin + " dB");

  // Test 10: References include ITU-T G.977 and IEC 61280
  var r10 = B.powerBudgetAnalysis({ routeKm: 100 });
  var hasG977 = r10.references.some(function(ref) { return ref.indexOf("ITU-T G.977") >= 0; });
  var hasIEC61280 = r10.references.some(function(ref) { return ref.indexOf("IEC 61280") >= 0; });
  ok(hasG977 && hasIEC61280,
    "References include ITU-T G.977 and IEC 61280 (" + r10.references.length + " total refs)");
})();

// ===== Commissioning Checklist Generator Tests =====
(function() {
  console.log("\n--- Commissioning Checklist Generator ---");

  // Test 1: Returns valid checklist structure with segments
  var r1 = B.generateCommissioningChecklist({
    segments: [
      { name: "Segment-A", lengthKm: 1000, fiberPairs: 8, repeaterCount: 12 },
      { name: "Segment-B", lengthKm: 2000, fiberPairs: 4, repeaterCount: 25 }
    ]
  });
  ok(r1.segments.length === 2 && r1.segments[0].segment === "Segment-A" && r1.segments[1].segment === "Segment-B",
    "Returns checklist with " + r1.segments.length + " segments (Segment-A, Segment-B)");

  // Test 2: Each segment has IEC 61280 and ITU-T G.977 tests
  var seg1Tests = r1.segments[0].tests;
  var hasIEC = seg1Tests.some(function(t) { return t.standard.indexOf("IEC 61280") >= 0; });
  var hasG977 = seg1Tests.some(function(t) { return t.standard.indexOf("ITU-T G.977") >= 0; });
  ok(hasIEC && hasG977,
    "Segment tests include both IEC 61280 and ITU-T G.977 standards");

  // Test 3: Critical tests are flagged correctly
  var criticalTests = seg1Tests.filter(function(t) { return t.critical === true; });
  ok(criticalTests.length >= 10,
    "At least 10 critical tests per segment - got " + criticalTests.length);

  // Test 4: Segment-specific expected values are calculated (attenuation scales with distance)
  var attTest = seg1Tests.find(function(t) { return t.testId === "ATT-01"; });
  ok(attTest && attTest.expectedValue && attTest.expectedValue.indexOf("1000") >= 0,
    "ATT-01 expected value references segment length: " + (attTest ? attTest.expectedValue : "null"));

  // Test 5: Summary counts are correct
  var sum = r1.summary;
  ok(sum.totalSegments === 2 && sum.criticalTests > 0 && sum.applicableTests > sum.criticalTests,
    "Summary: " + sum.totalSegments + " segments, " + sum.criticalTests + " critical, " + sum.applicableTests + " applicable");

  // Test 6: Hold points cover commissioning phases
  ok(r1.holdPoints.length >= 5 && r1.holdPoints[0].phase === "Pre-lay" && r1.holdPoints[r1.holdPoints.length - 1].phase === "Final acceptance",
    "Hold points: " + r1.holdPoints.length + " phases from Pre-lay to Final acceptance");

  // Test 7: References array includes IEC 61280 and ITU-T G.977 documents
  var refIEC = r1.references.some(function(ref) { return ref.indexOf("IEC 61280") >= 0; });
  var refG977 = r1.references.some(function(ref) { return ref.indexOf("ITU-T G.977") >= 0; });
  ok(refIEC && refG977 && r1.references.length >= 6,
    "References include IEC 61280 and ITU-T G.977 (" + r1.references.length + " total)");

  // Test 8: Power feed tests are not applicable when repeaterCount is 0
  var r2 = B.generateCommissioningChecklist({
    segments: [{ name: "Short-Link", lengthKm: 50, fiberPairs: 2, repeaterCount: 0 }]
  });
  var pfTests = r2.segments[0].tests.filter(function(t) { return t.category === "Power Feed"; });
  var allNA = pfTests.every(function(t) { return t.applicability === "not_applicable"; });
  ok(allNA && pfTests.length >= 2,
    "Power feed tests marked not_applicable when repeaterCount=0 (" + pfTests.length + " PFE tests)");
})();

// ===== Wavelength Assignment Planner Tests (ITU-T G.694.1) =====
(function () {
  console.log("\n--- Wavelength Assignment Planner ---");
  var w = B.planWavelengths({ band: "C", spacingGHz: 50, bitratePerChannelGbps: 200, fiberPairs: 4 });
  ok(w.channelsPerPair === 96, "C-band @50GHz yields 96 channels (got " + w.channelsPerPair + ")");
  ok(B.planWavelengths({ band: "C+L", spacingGHz: 50 }).channelCount === 192, "C+L-band @50GHz yields 192 channels");
  ok(B.planWavelengths({ band: "C", spacingGHz: 100 }).channelCount === 48, "C-band @100GHz yields 48 channels");
  ok(B.planWavelengths({ band: "C", spacingGHz: 25 }).channelCount === 192, "C-band @25GHz yields 192 channels");
  var anchor = w.channels.filter(function (c) { return Math.abs(c.frequencyTHz - 193.1) < 1e-6; })[0];
  ok(anchor && Math.abs(anchor.wavelengthNm - 1552.524) < 0.01, "anchor 193.1 THz maps to 1552.524 nm (ITU-T G.694.1)");
  ok(w.channels[0].index === 1 && w.channels[0].wavelengthNm < w.channels[w.channels.length - 1].wavelengthNm, "channels numbered from 1, sorted by ascending wavelength");
  ok(w.capacityPerPairTbps === 19.2, "96 ch x 200G = 19.2 Tbps/pair (got " + w.capacityPerPairTbps + ")");
  ok(w.systemCapacityTbps === 76.8, "4 pairs x 19.2 = 76.8 Tbps system (got " + w.systemCapacityTbps + ")");
  ok(w.spectralEfficiency === 4, "spectral efficiency 200/50 = 4 b/s/Hz");
  ok(B.planWavelengths({ band: "C", spacingGHz: 50, bitratePerChannelGbps: 800 }).feasibility.ok === false, "800G in a 50 GHz slot flagged infeasible");
  ok(B.planWavelengths({ band: "C", spacingGHz: 100, bitratePerChannelGbps: 800 }).feasibility.ok === true, "800G in a 100 GHz slot is feasible");
  // RWA: a 400G demand needs 2 x 200G slots; ensure assignment + blocking
  var rwa = B.planWavelengths({ band: "C", spacingGHz: 100, bitratePerChannelGbps: 200, fiberPairs: 1, demands: [{ label: "Big", capacityGbps: 400 }, { label: "Small" }] });
  var bigRow = rwa.assignment.rows.filter(function (r) { return r.demand === "Big"; })[0];
  ok(bigRow && bigRow.slots === 2 && bigRow.status === "ASSIGNED", "400G demand consumes 2 slots and is assigned");
  var blockTest = B.planWavelengths({ band: "C", spacingGHz: 100, bitratePerChannelGbps: 100, fiberPairs: 1, demands: Array.from({ length: 60 }, function (_, i) { return { label: "D" + i }; }) });
  ok(blockTest.assignment.assigned === 48 && blockTest.assignment.blocked === 12, "48-channel pair assigns 48, blocks 12 of 60 demands");
  ok(blockTest.warnings.some(function (x) { return /blocked/i.test(x); }), "blocking produces a warning");
  ok(w.references.some(function (x) { return x.indexOf("G.694.1") >= 0; }), "references cite ITU-T G.694.1");
})();

// ===== Latency Calculator Tests (ITU-T G.114 / group index) =====
(function () {
  console.log("\n--- Latency Calculator ---");
  var l = B.calcLatency({ routeKm: 1000, fiberType: "G.652.D", slackPct: 7 });
  ok(Math.abs(l.perKmOneWayUs - 4.8974) < 0.001, "G.652.D group index gives 4.8974 us/km one-way (got " + l.perKmOneWayUs + ")");
  ok(l.fiberLengthKm === 1070, "1000 km + 7% slack = 1070 km fibre");
  ok(Math.abs(l.oneWayMs - 5.288) < 0.01, "one-way latency ~5.288 ms (got " + l.oneWayMs + ")");
  ok(Math.abs(l.rttMs - l.oneWayMs * 2) < 0.001, "RTT = 2 x one-way");
  ok(Math.abs(l.vacuum.oneWayMs - 3.336) < 0.01, "vacuum great-circle floor ~3.336 ms for 1000 km");
  ok(l.vacuum.overheadPct > 0, "fibre overhead vs vacuum floor is positive (" + l.vacuum.overheadPct + "%)");
  ok(Math.abs(l.geoSatellite.oneWayMs - 238.738) < 0.1, "GEO satellite one-way ~238.7 ms");
  ok(l.geoSatellite.fiberFasterTimes > 1, "fibre is faster than GEO satellite (" + l.geoSatellite.fiberFasterTimes + "x)");
  ok(l.g114Verdict.rating === "Good", "1000 km link rated Good per G.114 (<=150 ms one-way)");
  var lLong = B.calcLatency({ routeKm: 40000, slackPct: 7 });
  ok(lLong.g114Verdict.rating === "Acceptable", "40,000 km link rated Acceptable (150-400 ms) - got " + lLong.g114Verdict.rating + " @ " + lLong.oneWayMs + " ms");
  var lFec = B.calcLatency({ routeKm: 1000, fecEnabled: false });
  var lNoFec = B.calcLatency({ routeKm: 1000, fecEnabled: true });
  ok(lNoFec.equipmentUs - lFec.equipmentUs === 18, "enabling SD-FEC adds 18 us to the equipment budget");
  var lRegen = B.calcLatency({ routeKm: 1000, regenCount: 2 });
  ok(lRegen.equipmentBreakdown.some(function (e) { return /regen/i.test(e.item) && e.count === 2; }), "regen sites appear in the equipment breakdown");
  ok(B.calcLatency({ routeKm: 1000, fiberType: "G.654.E" }).groupIndex === 1.468, "G.654.E uses a distinct group index (1.468)");
  ok(l.references.some(function (x) { return x.indexOf("G.114") >= 0; }), "references cite ITU-T G.114");
})();

// ===== Cable Protection Awareness Tests (ICPC / UNCLOS) =====
(function () {
  console.log("\n--- Cable Protection Awareness ---");
  var p = B.assessCableProtection({ routeKm: 1000, trawlingIntensity: "high", anchoringActivity: "high", seabed: "rock", seismicZone: true });
  ok(p.segments.length === 5, "default profile produces 5 depth-band segments (got " + p.segments.length + ")");
  var byKey = {};
  p.segments.forEach(function (s) { byKey[s.band] = s; });
  ok(byKey.shoreEnd && byKey.shoreEnd.recommendedBurialM === 3, "high-threat shore end recommends 3 m burial");
  ok(byKey.shelf && (byKey.shelf.threatLevel === "Critical" || byKey.shelf.threatLevel === "High"), "shelf under heavy trawl/anchor is High/Critical threat");
  ok(byKey.shelf && /Double armour/.test(byKey.shelf.recommendedArmour), "high-threat shelf recommends double armour");
  ok(byKey.deep && byKey.deep.recommendedBurialM === 0, "deep ocean (>2000 m) is surface-laid (no burial)");
  // Burial decreases monotonically with depth
  ok(byKey.shoreEnd.recommendedBurialM >= byKey.shelf.recommendedBurialM && byKey.shelf.recommendedBurialM >= byKey.slope.recommendedBurialM && byKey.slope.recommendedBurialM >= byKey.deep.recommendedBurialM, "recommended burial decreases monotonically with depth");
  // Residual never exceeds inherent threat
  ok(p.segments.every(function (s) { return s.residualScore <= s.threatScore; }), "residual risk never exceeds inherent threat for any segment");
  ok(p.summary.protectedKm > 0 && p.summary.surfaceLaidKm > 0, "summary splits protected vs surface-laid length");
  ok(p.summary.protectionAdequacyPct >= 0 && p.summary.protectionAdequacyPct <= 100, "threat-reduction percentage is within 0-100");
  ok(p.summary.highThreatKm > 0, "heavy-activity route flags high-threat length");
  // Quiet deep route: minimal threat
  var pq = B.assessCableProtection({ routeKm: 800, trawlingIntensity: "none", anchoringActivity: "none", seabed: "mud" });
  ok(pq.summary.highThreatKm === 0, "no fishing/anchoring -> zero high-threat length");
  ok(pq.summary.weightedResidualScore <= p.summary.weightedResidualScore, "quiet route has lower absolute residual risk than heavy-activity route");
  ok(p.references.some(function (x) { return /ICPC/.test(x); }) && p.references.some(function (x) { return /UNCLOS/.test(x); }), "references cite ICPC and UNCLOS");
  // Explicit depth profile is honoured
  var pExp = B.assessCableProtection({ depthProfile: { shoreEndKm: 5, shelfKm: 0, slopeKm: 0, deepUpperKm: 0, deepKm: 95 } });
  ok(pExp.segments.length === 2 && pExp.segments.some(function (s) { return s.band === "deep"; }), "explicit depth profile with empty bands is honoured (2 segments)");
})();

// ===== 3D Build-Sequence Engine Tests =====
(function () {
  console.log("\n--- 3D Build-Sequence Engine ---");
  var r = B.generateBuildSequence();
  ok(r.summary.totalStations === 8, "default scene has 8 landing stations (got " + r.summary.totalStations + ")");
  ok(r.summary.totalSegments === 7, "default scene has 7 cable links (got " + r.summary.totalSegments + ")");
  ok(r.steps.length === r.summary.totalSteps && r.steps.length > 0, "steps array matches summary count");
  // All 8 programme countries present
  var want = ["Indonesia", "Thailand", "Vietnam", "Taiwan", "Philippines", "Guam", "Malaysia", "Brunei"];
  ok(want.every(function (c) { return r.summary.countries.indexOf(c) >= 0; }), "scene covers all 8 programme countries");
  // Phase order
  var expPhases = ["Marine Survey", "Landing Stations", "Cable Lay", "Splice & Branching", "Test & Commission", "Handover"];
  ok(JSON.stringify(r.summary.phases) === JSON.stringify(expPhases), "phases appear in build order: " + r.summary.phases.join(" > "));
  // Step-kind counts
  var k = {};
  r.steps.forEach(function (s) { k[s.kind] = (k[s.kind] || 0) + 1; });
  ok(k.survey === 7 && k.landing === 8 && k.splice === 7 && k.test === 7 && k.handover === 1, "step kinds: " + JSON.stringify(k));
  ok(k.lay >= 7, "at least one lay (extrusion) step per segment - got " + k.lay);
  // Ordering: all surveys before landings before first lay; handover last
  var firstLanding = r.steps.findIndex(function (s) { return s.kind === "landing"; });
  var lastSurvey = r.steps.map(function (s) { return s.kind; }).lastIndexOf("survey");
  var firstLay = r.steps.findIndex(function (s) { return s.kind === "lay"; });
  ok(lastSurvey < firstLanding && firstLanding < firstLay, "ordering: surveys -> landings -> cable lay");
  ok(r.steps[r.steps.length - 1].kind === "handover", "final step is handover (system ready for service)");
  // Lay increments are valid fractions
  var lay = r.steps.filter(function (s) { return s.kind === "lay"; });
  ok(lay.every(function (s) { return s.fromFrac < s.toFrac && s.toFrac <= 1 && s.incrementKm > 0; }), "lay steps have valid increasing fractions and positive km");
  // Progress monotonic and ends at 100
  var monoLaid = true, prev = -1;
  r.steps.forEach(function (s) { if (s.laidKm < prev) monoLaid = false; prev = s.laidKm; });
  ok(monoLaid, "cumulative laid km never decreases across steps");
  ok(r.steps[r.steps.length - 1].progressPct === 100 && r.steps[r.steps.length - 1].layProgressPct === 100, "final step is 100% complete and 100% laid");
  // Total laid km reconciles with network length (within rounding)
  var finalLaid = r.steps[r.steps.length - 1].laidKm;
  ok(Math.abs(finalLaid - r.summary.totalKm) <= r.summary.totalSegments * 10, "laid km reconciles with total network km (" + finalLaid + " vs " + r.summary.totalKm + ")");
  // Haversine length sanity for Malaysia->Indonesia trunk
  var s1 = r.scene.segments.filter(function (g) { return g.id === "S1"; })[0];
  ok(s1 && s1.lengthKm > 700 && s1.lengthKm < 1200, "Mersing->Jakarta length is geographically plausible (" + (s1 ? s1.lengthKm : "n/a") + " km)");
  // Determinism
  ok(JSON.stringify(r) === JSON.stringify(B.generateBuildSequence()), "same inputs -> identical build sequence (deterministic)");
  // Custom topology honoured
  var c = B.generateBuildSequence({
    stations: [{ id: "A", name: "A CLS", country: "X", lon: 100, lat: 0 }, { id: "Z", name: "Z CLS", country: "Y", lon: 110, lat: 0 }],
    segments: [{ id: "L1", from: "A", to: "Z", cableType: "G.652.D" }]
  });
  ok(c.summary.totalStations === 2 && c.summary.totalSegments === 1 && c.steps[c.steps.length - 1].kind === "handover", "custom 2-station/1-link topology produces a complete sequence");
  ok(r.references.some(function (x) { return /ICPC/.test(x); }) && r.references.some(function (x) { return /ITU-T/.test(x); }), "references cite ICPC and ITU-T submarine practice");
})();

// ===== Country Intelligence Tests (8 programme countries) =====
(function () {
  console.log("\n--- Country Intelligence ---");
  var all = B.listCountries();
  ok(all.length === 8, "listCountries returns all 8 programme countries (got " + all.length + ")");
  var wantCodes = ["ID", "TH", "VN", "TW", "PH", "GU", "MY", "BN"];
  ok(wantCodes.every(function (c) { return all.some(function (x) { return x.code === c; }); }), "all 8 country codes present");
  // Every country has the 5 regulatory domains + challenge lists + phase contacts
  var complete = all.every(function (c) {
    var a = c.regulatoryAuthorities || {};
    var hasAuth = a.telecom && a.maritime && a.environment && a.coastal && a.investment;
    var hasFull = a.telecom && a.telecom.name && a.telecom.fullName && a.telecom.jurisdiction;
    var kc = c.keyContacts || {};
    return hasAuth && hasFull &&
      (c.geopoliticalChallenges || []).length >= 3 &&
      (c.geographicalChallenges || []).length >= 3 &&
      kc.feasibility && kc.permitting && kc.construction && kc.operations;
  });
  ok(complete, "each country has 5 regulators (name+fullName+jurisdiction), >=3 geopolitical, >=3 geographical, and 4 phase-contact groups");
  // Real-institution spot checks (not generic)
  ok(B.getCountryInfo("PH").regulatoryAuthorities.telecom.name === "NTC", "Philippines telecom regulator is NTC");
  ok(B.getCountryInfo("ID").regulatoryAuthorities.telecom.name.indexOf("Kominfo") >= 0, "Indonesia telecom regulator is Kominfo/BAKTI");
  ok(B.getCountryInfo("GU").regulatoryAuthorities.telecom.name === "FCC", "Guam (US territory) telecom regulator is the FCC");
  // Lookup by code, name and alias; unknown -> null
  ok(B.getCountryInfo("saigon") && B.getCountryInfo("saigon").code === "VN", "alias lookup resolves 'saigon' -> Vietnam");
  ok(B.getCountryInfo("Taiwan") && B.getCountryInfo("Taiwan").code === "TW", "name lookup resolves 'Taiwan'");
  ok(B.getCountryInfo("Atlantis") === null, "unknown country returns null");
  // Phase -> authority auto-surfacing
  var perm = B.authoritiesForPhase("ID", "Cable Landing Permits");
  ok(perm && perm.group === "permitting" && perm.contacts.length > 0, "permitting phase surfaces Indonesia permitting contacts");
  var marine = B.authoritiesForPhase("TW", "Marine Installation");
  ok(marine && marine.group === "construction", "marine installation phase maps to construction contacts");
  var ops = B.authoritiesForPhase("MY", "System Testing");
  ok(ops && ops.group === "operations", "system testing phase maps to operations contacts");
  ok(B.authoritiesForPhase("ZZ", "anything") === null, "unknown country phase lookup returns null");
})();

console.log(fails === 0 ? "\nALL BRAIN TESTS PASSED" : "\n" + fails + " FAILURES");
process.exit(fails ? 1 : 0);
