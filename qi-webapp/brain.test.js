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
const noKm = B.analyzeProject("FTTH fibre OTDR splicing project with GPON");
ok(noKm.coverage.warnings.some(w => /km/.test(w)), "warns when no route length detected");

console.log("\n-- frameworks & advisor (country-aware, auto-generated) --");
const sub = B.analyzeProject("Trans-Asia submarine fibre cable landing in Philippines, Taiwan, Guam, Vietnam, Indonesia, Thailand, Malaysia and Brunei. 9,000 km, 24 months.");
ok(sub.frameworks && sub.frameworks.marketEntry && sub.frameworks.marketEntry.countries.length === 8, "Market Entry framework covers all 8 countries");
ok(sub.frameworks.licensing.countries.every(c => c.criticalPathMonths > 0 && c.criticalPathItem), "Licensing framework has a critical-path permit per country");
ok(sub.frameworks.landingPartners.countries.every(c => c.candidates.length >= 1), "Landing Partner framework lists partners per country");
ok(sub.frameworks.marketEntry.countries.find(c => c.key === "philippines").verdict === "Go", "Philippines market-entry verdict is 'Go' (open ownership)");
ok(sub.frameworks.marketEntry.countries.find(c => c.key === "taiwan").verdict === "Caution", "Taiwan market-entry verdict is 'Caution'");
ok(sub.advice && sub.advice.recommendations.length >= 4, "Advisor produces prioritised recommendations (" + sub.advice.recommendations.length + ")");
ok(sub.advice.recommendations[0].priority === "Do first" && /approval/i.test(sub.advice.recommendations[0].title), "top Advisor move is the critical-path approval");
ok(sub.advice.recommendations.every(r => r.text && r.why), "every recommendation has an action and a plain-language 'why'");
ok(sub.advice.nextSteps.length >= 1, "Advisor lists concrete next steps");
ok(JSON.stringify(B.analyzeProject("submarine cable Philippines Taiwan Guam")) === JSON.stringify(B.analyzeProject("submarine cable Philippines Taiwan Guam")), "frameworks/advice are deterministic");

console.log("\n-- generic project: no country frameworks, advisor still helps --");
const gen = B.analyzeProject("Reorganise the office filing system and onboarding");
ok(gen.frameworks === null, "non-telecom project has no country frameworks");
ok(gen.advice && gen.advice.recommendations.length >= 1, "Advisor still surfaces the biggest risk for a generic project");

console.log("\n-- determinism (no hidden randomness) --");
ok(JSON.stringify(B.analyzeProject(fibreBrief)) === JSON.stringify(B.analyzeProject(fibreBrief)), "same input -> identical output");

console.log(fails === 0 ? "\nALL BRAIN TESTS PASSED" : "\n" + fails + " FAILURES");
process.exit(fails ? 1 : 0);
