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

console.log(fails === 0 ? "\nALL BRAIN TESTS PASSED" : "\n" + fails + " FAILURES");
process.exit(fails ? 1 : 0);
