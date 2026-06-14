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
  ok(cableMfg.length === 10, "vendorSearch category=cable-manufacturers returns 10 vendors (got " + cableMfg.length + ")");

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

console.log(fails === 0 ? "\nALL BRAIN TESTS PASSED" : "\n" + fails + " FAILURES");
process.exit(fails ? 1 : 0);
