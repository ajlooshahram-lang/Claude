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


// --- workspace / multi-project / brand tests ---
console.log("\n-- workspace --");
const projs0 = S.listProjects().length;
const npId = S.addProject("Project B");
console.log("Projects after add:", S.listProjects().length, "(was", projs0 + ")");
S.addCase({ problem: "B-only case", category: "Process / Flow", priority: "3-MEDIUM", sev: 4, occ: 4, det: 4, owner: "PM", leanMethod: "5S", target: "x", startDate: "2026-06-01", status: "OPEN", percent: 0 });
const bCount = S.validCases().length;
S.switchProject(S.listProjects().find(p => p.name !== "Project B").id);
const aCount = S.validCases().length;
console.log("Project A cases:", aCount, "| Project B cases:", bCount, "| isolated:", aCount !== bCount);
const port = S.portfolio();
console.log("Portfolio rows:", port.length, "| names:", port.map(p => p.name).join(", "));
S.setBrand({ company: "Acme Eng", accent: "#7030a0" });
console.log("Brand:", S.brand().company, S.brand().accent);
S.setAi({ key: "sk-test", model: "gpt-4o-mini" });
console.log("AI key stored:", !!S.aiSettings().key);
S.switchProject(npId); const delOk = S.deleteProject(npId);
console.log("Delete project B:", delOk, "-> projects now:", S.listProjects().length);
const ok3 = S.listProjects().length === projs0 && port.length === projs0 + 1 && S.brand().company === "Acme Eng";
console.log(ok3 ? "WORKSPACE TESTS PASS" : "WORKSPACE TESTS FAIL");


// --- engineering registers + EVM ---
console.log("\n-- registers & EVM --");
S.reset();
console.log("Register types:", C.REGISTERS.length, C.REGISTERS.map(r => r.id).join(","));
console.log("HAZOP seeded rows:", S.regRows("hazop").length);
const nr = S.regAdd("calibration", { tag: "FT-9", instrument: "Flow", lastCal: "2025-01-01", interval: 12 });
const calRows = S.regRows("calibration");
console.log("Calibration rows after add:", calRows.length);
// computed: next due + status for the new row (lastCal 2025-01-01 + 12mo = 2026-01-01 -> overdue today 2026)
const calCol = C.REGISTERS.find(r => r.id === "calibration").columns;
const nextDue = calCol.find(c => c.key === "nextDue").compute(nr);
const calState = calCol.find(c => c.key === "calState").compute(nr);
console.log("Calibration nextDue:", nextDue, "state:", calState);
S.regUpdate("calibration", nr._id, { result: "Pass" });
console.log("Update result:", S.regRows("calibration").find(r => r._id === nr._id).result);
S.regDelete("calibration", nr._id);
console.log("Rows after delete:", S.regRows("calibration").length);
// HAZOP risk compute
const hz = S.regRows("hazop")[0];
const hzRisk = C.REGISTERS.find(r => r.id === "hazop").columns.find(c => c.key === "risk").compute(hz);
console.log("HAZOP row1 risk (5x2):", hzRisk);
// EVM
const ev = S.evm();
console.log("EVM bac/ev/ac:", Math.round(ev.bac), Math.round(ev.ev), Math.round(ev.ac), "CPI:", ev.cpi.toFixed(2), "SPI:", ev.spi.toFixed(2));
// snapshot includes registers
S.regAdd("ncr", { desc: "snap test", severity: "Major" });
const snapN = S.takeSnapshot("reg snap");
S.regDelete("ncr", S.regRows("ncr")[0]._id);
S.restoreSnapshot(snapN.id);
const ncrBack = S.regRows("ncr").length === 1;
console.log("Registers restored via snapshot:", ncrBack);
const ok4 = C.REGISTERS.length >= 11 && hzRisk === 10 && ev.bac === 42500 && ncrBack && calState === "Overdue";
console.log(ok4 ? "REGISTER/EVM TESTS PASS" : "REGISTER/EVM TESTS FAIL");
