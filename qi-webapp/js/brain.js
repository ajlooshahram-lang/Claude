/* QI Platform — Project Brain.
 *
 * A deterministic, OFFLINE project analyzer. It reads a free-text project
 * description and produces a complete management plan: a work-breakdown of
 * phases & tasks, a risk set, milestones, a procurement list and a budget
 * skeleton, plus the roles that should own the work.
 *
 * Design rules:
 *  - 100% local & deterministic. No network calls, no external AI. The project
 *    description never leaves the machine. (An external AI provider can be
 *    layered on later, but it is NOT used here.)
 *  - Pure functions only — fully testable headlessly in Node.
 *  - Domain-aware via pluggable "profiles". A fibre/telecom profile is built in
 *    (the primary use case); a generic PM profile is the safe fallback.
 *  - It STRUCTURES and PLANS. It does not pretend to execute physical work.
 */
(function (root) {
  "use strict";

  // ---- small helpers -------------------------------------------------------
  function norm(t) { return String(t == null ? "" : t).toLowerCase(); }
  function uniq(a) { return Array.from(new Set(a)); }
  function round(n) { return Math.round(Number(n) || 0); }

  // Count weighted keyword hits. `words` is [term, weight?][] or string[].
  function scoreKeywords(text, words) {
    const t = norm(text);
    let score = 0; const matched = [];
    words.forEach(w => {
      const term = Array.isArray(w) ? w[0] : w;
      const weight = Array.isArray(w) ? (w[1] || 1) : 1;
      // word-ish boundary match, case-insensitive
      const re = new RegExp("(^|[^a-z0-9])" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)", "i");
      if (re.test(t)) { score += weight; matched.push(term); }
    });
    return { score, matched: uniq(matched) };
  }

  // Pull the first non-empty line as a working title.
  function deriveTitle(text) {
    const line = String(text || "").split(/\r?\n/).map(s => s.trim()).find(Boolean) || "Untitled project";
    return line.replace(/^#+\s*/, "").slice(0, 80);
  }

  // Extract a number that appears before any of the given unit tokens.
  // e.g. firstQuantity(text, ["km","kilometre"]) on "1,200 km route" -> 1200
  function firstQuantity(text, units) {
    const t = norm(text);
    for (const u of units) {
      const re = new RegExp("([0-9][0-9.,]*)\\s*(?:" + u + ")\\b", "i");
      const m = t.match(re);
      if (m) {
        const n = parseFloat(m[1].replace(/,/g, ""));
        if (isFinite(n)) return n;
      }
    }
    return null;
  }

  // Detect quantitative scale signals in the description.
  function extractScale(text) {
    const routeKm = firstQuantity(text, ["km", "kilometre", "kilometer", "kilometres", "kilometers"]);
    const sites = firstQuantity(text, ["sites", "site", "nodes", "node", "pops", "pop", "huts", "bts", "towers", "tower"]);
    const homes = firstQuantity(text, ["homes passed", "homes", "premises", "households", "subscribers", "customers"]);
    const cores = firstQuantity(text, ["core fibre", "core fiber", "cores", "core", "fibres", "fibers"]);
    const months = firstQuantity(text, ["months", "month"]);
    const budget = firstQuantity(text, ["usd", "eur", "dkk", "million", "m usd", "budget"]);
    return {
      routeKm: routeKm || null,
      sites: sites || null,
      homesPassed: homes || null,
      cores: cores || null,
      durationMonths: months || null,
      statedBudget: budget || null,
    };
  }

  // ---- case factory --------------------------------------------------------
  // Maps a planned task into the platform's "case" shape (drives FMEA/RPN,
  // schedule, budget, etc.). Keep field vocabulary consistent with the app.
  function mkCase(o) {
    return {
      problem: o.problem,
      category: o.category || "Process / Flow",
      priority: o.priority || "3-MEDIUM",
      sev: o.sev != null ? o.sev : 3,
      occ: o.occ != null ? o.occ : 3,
      det: o.det != null ? o.det : 3,
      rootCause: o.rootCause || "",
      leanMethod: o.leanMethod || "Standard Work",
      owner: o.owner || "PM",
      target: o.target || "",
      startDate: o.startDate || "",
      status: o.status || "OPEN",
      percent: o.percent != null ? o.percent : 0,
      costCat: o.costCat || "Other",
      estCost: o.estCost != null ? o.estCost : 0,
      actCost: 0,
      whys: ["", "", "", "", ""],
      _brain: o._brain || "task",
      _phase: o._phase || "",
    };
  }

  // ---- FIBRE / TELECOM profile --------------------------------------------
  const fibreProfile = {
    id: "fibre-telecom",
    label: "Fibre / Telecom network deployment",
    keywords: [
      ["fibre", 3], ["fiber", 3], ["ftth", 3], ["fttx", 3], ["gpon", 3], ["xgs-pon", 3],
      ["otdr", 3], ["splice", 3], ["splicing", 3], ["duct", 2], ["trench", 2], ["trenching", 2],
      ["hdd", 2], ["blowing", 2], ["backbone", 2], ["last mile", 2], ["homes passed", 2],
      ["odn", 2], ["olt", 2], ["onu", 2], ["right of way", 2], ["row", 1], ["dark fibre", 2],
      ["telecom", 2], ["broadband", 2], ["network", 1], ["cable", 1], ["closure", 1], ["pop", 1],
    ],
    roles: ["Project Manager", "Survey Lead", "Permitting Officer", "Civil Works Lead",
      "OSP Engineer", "Splicing Supervisor", "Test & Commissioning Lead", "QA/QC Manager",
      "Procurement Lead", "HSE Officer", "Regional Coordinator"],

    // Phase templates → tasks. Costs scale with detected route length when present.
    buildPhases: function (scale) {
      const km = scale.routeKm || 100; // default assumption when not stated
      const civilPerKm = 18000, cablePerKm = 4200, blowPerKm = 2500; // indicative unit costs (USD)
      return [
        { name: "Survey & Design", owner: "Survey Lead", tasks: [
          { problem: "Route survey & site walk-out", costCat: "External / Consultant", estCost: round(km * 150), leanMethod: "Value Stream Mapping" },
          { problem: "High- & low-level network design (HLD/LLD)", costCat: "Tooling / Software", estCost: 25000 },
          { problem: "Bill of quantities & link budget", costCat: "Tooling / Software", estCost: 8000 },
        ]},
        { name: "Permitting & Right-of-Way", owner: "Permitting Officer", tasks: [
          { problem: "Secure wayleaves / right-of-way permits", costCat: "External / Consultant", estCost: round(km * 400), priority: "2-HIGH", sev: 6 },
          { problem: "Municipal & utility crossing approvals", costCat: "External / Consultant", estCost: round(km * 120), priority: "2-HIGH", sev: 6 },
        ]},
        { name: "Civil Works", owner: "Civil Works Lead", tasks: [
          { problem: "Trenching / ducting / HDD along route", costCat: "External / Consultant", estCost: round(km * civilPerKm), priority: "2-HIGH" },
          { problem: "Handhole / chamber & POP civil build", costCat: "External / Consultant", estCost: round((scale.sites || 10) * 3500) },
        ]},
        { name: "Cable Installation", owner: "OSP Engineer", tasks: [
          { problem: "Fibre cable blowing / pulling", costCat: "Labour / Effort", estCost: round(km * blowPerKm) },
          { problem: "Cable & closure materials", costCat: "Materials", estCost: round(km * cablePerKm) },
        ]},
        { name: "Splicing & Termination", owner: "Splicing Supervisor", tasks: [
          { problem: "Fusion splicing at joints & closures", costCat: "Labour / Effort", estCost: round(km * 900) },
          { problem: "Termination at POPs / distribution points", costCat: "Labour / Effort", estCost: round((scale.sites || 10) * 1200) },
        ]},
        { name: "Testing & Commissioning", owner: "Test & Commissioning Lead", tasks: [
          { problem: "OTDR bi-directional testing & loss budget verification", costCat: "Tooling / Software", estCost: round(km * 200), sev: 5, leanMethod: "Mistake-Proofing / Poka-Yoke" },
          { problem: "End-to-end light/power-meter acceptance tests", costCat: "Tooling / Software", estCost: 15000, sev: 5 },
        ]},
        { name: "Handover & As-Built", owner: "QA/QC Manager", tasks: [
          { problem: "As-built documentation & GIS records", costCat: "Tooling / Software", estCost: 12000 },
          { problem: "Customer/operator handover & snag closure", costCat: "Labour / Effort", estCost: 9000 },
        ]},
      ];
    },

    // Domain-specific risks (mapped to cases so they surface in FMEA/RPN).
    buildRisks: function () {
      return [
        { problem: "RISK: Permitting / right-of-way delays stall civil works", category: "Delivery / Schedule", sev: 8, occ: 7, det: 4, priority: "1-CRITICAL", rootCause: "Multi-authority approvals on critical path" },
        { problem: "RISK: Monsoon / adverse weather halts trenching", category: "Delivery / Schedule", sev: 7, occ: 6, det: 3, priority: "2-HIGH", rootCause: "Seasonal climate in region" },
        { problem: "RISK: Fibre cut / damage by third-party excavation", category: "Quality / Defects", sev: 8, occ: 5, det: 5, priority: "2-HIGH", rootCause: "Shared trenches / poor as-built awareness" },
        { problem: "RISK: Splice loss exceeds budget (high OTDR loss)", category: "Quality / Defects", sev: 7, occ: 4, det: 4, priority: "2-HIGH", rootCause: "Operator skill / dirty connectors" },
        { problem: "RISK: Cable & closure supply-chain lead-time slip", category: "Delivery / Schedule", sev: 7, occ: 6, det: 4, priority: "2-HIGH", rootCause: "Long-lead imported materials" },
        { problem: "RISK: Contractor quality variance across regions", category: "Quality / Defects", sev: 6, occ: 6, det: 5, priority: "2-HIGH", rootCause: "Multiple subcontractors, weak standardisation" },
      ];
    },

    buildProcurement: function (scale) {
      const km = scale.routeKm || 100;
      return [
        { package: "Fibre optic cable (per route-km)", vendor: "TBD", value: round(km * 4200), poStatus: "RFQ", owner: "Procurement Lead" },
        { package: "Splice closures & enclosures", vendor: "TBD", value: round((scale.sites || 10) * 1800), poStatus: "RFQ", owner: "Procurement Lead" },
        { package: "Ducts & sub-ducts", vendor: "TBD", value: round(km * 2600), poStatus: "RFQ", owner: "Procurement Lead" },
        { package: "OTDR & test equipment", vendor: "TBD", value: 45000, poStatus: "Planned", owner: "Test & Commissioning Lead" },
      ];
    },
  };

  // ---- GENERIC PM profile (fallback) --------------------------------------
  const genericProfile = {
    id: "generic-pm",
    label: "General project (generic PM)",
    keywords: [["project", 1]],
    roles: ["Project Manager", "Workstream Lead", "Quality Manager", "Procurement Lead", "Finance Partner"],
    buildPhases: function () {
      return [
        { name: "Initiation", owner: "PM", tasks: [
          { problem: "Define scope, objectives & success criteria", leanMethod: "Standard Work", estCost: 5000, costCat: "Labour / Effort" },
          { problem: "Stakeholder map & RACI", estCost: 2000, costCat: "Labour / Effort" },
        ]},
        { name: "Planning", owner: "PM", tasks: [
          { problem: "Work breakdown, schedule & budget baseline", estCost: 8000, costCat: "Labour / Effort" },
          { problem: "Risk register & mitigation plan", estCost: 3000, costCat: "Labour / Effort", sev: 6 },
        ]},
        { name: "Execution", owner: "Workstream Lead", tasks: [
          { problem: "Deliver core workstreams", estCost: 40000, costCat: "External / Consultant", priority: "2-HIGH" },
          { problem: "Procure goods & services", estCost: 15000, costCat: "Materials" },
        ]},
        { name: "Monitoring & Control", owner: "Quality Manager", tasks: [
          { problem: "Track EVM, quality & change control", estCost: 6000, costCat: "Tooling / Software", sev: 5 },
        ]},
        { name: "Closure", owner: "PM", tasks: [
          { problem: "Acceptance, handover & lessons learned", estCost: 4000, costCat: "Labour / Effort" },
        ]},
      ];
    },
    buildRisks: function () {
      return [
        { problem: "RISK: Scope creep erodes schedule & budget", category: "Process / Flow", sev: 7, occ: 6, det: 4, priority: "2-HIGH", rootCause: "Weak change control" },
        { problem: "RISK: Key resource unavailability", category: "People / Training", sev: 6, occ: 5, det: 4, priority: "2-HIGH", rootCause: "Single points of dependency" },
        { problem: "RISK: Supplier / procurement delay", category: "Delivery / Schedule", sev: 6, occ: 5, det: 4, priority: "2-HIGH", rootCause: "Long lead items" },
      ];
    },
    buildProcurement: function () {
      return [{ package: "Core goods & services", vendor: "TBD", value: 20000, poStatus: "RFQ", owner: "Procurement Lead" }];
    },
  };

  const PROFILES = [fibreProfile, genericProfile];

  // Resolve the bundled Country Intelligence module. In the browser it is a
  // global (window.QICountryData, loaded before this script); under Node it is
  // required relatively so headless tests can exercise the same logic. Either
  // way the Brain stays 100% offline — the data is static & local.
  function getCountryData() {
    if (root && root.QICountryData) return root.QICountryData;
    if (typeof require !== "undefined") {
      try { return require("./country-data.js"); } catch (e) { /* not present */ }
    }
    return null;
  }

  function pickProfile(text, forcedId) {
    if (forcedId) {
      const f = PROFILES.find(p => p.id === forcedId);
      if (f) return { profile: f, score: Infinity, matched: [] };
    }
    let best = { profile: genericProfile, score: 0, matched: [] };
    PROFILES.forEach(p => {
      const r = scoreKeywords(text, p.keywords);
      if (r.score > best.score) best = { profile: p, score: r.score, matched: r.matched };
    });
    return best;
  }

  // Build a milestone row from a phase (schedule spread across stated duration).
  function buildMilestones(phases, scale) {
    const total = phases.length || 1;
    const months = scale.durationMonths || total * 2;
    return phases.map((ph, i) => {
      const m = Math.max(1, round(((i + 1) / total) * months));
      return { milestone: ph.name + " complete", baseline: "M+" + m, forecast: "M+" + m, actual: "", status: i === 0 ? "In progress" : "Planned", owner: ph.owner || "PM" };
    });
  }

  function aggregateBudget(cases, procurement) {
    const by = {};
    cases.forEach(c => { by[c.costCat] = (by[c.costCat] || 0) + (Number(c.estCost) || 0); });
    (procurement || []).forEach(p => { by["Materials"] = (by["Materials"] || 0) + (Number(p.value) || 0); });
    const rows = Object.keys(by).map(k => ({ category: k, est: round(by[k]) }));
    const total = rows.reduce((s, r) => s + r.est, 0);
    rows.push({ category: "Contingency (10%)", est: round(total * 0.1) });
    return { rows, total: round(total * 1.1) };
  }

  // ---- Advisor (the integrated "AI brain") --------------------------------
  // Turns the analysis + frameworks into a short, PRIORITISED, plain-language
  // action list so a user with no project-management background knows exactly
  // what to do first to reach the best result. 100% deterministic & offline.
  function buildAdvice(input) {
    input = input || {};
    const fw = input.frameworks || null;
    const risks = input.risks || [];
    const intel = input.countryIntel || [];
    const recs = [];      // { priority, title, text, why }
    const nextSteps = [];

    // 1) The single most schedule-defining move: start the slowest approval.
    if (fw && fw.licensing && fw.licensing.countries && fw.licensing.countries.length) {
      const slowest = fw.licensing.countries.slice()
        .sort((a, b) => (b.criticalPathMonths || 0) - (a.criticalPathMonths || 0))[0];
      if (slowest && slowest.criticalPathMonths) {
        recs.push({
          priority: "Do first",
          title: "Start the slowest approval now",
          text: "Begin \u201c" + slowest.criticalPathItem + "\u201d with " + slowest.criticalPathAuthority + " in " + slowest.name + " straight away.",
          why: "At roughly " + slowest.criticalPathMonths + " months it is the longest approval in the whole programme, so it decides your earliest possible start date. Other tasks can catch up later \u2014 this one cannot."
        });
        nextSteps.push("Open the " + slowest.name + " permit track with " + slowest.criticalPathAuthority + ".");
      }
    }

    // 2) Lead with the most open markets; handle sensitive ones with care.
    if (fw && fw.marketEntry && fw.marketEntry.countries) {
      const go = fw.marketEntry.countries.filter(c => /^go$/i.test(c.verdict));
      const caution = fw.marketEntry.countries.filter(c => /caution/i.test(c.verdict));
      if (go.length) recs.push({
        priority: "Quick win",
        title: "Lead with the most open markets",
        text: "Start commercial talks in " + go.map(c => c.name).join(", ") + " first.",
        why: "These have the most open foreign-ownership rules, so deals close faster and take risk off the table early."
      });
      if (caution.length) recs.push({
        priority: "Watch",
        title: "Handle the sensitive markets carefully",
        text: "In " + caution.map(c => c.name).join(", ") + ", line up the right local partner before committing money.",
        why: "Tight ownership limits or a single available partner mean fewer fallback options if a deal stalls."
      });
    }

    // 3) Sole-partner markets — get written intent before designing the branch.
    if (fw && fw.landingPartners && fw.landingPartners.countries) {
      const thin = fw.landingPartners.countries.filter(c => (c.candidates || []).length <= 1);
      if (thin.length) recs.push({
        priority: "Watch",
        title: "Lock in the single-partner markets early",
        text: "In " + thin.map(c => c.name).join(", ") + " there is effectively one landing partner \u2014 get a written letter of intent before you design that branch.",
        why: "With no alternative supplier, the project is exposed if that one partner declines."
      });
    }

    // 4) The biggest risk (highest likelihood \u00d7 impact \u00d7 hard-to-catch).
    if (risks.length) {
      const top = risks.slice().sort((a, b) => (b.sev * b.occ * b.det) - (a.sev * a.occ * a.det))[0];
      if (top) recs.push({
        priority: "Mitigate",
        title: "Plan around the biggest risk",
        text: top.problem.replace(/^RISK:\s*/, ""),
        why: (top.rootCause ? "Main cause: " + top.rootCause + ". " : "") + "This scored highest on how likely it is, how damaging it would be, and how hard it is to spot in time \u2014 so build in margin (spare time, a backup route, or a second partner)."
      });
    }

    // 5) Seasonal weather windows (typhoon/monsoon) from country hazards.
    const weatherCountries = intel.filter(c =>
      (c.geographical || []).some(g => /typhoon|monsoon|cyclone|storm/i.test(g)))
      .map(c => c.name);
    if (weatherCountries.length) recs.push({
      priority: "Plan",
      title: "Schedule sea work around the weather",
      text: "Plan marine survey and cable-lay in " + weatherCountries.join(", ") + " for the calm season.",
      why: "Typhoon and monsoon seasons stop ships from working safely, so the calendar \u2014 not the budget \u2014 often controls these stretches."
    });

    if (nextSteps.indexOf("Review the auto-built plan, then click \u201cApply\u201d to load it into the project.") === -1) {
      nextSteps.push("Review the auto-built plan, then click \u201cApply\u201d to load it into the project.");
    }

    const headline = recs.length
      ? "Here is how to get the best result \u2014 " + recs.length + " priority moves, most important first. The app worked these out from your description."
      : "Add a project description (name the countries, or use the word \u201csubmarine\u201d) and the advisor will tell you exactly what to do first.";

    return { headline, recommendations: recs, nextSteps };
  }

  /**
   * Analyze a project description into a full management plan.
   * @param {string} text - the project description (stays local).
   * @param {object} [opts] - { profile?: "fibre-telecom"|"generic-pm" }
   */
  function analyzeProject(text, opts) {
    opts = opts || {};
    const picked = pickProfile(text, opts.profile);
    const profile = picked.profile;
    const scale = extractScale(text);

    const phases = profile.buildPhases(scale);
    const cases = [];
    phases.forEach((ph) => {
      (ph.tasks || []).forEach(t => {
        cases.push(mkCase(Object.assign({}, t, { owner: t.owner || ph.owner, _phase: ph.name, _brain: "task" })));
      });
    });
    const risks = (profile.buildRisks(text, scale) || []).map(r => mkCase(Object.assign({}, r, { leanMethod: r.leanMethod || "FMEA", _brain: "risk" })));
    const milestones = buildMilestones(phases, scale);
    const procurement = profile.buildProcurement(scale);

    // Coverage / confidence & honest warnings.
    const warnings = [];

    // ---- Country Intelligence (STP) -------------------------------------
    // For fibre/telecom plans, scan the description for the 8 STP countries.
    // Detected countries inject real regulatory permit tasks (naming the true
    // authority), FMEA-scored geopolitical/geographical risks and procurement
    // lines. A submarine/subsea project with no named country includes all 8.
    let countryIntel = [];
    let frameworks = null;
    if (profile.id === "fibre-telecom") {
      const CD = getCountryData();
      if (CD && typeof CD.detect === "function") {
        const det = CD.detect(text);
        if (det.countries.length) {
          CD.permitTaskCases(det.countries).forEach(t =>
            cases.push(mkCase(Object.assign({}, t, { _phase: t._phase || "Permitting & Right-of-Way", _brain: "task" }))));
          CD.riskCases(det.countries).forEach(r =>
            risks.push(mkCase(Object.assign({}, r, { leanMethod: r.leanMethod || "FMEA", _brain: "risk" }))));
          CD.procurementItems(det.countries).forEach(p => procurement.push(p));
          countryIntel = CD.summarize(det.countries);
          if (typeof CD.marketEntryFramework === "function") {
            frameworks = {
              marketEntry: CD.marketEntryFramework(det.countries),
              licensing: CD.licensingFramework(det.countries),
              landingPartners: CD.landingPartnerFramework(det.countries)
            };
          }
          if (det.signal === "submarine") warnings.push("No specific country named — included all 8 STP countries/territories because a submarine/subsea project was detected. Name countries to narrow the set.");
        } else {
          warnings.push("No STP country detected — add country names (e.g. Philippines, Taiwan) or the word 'submarine' to attach regulatory authorities and country-specific risks.");
        }
      }
    }

    const budget = aggregateBudget(cases.concat(risks), procurement);

    // The integrated advisor turns everything above into prioritised, plain
    // actions — so a single uploaded description yields a ready next-step list.
    const advice = buildAdvice({ frameworks, risks, countryIntel });

    // Domain & scale warnings.
    if (picked.profile.id === "generic-pm") warnings.push("Domain not confidently detected — used the generic PM template. Add more detail (e.g. 'fibre', 'OTDR', 'route km') for a tailored plan.");
    if (!scale.routeKm && profile.id === "fibre-telecom") warnings.push("No route length (km) detected — civil/cable budgets use a 100 km placeholder. Edit quantities after applying.");
    const confidence = profile.id === "generic-pm" ? 0.4 : Math.min(0.95, 0.55 + picked.score * 0.03);

    return {
      summary: {
        title: deriveTitle(text),
        domain: profile.id,
        domainLabel: profile.label,
        scale,
      },
      phases: phases.map(p => ({ name: p.name, owner: p.owner, taskCount: (p.tasks || []).length })),
      cases,
      risks,
      milestones,
      procurement,
      budget,
      roles: profile.roles,
      countryIntel,
      frameworks,
      advice,
      coverage: { profile: profile.id, confidence: Math.round(confidence * 100) / 100, matched: picked.matched, warnings },
    };
  }

  function listProfiles() { return PROFILES.map(p => ({ id: p.id, label: p.label })); }

  const API = { analyzeProject, listProfiles, extractScale, buildAdvice, _profiles: PROFILES };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.QIBrain = API;
})(typeof window !== "undefined" ? window : globalThis);
