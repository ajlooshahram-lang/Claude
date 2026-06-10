global.QICalc = require("./js/calc.js");
const C = global.QICalc;
const S = require("./js/store.js");
S.load();
const e = S.validCases();
console.log("Cases:", e.length);
const c1 = e[0];
console.log("CASE-001:", c1.code, "RPN", c1.rpn, "band", c1.rpnBand, "estDays", c1.estDays, "end", c1.estEnd, "health", c1.health);
console.log("AI:", c1.ai.slice(0, 80));
const k = S.kpis();
console.log("KPIs:", JSON.stringify(k));
console.log("Top risk:", S.topRisks(1)[0].rpn);
const sg = S.sigmaRows();
console.log("Sigma wk1:", sg[0].dpmo, "->", sg[0].sigma);
console.log("Strategy High/High:", C.stakeholderStrategy("High", "High"));
console.log("Health issues:", S.health().length);
console.log("Budget cat est Labour:", S.budgetByCategory().est["Labour / Effort"]);
// expected: RPN 336, est 42500/act 38000
const ok = c1.rpn === 336 && k.estTotal === 42500 && k.actTotal === 38000 && k.crit === 5;
console.log(ok ? "PASS" : "FAIL");


// --- new feature tests ---
console.log("\n-- analytics & audit --");
const par = S.paretoRPN();
console.log("Pareto buckets:", par.length, "first cum:", par[0] && par[0].cum.toFixed(1));
const cc = S.controlChartData();
console.log("Control mean/ucl:", cc.mean && cc.mean.toFixed(3), cc.ucl && cc.ucl.toFixed(3));
const a3 = C.a3(S.get().cases[0]);
console.log("A3 title:", a3.title.slice(0, 30), "| goal set:", !!a3.goal);

const before = S.auditList().length;
const nc = S.addCase({ problem: "Audit test", category: "Quality / Defects", priority: "2-HIGH", sev: 5, occ: 5, det: 5, owner: "PM", leanMethod: "PDCA", target: "x", startDate: "2026-06-01", status: "OPEN", percent: 0 });
S.updateCase(nc.id, { status: "BLOCKED" });
S.moveStatus(nc.id, "IN PROGRESS");
const grew = S.auditList().length >= before + 3;
console.log("Audit entries grew:", grew, "(", before, "->", S.auditList().length, ")");
console.log("Latest audit:", S.auditList()[0].action, S.auditList()[0].detail);

const snap = S.takeSnapshot("test snap");
const casesNow = S.validCases().length;
S.deleteCase(nc.id);
console.log("After delete:", S.validCases().length);
S.restoreSnapshot(snap.id);
const restored = S.validCases().length === casesNow;
console.log("Restore brought it back:", restored);

const ok2 = par.length > 0 && cc.mean !== null && grew && restored;
console.log(ok2 ? "FEATURE TESTS PASS" : "FEATURE TESTS FAIL");
