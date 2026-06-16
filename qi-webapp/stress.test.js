/* Exhaustive engine property/fuzz harness for the QI Platform.
 *
 * Runs thousands of randomized + boundary inputs ("every question") against
 * every QIBrain engine and asserts mathematical/structural invariants hold:
 * no throws, no NaN/Infinity, conservation/reconciliation, ordered percentiles,
 * monotonicity, bounded outputs, cross-tier integrity and determinism.
 *
 * Pure Node (no DOM). Deterministic via a seeded PRNG so failures reproduce.
 */
const B = require("./js/brain.js");

let checks = 0, fails = 0, cases = 0;
const failMsgs = [];
function ok(cond, msg) { checks++; if (!cond) { fails++; if (failMsgs.length < 50) failMsgs.push(msg); } }
function section(name) { console.log("\n--- " + name + " ---"); }

// Seeded LCG PRNG (reproducible).
function makeRng(seed) { let s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const R = makeRng(0xC0FFEE);
function pick(a) { return a[Math.floor(R() * a.length)]; }
function rint(lo, hi) { return lo + Math.floor(R() * (hi - lo + 1)); }
function finiteDeep(o) {
  try { JSON.stringify(o, function (k, v) { if (typeof v === "number" && !isFinite(v)) throw 0; return v; }); return true; }
  catch (e) { return false; }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function call(fn, label) { try { return fn(); } catch (e) { ok(false, label + " threw: " + e.message); return null; } }

// ===== 1. Wavelength Assignment Planner =====
section("Wavelength planner fuzz");
(function () {
  const bands = ["C", "L", "C+L"], spacings = [12.5, 25, 50, 100], rates = [100, 200, 400, 600, 800];
  for (let i = 0; i < 800; i++) {
    cases++;
    const band = pick(bands), sp = pick(spacings), br = pick(rates), pairs = rint(1, 16), nd = pick([0, 0, 10, 50, 200, 400]);
    const demands = []; for (let d = 0; d < nd; d++) demands.push({ label: "D" + d, capacityGbps: pick([100, 200, 400]) });
    const r = call(function () { return B.planWavelengths({ band: band, spacingGHz: sp, bitratePerChannelGbps: br, fiberPairs: pairs, demands: demands }); }, "planWavelengths");
    if (!r) continue;
    ok(finiteDeep(r), "wl no NaN/Inf");
    ok(r.channelsPerPair > 0, "wl channels>0");
    ok(r.capacityPerPairTbps === Math.round(r.channelsPerPair * br / 1000 * 100) / 100, "wl capacity/pair = ch*bitrate/1000");
    ok(r.systemCapacityTbps === Math.round(r.capacityPerPairTbps * pairs * 100) / 100, "wl system = cap/pair*pairs");
    ok(r.spectralEfficiency === Math.round(br / sp * 1000) / 1000, "wl SE = bitrate/spacing");
    ok(r.assignment.assigned + r.assignment.blocked === demands.length, "wl assigned+blocked = demands");
    ok(r.assignment.usedSlots <= r.assignment.totalSlots, "wl used<=total slots");
    ok(typeof r.feasibility.ok === "boolean", "wl feasibility boolean");
    // channels strictly increasing wavelength
    let mono = true; for (let k = 1; k < r.channels.length; k++) if (r.channels[k].wavelengthNm < r.channels[k - 1].wavelengthNm) mono = false;
    ok(mono, "wl channels sorted by wavelength");
  }
  ok(eq(B.planWavelengths({ band: "C+L", spacingGHz: 50, bitratePerChannelGbps: 400, fiberPairs: 8 }), B.planWavelengths({ band: "C+L", spacingGHz: 50, bitratePerChannelGbps: 400, fiberPairs: 8 })), "wl deterministic");
})();

// ===== 2. Latency Calculator =====
section("Latency calculator fuzz");
(function () {
  const fibers = ["G.652.D", "G.654.E", "G.655", "G.657.A1"];
  for (let i = 0; i < 800; i++) {
    cases++;
    const route = rint(1, 20000), slack = pick([0, 3, 5, 7, 10, 15, 20]), ft = pick(fibers);
    const r = call(function () { return B.calcLatency({ routeKm: route, fiberType: ft, slackPct: slack, regenCount: rint(0, 6), roadmCount: rint(0, 10), fecEnabled: R() > 0.5 }); }, "calcLatency");
    if (!r) continue;
    ok(finiteDeep(r), "lat no NaN/Inf");
    ok(r.oneWayMs > 0 && r.rttMs > 0, "lat one-way & rtt > 0");
    ok(Math.abs(r.rttMs - r.oneWayMs * 2) < 1e-6, "lat rtt = 2*oneway");
    ok(r.fiberLengthKm === Math.round(route * (1 + slack / 100) * 100) / 100, "lat fibre length = route*(1+slack)");
    ok(r.vacuum.oneWayMs <= r.oneWayMs + 1e-9, "lat vacuum floor <= fibre one-way");
    ok(["Good", "Acceptable", "Poor"].indexOf(r.g114Verdict.rating) >= 0, "lat G.114 rating valid");
    ok(r.geoSatellite.fiberFasterTimes > 0, "lat fibre faster than GEO");
  }
  // monotonic in route length
  let prev = -1, monoOk = true;
  [100, 500, 1000, 3000, 8000, 15000].forEach(function (km) { var v = B.calcLatency({ routeKm: km, slackPct: 7 }).oneWayMs; if (v < prev) monoOk = false; prev = v; });
  ok(monoOk, "lat one-way latency increases monotonically with route length");
  ok(eq(B.calcLatency({ routeKm: 4321, slackPct: 7, regenCount: 2 }), B.calcLatency({ routeKm: 4321, slackPct: 7, regenCount: 2 })), "lat deterministic");
})();

// ===== 3. Cable Protection =====
section("Cable protection fuzz");
(function () {
  const lv = ["high", "medium", "low", "none"], seabeds = ["sand", "mud", "rock", "coral", "mixed"];
  for (let i = 0; i < 600; i++) {
    cases++;
    const route = rint(100, 10000);
    const r = call(function () { return B.assessCableProtection({ routeKm: route, trawlingIntensity: pick(lv), anchoringActivity: pick(lv), seabed: pick(seabeds), seismicZone: R() > 0.5 }); }, "assessCableProtection");
    if (!r) continue;
    ok(finiteDeep(r), "cp no NaN/Inf");
    ok(r.segments.every(function (s) { return s.residualScore <= s.threatScore + 1e-9; }), "cp residual <= threat");
    ok(r.segments.every(function (s) { return ["Critical", "High", "Medium", "Low", "Minimal"].indexOf(s.threatLevel) >= 0; }), "cp threat level valid");
    ok(r.segments.every(function (s) { return s.recommendedBurialM >= 0; }), "cp burial >= 0");
    ok(r.summary.protectionAdequacyPct >= 0 && r.summary.protectionAdequacyPct <= 100, "cp adequacy 0..100");
    ok(Math.abs((r.summary.protectedKm + r.summary.surfaceLaidKm) - r.summary.totalAssessedKm) <= 1, "cp protected+surface = assessed");
  }
})();

// ===== 4. Build sequence =====
section("Build sequence fuzz");
(function () {
  for (let i = 0; i < 150; i++) {
    cases++;
    // random small networks
    const n = rint(2, 6); const stations = []; for (let s = 0; s < n; s++) stations.push({ id: "N" + s, name: "N" + s + " CLS", country: "C" + s, lon: 100 + R() * 40, lat: -5 + R() * 30 });
    const segments = []; for (let s = 1; s < n; s++) segments.push({ id: "S" + s, from: "N" + (s - 1), to: "N" + s, cableType: pick(["G.654.E", "G.652.D"]) });
    const r = call(function () { return B.generateBuildSequence({ stations: stations, segments: segments }); }, "generateBuildSequence");
    if (!r) continue;
    ok(finiteDeep(r), "build no NaN/Inf");
    ok(r.steps.length > 0, "build has steps");
    let mono = true, prev = -1; r.steps.forEach(function (st) { if (st.laidKm < prev) mono = false; prev = st.laidKm; });
    ok(mono, "build laidKm monotonic");
    ok(r.steps[r.steps.length - 1].progressPct === 100, "build ends at 100%");
    ok(r.summary.totalSegments === segments.length && r.summary.totalStations === stations.length, "build scene matches input");
  }
  const def = B.generateBuildSequence();
  ok(def.summary.phases.length === 6, "build default has 6 phases");
  ok(eq(def, B.generateBuildSequence()), "build deterministic");
})();

// ===== 5. Disbursement =====
section("Disbursement fuzz");
(function () {
  for (let i = 0; i < 500; i++) {
    cases++;
    const total = pick([1e8, 5e8, 1.3e9, 2e9, 7.5e8]), months = rint(12, 84), ret = pick([0, 5, 10]), adv = pick([0, 10, 15]);
    const asOf = rint(0, months);
    const r = call(function () { return B.disbursementForecast({ totalUsd: total, months: months, retentionPct: ret, advancePct: adv, asOfMonth: asOf }); }, "disbursementForecast");
    if (!r) continue;
    ok(finiteDeep(r), "disb no NaN/Inf");
    ok(r.schedule.length === months, "disb schedule length = months");
    let mono = true, prev = -1; r.schedule.forEach(function (x) { if (x.cumulativeUsd < prev) mono = false; prev = x.cumulativeUsd; });
    ok(mono, "disb cumulative monotonic");
    const sumNet = r.schedule.reduce(function (a, x) { return a + x.netPaymentUsd; }, 0);
    ok(Math.abs(sumNet - total) <= months + 5, "disb net payments reconcile to total");
    const ccSum = r.byCountry.reduce(function (a, c) { return a + c.allocationUsd; }, 0);
    ok(Math.abs(ccSum - total) <= 10, "disb country allocation reconciles to total");
    ok(r.lenderReport.disbursedToDateUsd + r.lenderReport.forecastToCompleteUsd === total, "disb disbursed+FTC = total");
  }
  ok(eq(B.disbursementForecast(), B.disbursementForecast()), "disb deterministic");
})();

// ===== 6. Variation impact =====
section("Variation impact fuzz");
(function () {
  for (let i = 0; i < 200; i++) {
    cases++;
    const sum = pick([1e8, 4.2e8, 6.5e8, 1.3e9]), ret = pick([0, 5, 10]);
    const r = call(function () { return B.variationImpact({ contractSumUsd: sum, retentionPct: ret }); }, "variationImpact");
    if (!r) continue;
    ok(finiteDeep(r), "var no NaN/Inf");
    ok(r.summary.revisedContractSumUsd === r.summary.originalContractSumUsd + r.summary.approvedVariationsUsd, "var revised = orig + approved");
    ok(r.summary.counts.approved + r.summary.counts.pending + r.summary.counts.rejected === r.summary.total, "var status counts reconcile");
    ok(r.summary.retentionOnRevisedUsd === Math.round(r.summary.revisedContractSumUsd * ret / 100), "var retention on revised");
  }
  ok(eq(B.variationImpact(), B.variationImpact()), "var deterministic");
})();

// ===== 7. ITP =====
section("ITP fuzz");
(function () {
  cases++;
  const r = B.generateITP();
  ok(r.summary.holdPoints + r.summary.witnessPoints + r.summary.surveillancePoints + r.summary.reviewPoints === r.summary.total, "itp counts reconcile");
  ok(r.items.filter(function (x) { return x.raisesNcrOnFail; }).length === r.summary.ncrTriggers, "itp NCR triggers = H+W");
  ok(r.items.every(function (x) { return (x.point === "H" || x.point === "W") === x.raisesNcrOnFail; }), "itp NCR flag aligns with H/W");
  ok(eq(r, B.generateITP()), "itp deterministic");
})();

// ===== 8. Route progress =====
section("Route progress fuzz");
(function () {
  const ids = ["S1", "S2", "S3", "S4", "S5", "S6", "S7"];
  for (let i = 0; i < 500; i++) {
    cases++;
    const prog = {}; ids.forEach(function (id) { if (R() > 0.3) prog[id] = rint(0, 100); });
    const r = call(function () { return B.routeProgress({ progress: prog, plannedPct: rint(0, 100) }); }, "routeProgress");
    if (!r) continue;
    ok(finiteDeep(r), "rp no NaN/Inf");
    ok(r.segments.reduce(function (a, s) { return a + s.kmLaid; }, 0) === r.summary.kmLaid, "rp km laid sums");
    ok(r.summary.kmLaid + r.summary.remainingKm === r.summary.totalKm, "rp laid+remaining=total");
    ok(r.summary.overallPct >= 0 && r.summary.overallPct <= 100, "rp overall 0..100");
    ok(["Ahead", "On track", "Behind"].indexOf(r.summary.schedule) >= 0, "rp schedule verdict valid");
    ok(r.segments.every(function (s) { return s.kmLaid === Math.round(s.lengthKm * s.pctComplete / 100); }), "rp km laid consistent with %");
  }
})();

// ===== 9. Weather windows =====
section("Weather windows fuzz");
(function () {
  for (let i = 1; i <= 8; i++) {
    cases++;
    const r = B.weatherWindows({ requiredCountries: i });
    ok(r.monthly.length === 12, "wx 12 months");
    ok(r.monthly.every(function (m) { return m.operableCount + m.restrictedCountries.length === r.summary.countries; }), "wx operable+restricted = countries");
    ok(r.summary.campaignWindow === null || (r.summary.campaignWindow.months >= 1 && r.summary.campaignWindow.months <= 12), "wx campaign window valid");
  }
  ok(eq(B.weatherWindows(), B.weatherWindows()), "wx deterministic");
})();

// ===== 10. Programme packages + work orders (hierarchy integrity) =====
section("WBS + work orders fuzz");
(function () {
  cases++;
  const pk = B.programmePackages();
  ok(pk.packages.reduce(function (a, p) { return a + p.earnedValueUsd; }, 0) === pk.summary.earnedValueUsd, "pkg earned sums");
  ok(pk.summary.byCategory.reduce(function (a, c) { return a + c.valueUsd; }, 0) === pk.summary.totalValueUsd, "pkg category reconciles");
  ok(pk.summary.byContractType.reduce(function (a, c) { return a + c.valueUsd; }, 0) === pk.summary.totalValueUsd, "pkg contract-form reconciles");
  const pkgIds = pk.packages.map(function (p) { return p.id; });
  const wo = B.workOrders();
  ok(wo.workOrders.every(function (w) { return pkgIds.indexOf(w.packageId) >= 0; }), "WO hierarchy integrity (every WO -> real package)");
  ok(wo.summary.statusCounts["Complete"] + wo.summary.statusCounts["In progress"] + wo.summary.statusCounts["Not started"] === wo.summary.total, "WO status reconciles");
  pkgIds.forEach(function (id) { cases++; const f = B.workOrders({ packageId: id }); ok(f.workOrders.every(function (w) { return w.packageId === id; }), "WO filter " + id); });
  ok(eq(pk, B.programmePackages()) && eq(wo, B.workOrders()), "WBS/WO deterministic");
})();

// ===== 11. Programme status report =====
section("Programme status report fuzz");
(function () {
  for (let i = 0; i < 300; i++) {
    cases++;
    const r = call(function () {
      return B.programmeStatusReport({ route: { plannedPct: rint(0, 100) }, contract: { contractSumUsd: pick([1e8, 4.2e8, 1.3e9]) }, disbursement: { months: rint(24, 72) } });
    }, "programmeStatusReport");
    if (!r) continue;
    ok(finiteDeep(r), "psr no NaN/Inf");
    ok(["Green", "Amber", "Red"].indexOf(r.rag) >= 0, "psr RAG valid");
    ok(r.alerts.length >= 1 && r.alerts.every(function (a) { return a.level && a.text; }), "psr alerts well-formed");
    ok(r.sections.progress && r.sections.finance && r.sections.contract && r.sections.quality && r.sections.marine, "psr all sections present");
  }
})();

// ===== 12. Quantitative risk (Monte Carlo) =====
section("Quantitative risk fuzz");
(function () {
  for (let i = 0; i < 200; i++) {
    cases++;
    const nc = rint(1, 10), cs = []; for (let c = 0; c < nc; c++) cs.push({ id: "c" + c, problem: "p" + c, estCost: rint(1000, 500000), sev: rint(1, 10), occ: rint(1, 10), det: rint(1, 10), _brain: "task" });
    const seed = rint(1, 9999);
    const r = call(function () { return B.riskQuantification({ cases: cs, options: { seed: seed, iterations: 500 } }); }, "riskQuantification");
    if (!r) continue;
    ok(finiteDeep(r), "qr no NaN/Inf");
    ok(r.cost.p50 <= r.cost.p80 + 1e-6 && r.cost.p80 <= r.cost.p90 + 1e-6, "qr cost percentiles ordered");
    ok(r.schedule.p50 <= r.schedule.p80 + 1e-6 && r.schedule.p80 <= r.schedule.p90 + 1e-6, "qr schedule percentiles ordered");
    ok(r.cost.p90 >= r.summary.totalBaseEstimate - 1e-6, "qr p90 >= base estimate");
    ok(r.summary.recommendedContingency.p90Amount >= r.summary.recommendedContingency.p80Amount - 1e-6, "qr p90 contingency >= p80");
    ok(eq(r, B.riskQuantification({ cases: cs, options: { seed: seed, iterations: 500 } })), "qr deterministic with seed");
  }
})();

// ===== 13. Country intelligence =====
section("Country intelligence fuzz");
(function () {
  const all = B.listCountries();
  ok(all.length === 8, "ci 8 countries");
  all.forEach(function (c) {
    cases++;
    ok(B.getCountryInfo(c.code) && B.getCountryInfo(c.code).code === c.code, "ci lookup by code " + c.code);
    ["Cable Landing Permits", "Marine Installation", "Route Survey", "System Testing", "Feasibility"].forEach(function (ph) {
      cases++;
      const a = B.authoritiesForPhase(c.code, ph);
      ok(a && ["feasibility", "permitting", "construction", "operations"].indexOf(a.group) >= 0, "ci phase group valid " + c.code + "/" + ph);
    });
  });
  ok(B.getCountryInfo("Atlantis") === null, "ci unknown -> null");
})();

// ===== 14. analyzeProject (auto-planner) =====
section("analyzeProject fuzz");
(function () {
  const frags = ["submarine fibre cable", "FTTH GPON", "OTDR splicing", "marine survey", "route 3000 km", "landing in Indonesia",
    "Philippines and Taiwan", "Vietnam branch", "data centre", "power cable", "18 months", "trenching HDD", "commissioning"];
  for (let i = 0; i < 300; i++) {
    cases++;
    let txt = ""; const k = rint(1, frags.length); for (let j = 0; j < k; j++) txt += pick(frags) + " ";
    const r = call(function () { return B.analyzeProject(txt); }, "analyzeProject");
    if (!r) continue;
    ok(finiteDeep(r), "ap no NaN/Inf");
    ok(Array.isArray(r.phases) && r.phases.length >= 1, "ap has phases");
    ok(r.milestones.length === r.phases.length, "ap one milestone per phase");
    ok(r.budget && r.budget.total >= 0, "ap budget total >= 0");
    ok(Array.isArray(r.phaseAuthorities), "ap phaseAuthorities array");
    ok(r.risks.every(function (x) { return x._brain === "risk"; }), "ap risks tagged");
    ok(eq(r, B.analyzeProject(txt)), "ap deterministic");
  }
})();

console.log("\n========================================");
console.log("STRESS: " + cases + " input cases, " + checks + " invariant checks, " + fails + " failures");
if (fails) { console.log("\nFirst failures:"); failMsgs.forEach(function (m) { console.log("  FAIL  " + m); }); }
console.log(fails === 0 ? "ALL STRESS INVARIANTS HELD" : fails + " STRESS FAILURES");
process.exit(fails ? 1 : 0);
