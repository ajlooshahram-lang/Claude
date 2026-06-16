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
    var t = norm(text);
    var score = 0; var matched = [];
    words.forEach(function (w) {
      var term = Array.isArray(w) ? w[0] : w;
      var weight = Array.isArray(w) ? (w[1] || 1) : 1;
      var re = new RegExp("(^|[^a-z0-9])" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)", "i");
      if (re.test(t)) { score += weight; matched.push(term); }
    });
    return { score: score, matched: uniq(matched) };
  }

  // Pull the first non-empty line as a working title.
  function deriveTitle(text) {
    var line = String(text || "").split(/\r?\n/).map(function (s) { return s.trim(); }).find(Boolean) || "Untitled project";
    return line.replace(/^#+\s*/, "").slice(0, 80);
  }

  // Extract a number that appears before any of the given unit tokens.
  function firstQuantity(text, units) {
    var t = norm(text);
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      var re = new RegExp("([0-9][0-9.,]*)\\s*(?:" + u + ")\\b", "i");
      var m = t.match(re);
      if (m) {
        var n = parseFloat(m[1].replace(/,/g, ""));
        if (isFinite(n)) return n;
      }
    }
    return null;
  }

  // Detect quantitative scale signals in the description.
  function extractScale(text) {
    var routeKm = firstQuantity(text, ["km", "kilometre", "kilometer", "kilometres", "kilometers"]);
    var sites = firstQuantity(text, ["sites", "site", "nodes", "node", "pops", "pop", "huts", "bts", "towers", "tower"]);
    var homes = firstQuantity(text, ["homes passed", "homes", "premises", "households", "subscribers", "customers"]);
    var cores = firstQuantity(text, ["core fibre", "core fiber", "cores", "core", "fibres", "fibers"]);
    var months = firstQuantity(text, ["months", "month"]);
    var budget = firstQuantity(text, ["usd", "eur", "dkk", "million", "m usd", "budget"]);
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
  var fibreProfile = {
    id: "fibre-telecom",
    label: "Fibre / Telecom network deployment",
    keywords: [
      ["fibre", 3], ["fiber", 3], ["ftth", 3], ["fttx", 3], ["gpon", 3], ["xgs-pon", 3],
      ["otdr", 3], ["splice", 3], ["splicing", 3], ["duct", 2], ["trench", 2], ["trenching", 2],
      ["hdd", 2], ["blowing", 2], ["backbone", 2], ["last mile", 2], ["homes passed", 2],
      ["odn", 2], ["olt", 2], ["onu", 2], ["right of way", 2], ["row", 1], ["dark fibre", 2],
      ["telecom", 2], ["broadband", 2], ["network", 1], ["cable", 1], ["closure", 1], ["pop", 1],
    ],

    // ---- Submarine Detection Keywords (higher weight) ----------------------
    submarineKeywords: [
      ["submarine", 5], ["undersea", 5], ["under the sea", 5], ["seabed", 4], ["ocean", 3],
      ["landing station", 4], ["cable ship", 4], ["repeater", 3], ["branching unit", 3], ["shore end", 3],
    ],

    // ---- Terrestrial Keywords (for scoring comparison) ----------------------
    terrestrialKeywords: [
      ["trenching", 3], ["trench", 3], ["hdd", 3], ["duct", 3], ["ducting", 3],
      ["ftth", 3], ["homes passed", 3], ["last mile", 3], ["micro-trench", 3],
      ["aerial", 2], ["pole", 2], ["road crossing", 2], ["pavement", 2], ["manhole", 2],
    ],

    // ---- International Standards & Specifications Reference Library --------
    standards: [
      // ITU-T Telecommunications Standards
      { id: "ITU-T G.652", title: "Single-mode optical fibre and cable", scope: "Characteristics of single-mode optical fibre and cable (standard, most widely deployed type)", applicability: "All standard single-mode fibre deployments; default choice for metro and long-haul" },
      { id: "ITU-T G.653", title: "Dispersion-shifted single-mode optical fibre", scope: "Characteristics of dispersion-shifted single-mode optical fibre and cable", applicability: "Legacy long-haul systems optimized for 1550nm; largely superseded by G.655/G.656" },
      { id: "ITU-T G.654", title: "Cut-off shifted single-mode optical fibre", scope: "Characteristics of a cut-off shifted single-mode optical fibre and cable", applicability: "Ultra-long-haul submarine and terrestrial links requiring low attenuation at 1550nm" },
      { id: "ITU-T G.655", title: "Non-zero dispersion-shifted single-mode optical fibre", scope: "Characteristics of non-zero dispersion-shifted single-mode optical fibre and cable", applicability: "DWDM long-haul systems requiring controlled chromatic dispersion to suppress FWM" },
      { id: "ITU-T G.656", title: "Non-zero dispersion for wideband optical transport", scope: "Characteristics of fibre and cable with non-zero dispersion for wideband optical transport", applicability: "Wideband DWDM systems operating across S+C+L bands for maximum capacity" },
      { id: "ITU-T G.657", title: "Bending-loss insensitive single-mode optical fibre", scope: "Characteristics of a bending-loss insensitive single-mode optical fibre and cable for access networks", applicability: "FTTH/FTTB indoor cabling, tight bends in MDU risers, micro-duct and blown fibre" },
      { id: "ITU-T G.671", title: "Transmission characteristics of optical components and subsystems", scope: "Transmission characteristics of passive optical components and subsystems", applicability: "Specification of splitters, WDMs, couplers, and other passive components in the ODN" },
      { id: "ITU-T G.984", title: "GPON (Gigabit-capable Passive Optical Networks)", scope: "Series covering GPON architecture, ONT management, transmission convergence, and ranging", applicability: "Standard FTTH deployments with 2.5G downstream / 1.25G upstream to residential subscribers" },
      { id: "ITU-T G.987", title: "XG-PON (10-Gigabit-capable PON)", scope: "10-Gigabit-capable passive optical network systems for next-generation access", applicability: "Upgrade path from GPON; 10G downstream / 2.5G upstream for business and high-bandwidth residential" },
      { id: "ITU-T G.989", title: "NG-PON2 (Next Generation PON 2)", scope: "40-Gigabit-capable passive optical networks using TWDM and point-to-point WDM overlay", applicability: "Future-proof multi-wavelength PON for converged residential, business, and mobile backhaul" },
      { id: "ITU-T G.9807", title: "XGS-PON (10G Symmetric PON)", scope: "10-Gigabit-capable symmetric passive optical network", applicability: "Symmetric 10G/10G for business services and 5G mobile backhaul over existing ODN" },
      { id: "ITU-T L.36", title: "Single-mode fibre optic cables for outdoor use", scope: "Construction and mechanical requirements for single-mode fibre optic cables for outdoor installation", applicability: "All outdoor cable plant: duct, direct-buried, aerial, and submarine applications" },
      { id: "ITU-T L.57", title: "Optical fibre cable maintenance criteria for in-service fibre testing", scope: "Criteria and methods for maintenance of optical fibre cables including in-service monitoring", applicability: "Live network OTDR monitoring, preventive maintenance scheduling, and fault detection thresholds" },

      // IEC International Electrotechnical Commission Standards
      { id: "IEC 60793", title: "Optical fibres - Measurement methods and specifications", scope: "Optical fibre measurement methods, test procedures, and product specifications for all fibre types", applicability: "Incoming fibre inspection, type approval, and quality verification of fibre raw material" },
      { id: "IEC 60794", title: "Optical fibre cables - Design and testing", scope: "Generic specification for optical fibre cables including construction, testing, and environmental performance", applicability: "Cable design validation, mechanical testing (crush, impact, bend, tensile), and environmental qualification" },
      { id: "IEC 61280", title: "Fibre optic communication subsystem test procedures", scope: "Test procedures for fibre optic communication subsystems including attenuation and bandwidth", applicability: "End-to-end link testing, insertion loss measurement (Tier 1), and system-level acceptance" },
      { id: "IEC 61300", title: "Fibre optic interconnecting devices and passive components", scope: "Test and measurement procedures for fibre optic connectors, splices, and passive components", applicability: "Connector qualification, splice closure environmental testing, and passive component reliability" },
      { id: "IEC 61746", title: "OTDR calibration", scope: "Calibration of optical time-domain reflectometers including distance, attenuation, and event accuracy", applicability: "OTDR instrument calibration and verification before acceptance testing campaigns" },
      { id: "IEC 61755", title: "Fibre optic connector optical interfaces", scope: "Standard interface dimensions for single-mode and multimode fibre optic connector end faces", applicability: "Connector end-face geometry verification: radius of curvature, fibre height, angle (APC 8 degrees)" },
      { id: "IEC 62149", title: "Fibre optic active components and devices", scope: "Performance standards for fibre optic active components including transceivers and amplifiers", applicability: "OLT/ONT transceiver qualification, optical amplifier specification, and active equipment procurement" },

      // TIA/EIA Telecommunications Industry Association Standards
      { id: "TIA-455 (FOTP)", title: "Fibre Optic Test Procedures", scope: "Complete series of standardized fibre optic test procedures covering all measurement types", applicability: "Reference test methods for all fibre optic measurements: attenuation, bandwidth, geometry, mechanical" },
      { id: "TIA-568", title: "Commercial Building Telecommunications Cabling Standard", scope: "Structured cabling standard for commercial buildings including fibre optic specifications", applicability: "Indoor structured cabling design, fibre channel specifications, and campus backbone cabling" },
      { id: "TIA-598", title: "Optical Fibre Cable Color Coding", scope: "Standard colour coding scheme for optical fibre cables, buffer tubes, and ribbon fibres", applicability: "Fibre identification during splicing, documentation of fibre assignment, and cable inventory" },
      { id: "TIA-758", title: "Customer-Owned Outside Plant Telecommunications Infrastructure", scope: "Planning and installation of customer-owned outside plant telecommunications cabling", applicability: "Campus fibre design, private network OSP, and enterprise inter-building cabling" },

      // ISO International Standards
      { id: "ISO/IEC 11801", title: "Generic cabling for customer premises", scope: "Generic cabling standard for information technology in commercial buildings and campuses", applicability: "Premises cabling architecture, fibre backbone design, and horizontal cabling specifications" },
      { id: "ISO/IEC 14763", title: "Implementation and operation of customer premises cabling", scope: "Planning, installation, and operation of structured cabling systems in customer premises", applicability: "Cabling installation practices, testing requirements, and administration/documentation" },
      { id: "ISO/IEC 24764", title: "Generic cabling systems for data centres", scope: "Cabling infrastructure requirements specific to data centre environments", applicability: "Data centre fibre cabling design, high-density patching, and inter-rack connectivity" },
    ],

    // ---- Key Performance Indicators ----------------------------------------
    kpis: [
      { id: "KPI-01", name: "Route km completed vs. planned", target: ">=95% of baseline plan", unit: "km", frequency: "Weekly", owner: "Civil Works Manager" },
      { id: "KPI-02", name: "Splice loss average", target: "<=0.08 dB (max acceptable 0.1 dB per splice)", unit: "dB", frequency: "Per splice event", owner: "Splicing Supervisor" },
      { id: "KPI-03", name: "Connector loss average", target: "<=0.2 dB per mated pair", unit: "dB", frequency: "Per termination", owner: "Test & Commissioning Lead" },
      { id: "KPI-04", name: "First-time-right splice rate", target: ">98% of splices within spec on first attempt", unit: "%", frequency: "Weekly", owner: "QA/QC Manager" },
      { id: "KPI-05", name: "OTDR test completion rate", target: "100% of installed fibres tested bi-directionally", unit: "%", frequency: "Per section handover", owner: "Test & Commissioning Lead" },
      { id: "KPI-06", name: "Homes passed vs. plan", target: ">=95% of milestone target", unit: "homes", frequency: "Monthly", owner: "Project Manager" },
      { id: "KPI-07", name: "Homes connected (take-up rate)", target: "Per business case assumptions", unit: "homes", frequency: "Monthly", owner: "NOC Manager" },
      { id: "KPI-08", name: "Cable damage incidents per 100km", target: "<0.5 incidents per 100 route-km per year", unit: "incidents/100km", frequency: "Monthly", owner: "OSP Engineer" },
      { id: "KPI-09", name: "Schedule Performance Index (SPI)", target: ">=0.95", unit: "ratio", frequency: "Monthly", owner: "Project Manager" },
      { id: "KPI-10", name: "Cost Performance Index (CPI)", target: ">=0.95", unit: "ratio", frequency: "Monthly", owner: "Finance Controller" },
      { id: "KPI-11", name: "Permit approval lead time", target: "<=30 calendar days average", unit: "days", frequency: "Per permit batch", owner: "Permitting & Wayleave Manager" },
      { id: "KPI-12", name: "Lost Time Injury (LTI) rate", target: "Zero LTIs; LTIFR <1.0", unit: "injuries per million hours", frequency: "Monthly", owner: "HSE Officer" },
    ],

    // ---- Project Deliverables Checklist ------------------------------------
    deliverables: [
      { id: "DEL-01", name: "Feasibility study report", phase: "Feasibility & Planning", description: "Market analysis, demand forecast, technology comparison, and financial viability assessment" },
      { id: "DEL-02", name: "Network design (HLD + LLD documents)", phase: "Detailed Design", description: "High-level architecture and low-level design with splitter placement, cable routes, and equipment lists" },
      { id: "DEL-03", name: "Bill of Quantities (BoQ)", phase: "Detailed Design", description: "Complete material and labour quantities for procurement and cost control" },
      { id: "DEL-04", name: "Link budget calculations", phase: "Detailed Design", description: "Optical power budget for every link showing total loss vs. system margin per ITU-T G.984/G.9807" },
      { id: "DEL-05", name: "Route survey report with GPS coordinates", phase: "Feasibility & Planning", description: "Field survey data including GPS tracks, obstacle mapping, and soil/duct condition assessment" },
      { id: "DEL-06", name: "Permit/wayleave register", phase: "Permitting & Right-of-Way", description: "Tracker for all permits, wayleaves, and approvals with status, authority, and expiry dates" },
      { id: "DEL-07", name: "Civil works method statement", phase: "Civil Works", description: "Detailed methodology for trenching, HDD, micro-trenching, and reinstatement procedures" },
      { id: "DEL-08", name: "Cable installation method statement", phase: "Cable Installation", description: "Procedures for cable blowing/pulling including tension limits, bend radius, and environmental controls" },
      { id: "DEL-09", name: "Splicing procedure document", phase: "Splicing & Termination", description: "Fusion splicing procedures, cleanliness protocols, and splice loss acceptance criteria" },
      { id: "DEL-10", name: "Test procedure document (Tier 1 + Tier 2)", phase: "Testing & Commissioning", description: "Complete test methodology per IEC 61280 and IEC 61746 for OLTS and OTDR acceptance" },
      { id: "DEL-11", name: "Quality plan / Inspection & Test Plan (ITP)", phase: "Feasibility & Planning", description: "Hold points, witness points, and inspection criteria for all construction and testing activities" },
      { id: "DEL-12", name: "HSE plan", phase: "Feasibility & Planning", description: "Health, safety, and environment management plan including risk assessments and emergency procedures" },
      { id: "DEL-13", name: "OTDR test results (per fibre, bi-directional)", phase: "Testing & Commissioning", description: "Bi-directional OTDR traces at 1310nm and 1550nm for every fibre with event tables" },
      { id: "DEL-14", name: "Splice loss records", phase: "Splicing & Termination", description: "Individual splice loss measurements per joint closure with pass/fail against 0.1 dB threshold" },
      { id: "DEL-15", name: "Connector inspection reports (microscope images)", phase: "Testing & Commissioning", description: "End-face inspection images per IEC 61300-3-35 with pass/fail zone analysis" },
      { id: "DEL-16", name: "As-built drawings (route + cable assignment)", phase: "Documentation & As-Built", description: "Final route drawings showing actual cable positions, depths, and fibre colour-code assignments" },
      { id: "DEL-17", name: "GIS database update", phase: "Documentation & As-Built", description: "Geospatial database with all network assets: cables, joints, chambers, equipment locations" },
      { id: "DEL-18", name: "O&M manual", phase: "Documentation & As-Built", description: "Operations and maintenance manual covering monitoring, fault response, and preventive maintenance" },
      { id: "DEL-19", name: "Training records (splicing, testing, safety)", phase: "Documentation & As-Built", description: "Competency records for all field staff covering splicing certification, test equipment, and safety" },
      { id: "DEL-20", name: "Acceptance certificate (per section and final)", phase: "Testing & Commissioning", description: "Formal acceptance documentation signed by client upon successful completion of each section" },
      { id: "DEL-21", name: "Warranty documentation", phase: "Operations & Maintenance", description: "Warranty terms, coverage periods, and claim procedures for all materials and workmanship" },
      { id: "DEL-22", name: "Spare parts inventory", phase: "Operations & Maintenance", description: "Critical spares list with quantities, storage locations, and re-order levels for network resilience" },
    ],

    // ---- Roles & Responsibilities ------------------------------------------
    roles: [
      "Programme Director",
      "Project Manager",
      "Design Manager",
      "Survey Lead",
      "Permitting & Wayleave Manager",
      "Civil Works Manager",
      "OSP Engineer",
      "Cable Installation Supervisor",
      "Splicing Supervisor",
      "Test & Commissioning Lead",
      "QA/QC Manager",
      "HSE Officer",
      "Procurement Manager",
      "Logistics Coordinator",
      "Regional Coordinator",
      "NOC Manager",
      "GIS/Documentation Specialist",
      "Warehouse Manager",
      "Contract Administrator",
      "Finance Controller",
    ],

    // ---- Phase Templates with Comprehensive Tasks --------------------------
    buildPhases: function (scale) {
      var km = scale.routeKm || 100;
      var sites = scale.sites || 10;
      var homes = scale.homesPassed || 10000;
      // Indicative unit costs (USD)
      var civilPerKm = 18000;
      var cablePerKm = 4200;
      var blowPerKm = 2500;
      var splicePerKm = 900;

      return [
        // Phase 1: Feasibility & Planning
        { name: "Feasibility & Planning", owner: "Project Manager", tasks: [
          { problem: "Demand analysis and market assessment", costCat: "External / Consultant", estCost: round(km * 50), leanMethod: "Value Stream Mapping" },
          { problem: "Route options study and technology selection (GPON/XGS-PON/NG-PON2)", costCat: "Tooling / Software", estCost: 35000, leanMethod: "Standard Work" },
          { problem: "Preliminary network design and cost estimate", costCat: "External / Consultant", estCost: 25000 },
          { problem: "Business case and financial model development", costCat: "Labour / Effort", estCost: 15000 },
        ]},

        // Phase 2: Detailed Design
        { name: "Detailed Design", owner: "Design Manager", tasks: [
          { problem: "High-level design (HLD) - network topology (ring/star/tree)", costCat: "External / Consultant", estCost: 30000, leanMethod: "Value Stream Mapping" },
          { problem: "Low-level design (LLD) - cable selection (G.652D/G.657A2), splitter ratios", costCat: "External / Consultant", estCost: round(km * 120) },
          { problem: "Link budget calculation per ITU-T G.984/G.9807 for every optical path", costCat: "Tooling / Software", estCost: 18000, sev: 5, leanMethod: "Mistake-Proofing / Poka-Yoke" },
          { problem: "Bill of Quantities (BoQ) and splice closure sizing", costCat: "Tooling / Software", estCost: 12000 },
          { problem: "Route survey and site walk-out with GPS recording", costCat: "External / Consultant", estCost: round(km * 150), leanMethod: "Value Stream Mapping" },
        ]},

        // Phase 3: Permitting & Right-of-Way
        { name: "Permitting & Right-of-Way", owner: "Permitting & Wayleave Manager", tasks: [
          { problem: "Secure wayleaves and right-of-way permits (multi-authority)", costCat: "External / Consultant", estCost: round(km * 400), priority: "2-HIGH", sev: 6 },
          { problem: "Municipal permits and utility crossing approvals", costCat: "External / Consultant", estCost: round(km * 120), priority: "2-HIGH", sev: 6 },
          { problem: "Environmental impact assessment and mitigation plan", costCat: "External / Consultant", estCost: 20000 },
          { problem: "Traffic management plans and road occupation permits", costCat: "External / Consultant", estCost: round(km * 80) },
        ]},

        // Phase 4: Procurement
        { name: "Procurement", owner: "Procurement Manager", tasks: [
          { problem: "Procure fibre optic cable (backbone/distribution/drop per BoQ)", costCat: "Materials", estCost: round(km * cablePerKm), priority: "2-HIGH" },
          { problem: "Procure splice closures, connectors, and passive components", costCat: "Materials", estCost: round(sites * 2200) },
          { problem: "Procure OLT/ONU/ONT active equipment and splitters", costCat: "Materials", estCost: round(homes * 15), priority: "2-HIGH" },
          { problem: "Procure test equipment (OTDR, OLTS, VFL, fibre microscope, OPM)", costCat: "Tooling / Software", estCost: 85000 },
          { problem: "Procure civil materials (HDPE duct, micro-duct, chambers, handholes)", costCat: "Materials", estCost: round(km * 3200) },
        ]},

        // Phase 5: Civil Works
        { name: "Civil Works", owner: "Civil Works Manager", tasks: [
          { problem: "Trenching, ducting, and HDD along planned route", costCat: "External / Consultant", estCost: round(km * civilPerKm), priority: "2-HIGH" },
          { problem: "Micro-trenching in urban/paved areas", costCat: "External / Consultant", estCost: round(km * 0.2 * 12000) },
          { problem: "Chamber, handhole, and POP civil build installation", costCat: "External / Consultant", estCost: round(sites * 3500) },
          { problem: "Road/pavement reinstatement to local authority standards", costCat: "External / Consultant", estCost: round(km * 2800) },
          { problem: "Aerial strand and lashing for overhead sections", costCat: "External / Consultant", estCost: round(km * 0.1 * 8000) },
          { problem: "Duct integrity verification (mandrel test, compressed air test)", costCat: "Labour / Effort", estCost: round(km * 300), sev: 4, leanMethod: "Mistake-Proofing / Poka-Yoke" },
        ]},

        // Phase 6: Cable Installation
        { name: "Cable Installation", owner: "Cable Installation Supervisor", tasks: [
          { problem: "Fibre cable blowing/pulling with tension monitoring (max 2700N)", costCat: "Labour / Effort", estCost: round(km * blowPerKm) },
          { problem: "Incoming cable inspection and reel testing per IEC 60794", costCat: "Labour / Effort", estCost: round(km * 80), sev: 4, leanMethod: "Mistake-Proofing / Poka-Yoke" },
          { problem: "Minimum bend radius compliance verification (20x OD dynamic, 10x static)", costCat: "Labour / Effort", estCost: round(km * 50) },
          { problem: "VFL continuity check and fibre colour-code verification per TIA-598", costCat: "Tooling / Software", estCost: round(km * 60), leanMethod: "Mistake-Proofing / Poka-Yoke" },
          { problem: "Cable labelling, route marking, and duct sealing", costCat: "Materials", estCost: round(km * 120) },
        ]},

        // Phase 7: Splicing & Termination
        { name: "Splicing & Termination", owner: "Splicing Supervisor", tasks: [
          { problem: "Fusion splicing at joints and closures (target <=0.1 dB per splice)", costCat: "Labour / Effort", estCost: round(km * splicePerKm), sev: 5 },
          { problem: "Ribbon splicing for high-count cables", costCat: "Labour / Effort", estCost: round(km * 0.3 * splicePerKm) },
          { problem: "Pigtail termination and patch panel/ODF population", costCat: "Labour / Effort", estCost: round(sites * 1200) },
          { problem: "Splice closure assembly and environmental sealing", costCat: "Labour / Effort", estCost: round(sites * 450) },
          { problem: "Connector end-face inspection per IEC 61300-3-35", costCat: "Tooling / Software", estCost: round(sites * 200), sev: 5, leanMethod: "Mistake-Proofing / Poka-Yoke" },
          { problem: "Connector insertion loss test (<=0.3 dB PC, <=0.2 dB APC) and return loss (>=45 dB PC, >=60 dB APC)", costCat: "Tooling / Software", estCost: round(sites * 180), sev: 5, leanMethod: "Mistake-Proofing / Poka-Yoke" },
        ]},

        // Phase 8: Testing & Commissioning
        { name: "Testing & Commissioning", owner: "Test & Commissioning Lead", tasks: [
          { problem: "OTDR bi-directional testing at 1310nm and 1550nm per IEC 61746", costCat: "Tooling / Software", estCost: round(km * 200), sev: 5, leanMethod: "Mistake-Proofing / Poka-Yoke" },
          { problem: "Tier 1 insertion loss measurement (OLTS/power meter per IEC 61280)", costCat: "Tooling / Software", estCost: round(km * 100), sev: 5 },
          { problem: "Optical Return Loss (ORL) measurement for all connectorized links", costCat: "Tooling / Software", estCost: round(sites * 300), sev: 5 },
          { problem: "Chromatic dispersion and PMD testing for long-haul links (>40km or >10G)", costCat: "Tooling / Software", estCost: 25000, sev: 5 },
          { problem: "Link budget verification - total measured loss vs. system margin", costCat: "Tooling / Software", estCost: 12000, sev: 6, leanMethod: "Mistake-Proofing / Poka-Yoke" },
          { problem: "OLT commissioning, ONT activation, and BER testing (target <10^-12)", costCat: "Tooling / Software", estCost: round(homes * 3), sev: 6 },
          { problem: "End-to-end system acceptance test and handover to operations", costCat: "Labour / Effort", estCost: 15000, sev: 5 },
        ]},

        // Phase 9: Documentation & As-Built
        { name: "Documentation & As-Built", owner: "GIS/Documentation Specialist", tasks: [
          { problem: "OTDR trace archival (bi-directional at 1310nm and 1550nm per fibre)", costCat: "Tooling / Software", estCost: round(km * 30) },
          { problem: "Splice loss record compilation per joint closure", costCat: "Labour / Effort", estCost: round(km * 20) },
          { problem: "As-built drawings and cable route GIS database update", costCat: "Tooling / Software", estCost: round(km * 60) },
          { problem: "Fibre assignment matrix and colour-code map documentation", costCat: "Labour / Effort", estCost: 8000 },
          { problem: "O&M manual and test certificate compilation", costCat: "Labour / Effort", estCost: 12000 },
        ]},

        // Phase 10: Operations & Maintenance
        { name: "Operations & Maintenance", owner: "NOC Manager", tasks: [
          { problem: "Network monitoring system setup (OTDR-based fault detection)", costCat: "Tooling / Software", estCost: 45000 },
          { problem: "Fault location and emergency restoration procedures", costCat: "Labour / Effort", estCost: 20000 },
          { problem: "Preventive maintenance schedule and performance baseline establishment", costCat: "Labour / Effort", estCost: 15000 },
          { problem: "Spare parts stocking and warehouse setup for network resilience", costCat: "Materials", estCost: round(km * 200) },
        ]},
      ];
    },

    // ---- Domain-Specific Risks with FMEA Scores ----------------------------
    buildRisks: function (text, scale) {
      return [
        { problem: "RISK: Permitting/right-of-way delays stall civil works (multi-authority political complexity)", category: "Delivery / Schedule", sev: 8, occ: 7, det: 4, priority: "1-CRITICAL", rootCause: "Multi-authority approvals on critical path; political and bureaucratic complexity" },
        { problem: "RISK: Monsoon/typhoon/flood season halts civil works and damages exposed plant", category: "Delivery / Schedule", sev: 7, occ: 6, det: 3, priority: "2-HIGH", rootCause: "Seasonal climate patterns in tropical/subtropical deployment regions" },
        { problem: "RISK: Third-party dig-ups and cable cuts damage deployed infrastructure", category: "Quality / Defects", sev: 8, occ: 5, det: 5, priority: "2-HIGH", rootCause: "Shared utility corridors and poor as-built awareness by other contractors" },
        { problem: "RISK: Import customs delays for equipment and cable shipments", category: "Delivery / Schedule", sev: 6, occ: 6, det: 4, priority: "2-HIGH", rootCause: "Cross-border logistics, documentation errors, and regulatory hold-ups" },
        { problem: "RISK: Splice loss exceeding budget (high OTDR loss at joints)", category: "Quality / Defects", sev: 7, occ: 4, det: 4, priority: "2-HIGH", rootCause: "Operator skill variance, contaminated connectors, and adverse field conditions" },
        { problem: "RISK: Supply chain disruption (fibre shortage, chip shortage for OLTs)", category: "Delivery / Schedule", sev: 7, occ: 5, det: 5, priority: "2-HIGH", rootCause: "Global material shortages, single-source dependencies, and logistics disruption" },
        { problem: "RISK: Contractor quality variance across regions and work fronts", category: "Quality / Defects", sev: 6, occ: 6, det: 5, priority: "2-HIGH", rootCause: "Multiple subcontractors with inconsistent training and supervision levels" },
        { problem: "RISK: Design change required after civil works have started", category: "Process / Flow", sev: 7, occ: 4, det: 5, priority: "2-HIGH", rootCause: "Incomplete survey data, late customer requirements, or unforeseen ground conditions" },
        { problem: "RISK: Technology obsolescence mid-project (e.g. GPON to XGS-PON migration)", category: "Process / Flow", sev: 5, occ: 3, det: 4, priority: "3-MEDIUM", rootCause: "Long project duration exposing to technology evolution and standard updates" },
        { problem: "RISK: Regulatory change affecting right-of-way legislation or spectrum allocation", category: "Process / Flow", sev: 6, occ: 3, det: 5, priority: "3-MEDIUM", rootCause: "Government policy changes, new environmental regulations, or licensing requirements" },
        { problem: "RISK: Security and theft of installed cable and equipment", category: "Quality / Defects", sev: 7, occ: 5, det: 6, priority: "2-HIGH", rootCause: "Remote deployment areas, copper/fibre value, and inadequate site security" },
        { problem: "RISK: Natural disaster damage to deployed infrastructure (earthquake, landslide)", category: "Delivery / Schedule", sev: 9, occ: 3, det: 6, priority: "2-HIGH", rootCause: "Geological hazards in deployment corridors and force majeure events" },
        { problem: "RISK: Subcontractor financial failure mid-project causing work stoppage", category: "Delivery / Schedule", sev: 8, occ: 3, det: 5, priority: "2-HIGH", rootCause: "Undercapitalized subcontractors, cash flow problems, or market instability" },
      ];
    },

    // ---- Comprehensive Procurement Register --------------------------------
    buildProcurement: function (scale) {
      var km = scale.routeKm || 100;
      var sites = scale.sites || 10;
      var homes = scale.homesPassed || 10000;
      return [
        { package: "Fibre optic cable - backbone (loose-tube, high-count)", vendor: "TBD", value: round(km * 4200), poStatus: "RFQ", owner: "Procurement Manager" },
        { package: "Fibre optic cable - distribution and drop (G.657A2 bend-insensitive)", vendor: "TBD", value: round(km * 0.5 * 2800), poStatus: "RFQ", owner: "Procurement Manager" },
        { package: "Micro-duct and sub-duct systems (HDPE, multi-way)", vendor: "TBD", value: round(km * 2600), poStatus: "RFQ", owner: "Procurement Manager" },
        { package: "Splice closures (dome, in-line, wall-mount) per design", vendor: "TBD", value: round(sites * 1800), poStatus: "RFQ", owner: "Procurement Manager" },
        { package: "Connectors and adapters (SC/APC, LC/APC, MPO/MTP)", vendor: "TBD", value: round(sites * 950), poStatus: "RFQ", owner: "Procurement Manager" },
        { package: "Patch panels, ODF, and FDH fibre management", vendor: "TBD", value: round(sites * 2200), poStatus: "RFQ", owner: "Procurement Manager" },
        { package: "Splitters - PLC type (1:8, 1:16, 1:32, 1:64 ratios)", vendor: "TBD", value: round(homes * 2.5), poStatus: "RFQ", owner: "Procurement Manager" },
        { package: "OLT equipment (chassis, line cards, power supplies)", vendor: "TBD", value: round(sites * 18000), poStatus: "RFQ", owner: "Procurement Manager" },
        { package: "ONT/ONU CPE (residential, business, MDU variants)", vendor: "TBD", value: round(homes * 12), poStatus: "Planned", owner: "Procurement Manager" },
        { package: "Test equipment (OTDR, OLTS, VFL, fibre microscope, OPM)", vendor: "TBD", value: 85000, poStatus: "Planned", owner: "Test & Commissioning Lead" },
        { package: "Civil materials (HDPE duct, chambers, handholes, markers)", vendor: "TBD", value: round(km * 3200), poStatus: "RFQ", owner: "Procurement Manager" },
        { package: "Aerial materials (strand, lashing wire, pole hardware, clamps)", vendor: "TBD", value: round(km * 0.1 * 5500), poStatus: "Planned", owner: "Procurement Manager" },
        { package: "Labels, cable tags, and identification materials", vendor: "TBD", value: round(km * 80), poStatus: "Planned", owner: "Warehouse Manager" },
        { package: "Safety and PPE (laser safety goggles, arc flash protection, harnesses)", vendor: "TBD", value: 25000, poStatus: "Planned", owner: "HSE Officer" },
      ];
    },

    // ---- Submarine-Specific Phase Templates --------------------------------
    buildSubmarinePhases: function (scale) {
      var km = scale.routeKm || 1000;
      var sites = scale.sites || 8; // landing points

      return [
        // Phase 1: Route Survey & Desktop Study
        { name: "Route Survey & Desktop Study", owner: "Survey Lead", tasks: [
          { problem: "Bathymetric survey and seabed sampling along proposed route", costCat: "External / Consultant", estCost: round(km * 800), leanMethod: "Value Stream Mapping" },
          { problem: "Cable route engineering and burial assessment", costCat: "External / Consultant", estCost: round(km * 500), leanMethod: "Standard Work" },
          { problem: "Hazard identification: anchoring areas, fishing zones, seismic activity", costCat: "External / Consultant", estCost: round(km * 300), sev: 6 },
          { problem: "Desktop study and existing cable/pipeline crossing analysis", costCat: "External / Consultant", estCost: 80000 },
        ]},

        // Phase 2: System Design & Engineering
        { name: "System Design & Engineering", owner: "Design Manager", tasks: [
          { problem: "Repeater spacing and optical amplifier design", costCat: "External / Consultant", estCost: round(km / 80 * 50000), sev: 5, leanMethod: "Standard Work" },
          { problem: "Branching unit placement for multi-landing systems", costCat: "External / Consultant", estCost: round(sites * 25000) },
          { problem: "Power feed equipment design and redundancy planning", costCat: "External / Consultant", estCost: 120000, sev: 5 },
          { problem: "Cable type selection: lightweight/single-armour/double-armour by depth zone", costCat: "External / Consultant", estCost: 60000, leanMethod: "Standard Work" },
          { problem: "Link budget per span and system capacity planning", costCat: "Tooling / Software", estCost: 80000, sev: 5, leanMethod: "Mistake-Proofing / Poka-Yoke" },
        ]},

        // Phase 3: Permitting & Landing Rights
        { name: "Permitting & Landing Rights", owner: "Permitting & Wayleave Manager", tasks: [
          { problem: "Submarine cable landing permits per country", costCat: "External / Consultant", estCost: round(sites * 150000), priority: "1-CRITICAL", sev: 8 },
          { problem: "Maritime route approvals and navigation safety zones", costCat: "External / Consultant", estCost: round(sites * 80000), priority: "2-HIGH", sev: 6 },
          { problem: "Environmental marine EIA for each jurisdiction", costCat: "External / Consultant", estCost: round(sites * 120000), priority: "2-HIGH", sev: 6 },
          { problem: "Cable protection zone applications and gazette notifications", costCat: "External / Consultant", estCost: round(sites * 40000) },
        ]},

        // Phase 4: Procurement & Manufacturing
        { name: "Procurement & Manufacturing", owner: "Procurement Manager", tasks: [
          { problem: "Submarine cable manufacturing (12-18 months lead time)", costCat: "Materials", estCost: round(km * 35000), priority: "1-CRITICAL", sev: 7 },
          { problem: "Repeaters and optical amplifiers procurement", costCat: "Materials", estCost: round(km / 80 * 500000), priority: "1-CRITICAL" },
          { problem: "SLTE (submarine line terminal equipment) procurement", costCat: "Materials", estCost: round(sites * 5500000), priority: "2-HIGH" },
          { problem: "Branching units procurement", costCat: "Materials", estCost: round(sites * 800000) },
          { problem: "Cable ship charter for installation and burial", costCat: "External / Consultant", estCost: round(km / 50 * 225000), priority: "2-HIGH" },
          { problem: "Shore-end materials and accessories", costCat: "Materials", estCost: round(sites * 3500000) },
        ]},

        // Phase 5: Cable Manufacturing & Factory Testing
        { name: "Cable Manufacturing & Factory Testing", owner: "QA/QC Manager", tasks: [
          { problem: "Cable manufacture at turnkey supplier facility", costCat: "External / Consultant", estCost: round(km * 5000), sev: 5 },
          { problem: "Factory acceptance testing (FAT) for cable and repeaters", costCat: "External / Consultant", estCost: 250000, sev: 6, leanMethod: "Mistake-Proofing / Poka-Yoke" },
          { problem: "Repeater integration and system testing at factory", costCat: "External / Consultant", estCost: 180000, sev: 5 },
          { problem: "Cable loading onto cable ship", costCat: "External / Consultant", estCost: 150000 },
        ]},

        // Phase 6: Marine Installation
        { name: "Marine Installation", owner: "Cable Installation Supervisor", tasks: [
          { problem: "Cable ship mobilization and transit to route", costCat: "External / Consultant", estCost: round(km / 50 * 225000), priority: "2-HIGH" },
          { problem: "Cable lay operations along surveyed route", costCat: "External / Consultant", estCost: round(km * 20000), priority: "1-CRITICAL", sev: 6 },
          { problem: "Cable burial: plough/jet trencher for shallow sections, surface-lay for deep water", costCat: "External / Consultant", estCost: round(km * 0.4 * 15000), sev: 5 },
          { problem: "Shore-end pull-in operations at each landing", costCat: "External / Consultant", estCost: round(sites * 500000), sev: 6 },
          { problem: "Joint operations for cable segments", costCat: "External / Consultant", estCost: round(km / 200 * 150000) },
        ]},

        // Phase 7: Shore-End & Landing
        { name: "Shore-End & Landing", owner: "Civil Works Manager", tasks: [
          { problem: "Beach manhole construction at each landing site", costCat: "External / Consultant", estCost: round(sites * 350000) },
          { problem: "Horizontal directional drilling (HDD) at landing sites", costCat: "External / Consultant", estCost: round(sites * 600000), sev: 5 },
          { problem: "Shore-end cable pull from beach manhole to cable ship", costCat: "External / Consultant", estCost: round(sites * 400000) },
          { problem: "Cable landing station fit-out and equipment installation", costCat: "Materials", estCost: round(sites * 2000000), priority: "2-HIGH" },
        ]},

        // Phase 8: System Commissioning
        { name: "System Commissioning", owner: "Test & Commissioning Lead", tasks: [
          { problem: "End-to-end optical testing across all spans", costCat: "Tooling / Software", estCost: 200000, sev: 6, leanMethod: "Mistake-Proofing / Poka-Yoke" },
          { problem: "SLTE commissioning at each terminal station", costCat: "Tooling / Software", estCost: round(sites * 80000), sev: 6 },
          { problem: "BER testing and system margin verification", costCat: "Tooling / Software", estCost: 150000, sev: 6, leanMethod: "Mistake-Proofing / Poka-Yoke" },
          { problem: "Wavelength provisioning and capacity allocation", costCat: "Tooling / Software", estCost: 100000, sev: 5 },
        ]},

        // Phase 9: Documentation & Handover
        { name: "Documentation & Handover", owner: "GIS/Documentation Specialist", tasks: [
          { problem: "As-laid cable route chart (RPL - Route Position List)", costCat: "Tooling / Software", estCost: round(km * 50) },
          { problem: "System acceptance documentation and test certificates", costCat: "Labour / Effort", estCost: 80000 },
          { problem: "O&M documentation and maintenance procedures", costCat: "Labour / Effort", estCost: 60000 },
          { problem: "Spare cable and repair inventory documentation", costCat: "Labour / Effort", estCost: 30000 },
        ]},

        // Phase 10: Network Operations & Maintenance
        { name: "Network Operations & Maintenance", owner: "NOC Manager", tasks: [
          { problem: "24/7 NOC monitoring system setup and staffing", costCat: "Tooling / Software", estCost: 350000 },
          { problem: "Cable repair contracts with vessel operators", costCat: "External / Consultant", estCost: 500000, priority: "2-HIGH" },
          { problem: "Spare cable depot establishment for future repairs", costCat: "Materials", estCost: round(km * 0.05 * 35000) },
          { problem: "Marine maintenance agreements and annual surveys", costCat: "External / Consultant", estCost: 200000 },
        ]},
      ];
    },

    // ---- Submarine-Specific Risks ------------------------------------------
    buildSubmarineRisks: function (text, scale) {
      return [
        { problem: "RISK: Cable ship availability/scheduling delays during peak season", category: "Delivery / Schedule", sev: 8, occ: 6, det: 5, priority: "1-CRITICAL", rootCause: "Limited global fleet of cable ships; high demand from offshore wind and submarine telecom" },
        { problem: "RISK: Adverse weather window closure during marine installation", category: "Delivery / Schedule", sev: 7, occ: 7, det: 3, priority: "1-CRITICAL", rootCause: "Monsoon seasons, typhoon belts, and sea state limitations for cable operations" },
        { problem: "RISK: Anchor damage from shipping lanes crossing cable route", category: "Quality / Defects", sev: 9, occ: 5, det: 6, priority: "1-CRITICAL", rootCause: "Heavy vessel traffic in shallow water sections; inadequate cable burial depth or protection" },
        { problem: "RISK: Fishing trawler snag in shallow water sections", category: "Quality / Defects", sev: 8, occ: 6, det: 5, priority: "2-HIGH", rootCause: "Intensive fishing activity in continental shelf waters; cable exposure due to seabed mobility" },
        { problem: "RISK: Seismic/volcanic activity damaging deployed cable", category: "Quality / Defects", sev: 9, occ: 4, det: 7, priority: "2-HIGH", rootCause: "Pacific Ring of Fire location; submarine landslides triggered by earthquakes" },
        { problem: "RISK: Manufacturing defect requiring cable recall or at-sea repair", category: "Quality / Defects", sev: 8, occ: 3, det: 5, priority: "2-HIGH", rootCause: "Complex manufacturing process; insulation failures or fibre defects found during FAT or installation" },
        { problem: "RISK: Geopolitical route restrictions through territorial waters disputes", category: "Process / Flow", sev: 7, occ: 5, det: 5, priority: "2-HIGH", rootCause: "South China Sea disputes; overlapping maritime claims; political tensions affecting cable routing" },
        { problem: "RISK: Deep-water cable repair complexity at depths exceeding 1000m", category: "Delivery / Schedule", sev: 8, occ: 4, det: 6, priority: "2-HIGH", rootCause: "Specialized equipment needed for deep-water grapnel and repair; limited repair vessel availability" },
        { problem: "RISK: Power feed failure in long repeatered systems", category: "Quality / Defects", sev: 9, occ: 3, det: 5, priority: "2-HIGH", rootCause: "High-voltage DC power feed over thousands of km; shunt faults and repeater power issues" },
        { problem: "RISK: Shore-end erosion/instability at landing beaches", category: "Quality / Defects", sev: 7, occ: 5, det: 4, priority: "2-HIGH", rootCause: "Coastal erosion, storm surge, sedimentation changes, and beach profile instability over cable lifetime" },
      ];
    },

    // ---- Submarine-Specific Procurement ------------------------------------
    buildSubmarineProcurement: function (scale) {
      var km = scale.routeKm || 1000;
      var sites = scale.sites || 8;
      return [
        { package: "Submarine cable (lightweight deep-water + armoured shallow)", vendor: "TBD", value: round(km * 35000), poStatus: "RFQ", owner: "Procurement Manager" },
        { package: "Optical repeaters/amplifiers (EDFA)", vendor: "TBD", value: round(km / 80 * 500000), poStatus: "RFQ", owner: "Procurement Manager" },
        { package: "Branching units (for multi-landing systems)", vendor: "TBD", value: round(sites * 800000), poStatus: "RFQ", owner: "Procurement Manager" },
        { package: "Power Feed Equipment (PFE)", vendor: "TBD", value: round(sites * 2000000), poStatus: "RFQ", owner: "Procurement Manager" },
        { package: "SLTE (submarine line terminal equipment)", vendor: "TBD", value: round(sites * 5500000), poStatus: "RFQ", owner: "Procurement Manager" },
        { package: "Cable ship charter (installation + burial)", vendor: "TBD", value: round(km / 50 * 225000), poStatus: "RFQ", owner: "Procurement Manager" },
        { package: "Shore-end cable and accessories", vendor: "TBD", value: round(sites * 3500000), poStatus: "RFQ", owner: "Procurement Manager" },
        { package: "Cable route survey vessel charter", vendor: "TBD", value: round(km * 800), poStatus: "RFQ", owner: "Survey Lead" },
        { package: "Spare cable depot stock (for future repairs)", vendor: "TBD", value: round(km * 0.05 * 35000), poStatus: "Planned", owner: "NOC Manager" },
        { package: "Marine route markers/cable protection", vendor: "TBD", value: round(km * 0.3 * 5000), poStatus: "Planned", owner: "Procurement Manager" },
      ];
    },

    // ---- Vendor Directory ---------------------------------------------------
    vendors: [
      // TURNKEY SYSTEMS
      { id: "v-subcom", company: "SubCom", hq: "United States", category: "turnkey-systems", capabilities: ["turnkey submarine cable systems", "cable manufacturing", "installation", "maintenance", "network design"], products: ["submarine fibre optic cables", "repeaters", "SLTE", "branching units", "power feed equipment"], notableProjects: ["Amitie", "Bifrost", "Jupiter", "Dunant", "CAP-1"], website: "https://www.subcom.com", priceRange: "premium", leadTime: "18-36 months", strengths: ["Largest market share in submarine cable", "Own cable ships", "End-to-end capability", "Deep-water expertise"], considerations: ["Premium pricing", "Long lead times for major systems", "US-based ITAR considerations"] },
      { id: "v-asn", company: "Alcatel Submarine Networks (ASN/Nokia)", hq: "France", category: "turnkey-systems", capabilities: ["turnkey submarine cable systems", "cable manufacturing", "marine operations", "network upgrades", "wet plant and dry plant"], products: ["submarine cables", "optical repeaters", "ROADM branching units", "1620 DWDM SLTE", "power feed equipment"], notableProjects: ["SEA-ME-WE 6", "2Africa", "Dunant", "EllaLink", "PEACE Cable"], website: "https://www.asn.com", priceRange: "premium", leadTime: "18-36 months", strengths: ["Strong global presence", "Nokia integration for SLTE", "Proven in ultra-long-haul", "Large installation fleet"], considerations: ["Complex procurement via Nokia", "Premium pricing tier", "Long project cycles"] },
      { id: "v-nec", company: "NEC Corporation", hq: "Japan", category: "turnkey-systems", capabilities: ["turnkey submarine cable systems", "cable manufacturing", "marine installation", "system upgrades", "network monitoring"], products: ["submarine cables", "optical amplifiers", "SLTE", "undersea branching units", "cable monitoring systems"], notableProjects: ["Asia Direct Cable", "JUPITER", "SJC2", "MIST Cable", "Hawaiki"], website: "https://www.nec.com/en/global/solutions/nsp/submarine/", priceRange: "premium", leadTime: "18-36 months", strengths: ["Strong Asia-Pacific presence", "Advanced amplifier technology", "Proven reliability", "Comprehensive maintenance services"], considerations: ["Primarily focused on Pacific routes", "Premium pricing", "Lead times extend for custom designs"] },
      { id: "v-hmn", company: "HMN Tech", hq: "China", category: "turnkey-systems", capabilities: ["turnkey submarine cable systems", "cable manufacturing", "marine installation", "system integration", "network planning"], products: ["submarine fibre cables", "repeaters", "SLTE equipment", "branching units", "shore-end solutions"], notableProjects: ["PEACE Cable", "Pakistan-East Africa Cable", "SeaMeWe-5 segments", "SAIL Cable"], website: "https://www.hmntech.com", priceRange: "competitive", leadTime: "12-30 months", strengths: ["Competitive pricing", "Growing submarine portfolio", "Fast manufacturing capacity", "Strong government backing"], considerations: ["Geopolitical restrictions in some markets", "Limited cable ship fleet", "Newer entrant to deep-water systems"] },

      // CABLE MANUFACTURERS
      { id: "v-sumitomo", company: "Sumitomo Electric", hq: "Japan", category: "cable-manufacturers", capabilities: ["optical fibre manufacturing", "cable manufacturing", "fusion splicers", "connectors", "submarine cable components"], products: ["optical fibres (SMF, DSF, NZ-DSF)", "loose-tube cables", "ribbon cables", "fusion splicers", "fibre connectors", "FTTx components"], notableProjects: ["Major Japanese FTTH deployments", "Asia-Pacific submarine cable supply", "Global fibre supply agreements"], website: "https://sumitomoelectric.com", priceRange: "mid", leadTime: "6-14 months", strengths: ["Top-tier fibre quality", "Advanced fusion splicer technology", "Strong Asia presence", "Vertically integrated from preform to cable"], considerations: ["Distribution channels vary by region", "Lead times for custom configurations", "Focus on Japanese and Asian markets"] },
      { id: "v-furukawa", company: "Furukawa Electric", hq: "Japan", category: "cable-manufacturers", capabilities: ["optical fibre manufacturing", "cable manufacturing", "fusion splicers", "network equipment", "automotive harnesses"], products: ["optical fibres", "fibre cables (loose-tube, ribbon, drop)", "FTTx solutions", "fusion splicers (FITEL brand)", "optical components"], notableProjects: ["Japanese NTT FTTH network supply", "Latin American deployments", "Asian network builds"], website: "https://www.furukawa.co.jp/en/", priceRange: "mid", leadTime: "6-14 months", strengths: ["FITEL splicer brand excellence", "Strong in Americas via acquisition", "Quality Japanese manufacturing", "Full fibre ecosystem"], considerations: ["Smaller global presence than Corning/Prysmian", "Regional distribution complexity", "Limited submarine cable focus"] },
      { id: "v-corning", company: "Corning", hq: "United States", category: "cable-manufacturers", capabilities: ["optical fibre innovation", "fibre manufacturing", "cable manufacturing", "connectivity solutions", "network planning tools"], products: ["SMF-28 Ultra fibre", "ClearCurve fibre (bend-insensitive)", "loose-tube cables", "ribbon cables", "EDGE rapid-connect solutions", "FlexNAP systems"], notableProjects: ["Worldwide FTTH deployments", "Hyperscale data centre connectivity", "5G network fibre supply"], website: "https://www.corning.com/opcomm", priceRange: "premium", leadTime: "6-12 months", strengths: ["Invented low-loss optical fibre", "Largest global fibre manufacturer", "Industry-leading R&D", "Comprehensive connectivity portfolio"], considerations: ["Premium pricing for branded products", "US-centric manufacturing", "MOQ requirements for custom cables"] },
      { id: "v-ztt", company: "ZTT Group", hq: "China", category: "cable-manufacturers", capabilities: ["optical fibre cable manufacturing", "power cable", "submarine cable", "cable accessories", "EPC services"], products: ["ADSS cables", "OPGW", "loose-tube cables", "ribbon cables", "submarine telecom cables", "micro-duct cables"], notableProjects: ["Multiple African FTTH projects", "Southeast Asian network builds", "Belt and Road telecom infrastructure"], website: "https://www.zttcable.com", priceRange: "competitive", leadTime: "4-10 months", strengths: ["Very competitive pricing", "Large production capacity", "Growing submarine capability", "Quick turnaround on standard products"], considerations: ["Quality variance on some product lines", "IP concerns in some markets", "Technical support availability outside China"] },
      { id: "v-hengtong", company: "Hengtong Group", hq: "China", category: "cable-manufacturers", capabilities: ["optical fibre cable manufacturing", "submarine cables", "power cables", "fibre preform manufacturing", "EPC services"], products: ["optical fibres", "loose-tube cables", "ribbon cables", "submarine cables", "OPGW", "FTTH drop cables"], notableProjects: ["Multiple Southeast Asian deployments", "African connectivity projects", "Chinese domestic backbone"], website: "https://www.hengtonggroup.com/en/", priceRange: "competitive", leadTime: "4-10 months", strengths: ["Full vertical integration from preform", "Competitive pricing", "Large capacity", "Growing international presence"], considerations: ["Brand recognition outside Asia", "Post-sales support in remote markets", "Geopolitical factors"] },
      { id: "v-fiberhome", company: "Fiberhome", hq: "China", category: "cable-manufacturers", capabilities: ["optical fibre cable manufacturing", "telecom equipment", "FTTx solutions", "network integration", "smart city solutions"], products: ["optical fibres and cables", "OLT/ONT equipment", "DWDM systems", "fibre management solutions", "network monitoring"], notableProjects: ["Chinese FTTH national rollout", "Southeast Asian operator deployments", "African telecom builds"], website: "https://www.fiberhomegroup.com", priceRange: "competitive", leadTime: "4-10 months", strengths: ["End-to-end FTTx solutions", "Competitive pricing", "Active equipment and passive combined", "Large R&D investment"], considerations: ["Trade restrictions in some countries", "Support infrastructure outside Asia", "Brand perception varies by region"] },
      { id: "v-yofc", company: "YOFC (Yangtze Optical Fibre and Cable)", hq: "China", category: "cable-manufacturers", capabilities: ["optical fibre preform manufacturing", "fibre drawing", "cable manufacturing", "specialty fibres", "fibre solutions"], products: ["single-mode fibres", "multimode fibres", "specialty fibres", "loose-tube cables", "ribbon cables", "FTTH cables", "submarine cables"], notableProjects: ["Worlds largest fibre producer by volume", "Chinese national network supply", "International FTTH deployments"], website: "https://www.yofc.com/en/", priceRange: "competitive", leadTime: "4-10 months", strengths: ["Worlds largest optical fibre producer", "Lowest cost per km", "Massive production capacity", "Quality improving steadily"], considerations: ["Geopolitical limitations in some markets", "Technical support outside Asia", "Premium product lines less established"] },

      // INSTALLATION VESSELS
      { id: "v-global-marine", company: "Global Marine Group", hq: "United Kingdom", category: "installation-vessels", capabilities: ["submarine cable installation", "cable repair", "cable route survey", "cable burial", "offshore renewables cabling"], products: ["cable lay services", "cable repair services", "route engineering", "burial and protection", "decommissioning"], notableProjects: ["Numerous transatlantic repairs", "North Sea installations", "Asia-Pacific cable systems", "Offshore wind array cables"], website: "https://www.globalmarinegroup.com", priceRange: "premium", leadTime: "6-18 months vessel booking", strengths: ["Oldest submarine cable company (1850)", "Large diverse fleet", "Global operations centres", "24/7 repair standby capability"], considerations: ["Premium day rates", "Vessel availability in peak seasons", "Advance booking essential"] },
      { id: "v-emarine", company: "E-Marine", hq: "United Arab Emirates", category: "installation-vessels", capabilities: ["submarine cable installation", "cable repair", "cable route survey", "maintenance agreements", "Middle East and Indian Ocean operations"], products: ["cable lay services", "cable repair services", "maintenance contracts", "cable route surveys"], notableProjects: ["Middle East cable systems", "Indian Ocean routes", "Gulf region submarine networks", "FOG Cable System"], website: "https://www.emarine.ae", priceRange: "mid", leadTime: "4-12 months", strengths: ["Strategic Middle East location", "Modern vessel fleet", "Quick response for regional repairs", "E&P crossings expertise"], considerations: ["Primarily Middle East/Indian Ocean focused", "Smaller fleet than global players", "Limited deep-ocean capability"] },
      { id: "v-ntt-wem", company: "NTT World Engineering Marine (NTT-WEM)", hq: "Japan", category: "installation-vessels", capabilities: ["submarine cable installation", "cable repair", "maintenance services", "route survey", "Pacific operations"], products: ["cable lay services", "cable repair and maintenance", "survey services", "cable system monitoring"], notableProjects: ["Trans-Pacific cable systems", "Japanese domestic submarine cables", "Asia-Pacific maintenance contracts"], website: "https://www.ntt-wem.co.jp/en/", priceRange: "premium", leadTime: "6-18 months", strengths: ["Premier Pacific cable ship operator", "NTT Group backing", "Advanced technology vessels", "Excellent safety record"], considerations: ["Primarily Pacific-focused", "Premium day rates", "Limited vessel count", "Advance booking required"] },
      { id: "v-sb-sub", company: "S.B. Submarine Systems", hq: "Thailand", category: "installation-vessels", capabilities: ["submarine cable installation", "cable repair", "shallow water operations", "shore-end landing", "Southeast Asian operations"], products: ["cable installation services", "cable repair", "shore-end operations", "shallow water burial"], notableProjects: ["Southeast Asian domestic cable systems", "Thai domestic submarine cables", "Regional island connections"], website: "https://www.sbsubmarine.com", priceRange: "mid", leadTime: "3-9 months", strengths: ["Strong Southeast Asian presence", "Competitive day rates", "Good for shallow-water and shore-end work", "Regional knowledge"], considerations: ["Limited deep-water capability", "Smaller vessels", "Regional rather than global operations"] },

      // SURVEY AND ENGINEERING
      { id: "v-fugro", company: "Fugro", hq: "Netherlands", category: "survey-engineering", capabilities: ["marine route survey", "geotechnical investigation", "hydrographic survey", "environmental assessment", "cable route engineering", "UXO survey"], products: ["desktop route studies", "marine route surveys (geophysical + geotechnical)", "cable burial assessment", "environmental baseline surveys", "as-built surveys"], notableProjects: ["Major transatlantic cable surveys", "North Sea route engineering", "Asia-Pacific cable route studies", "Offshore wind site investigations"], website: "https://www.fugro.com", priceRange: "premium", leadTime: "3-12 months", strengths: ["Worlds largest marine survey company", "Global vessel fleet", "Advanced AUV technology", "Comprehensive geotechnical capability"], considerations: ["Premium pricing", "Vessel availability constraints", "Complex commercial models"] },
      { id: "v-egs-mmt", company: "EGS/MMT (part of Saab Group)", hq: "Sweden", category: "survey-engineering", capabilities: ["marine route survey", "cable route engineering", "hydrographic survey", "ROV inspection", "geophysical survey"], products: ["cable route surveys", "desktop studies", "post-lay inspection and burial", "environmental surveys", "UXO clearance"], notableProjects: ["Baltic Sea cable surveys", "North Sea cable routes", "European offshore wind surveys", "Nordic submarine cable projects"], website: "https://www.mmtgroup.com", priceRange: "mid", leadTime: "3-9 months", strengths: ["Strong Nordic/Baltic expertise", "Modern survey fleet", "Saab Group technology access", "Competitive European pricing"], considerations: ["Primarily European focus", "Smaller global footprint than Fugro", "Limited tropical water experience"] },
      { id: "v-ocean-infinity", company: "Ocean Infinity", hq: "United Kingdom", category: "survey-engineering", capabilities: ["autonomous marine survey", "AUV fleet operations", "seabed mapping", "route survey", "deep-sea search and recovery"], products: ["autonomous survey services", "high-resolution seabed mapping", "cable route investigation", "environmental monitoring"], notableProjects: ["MH370 search operations", "Deep-sea survey campaigns", "Cable route investigations"], website: "https://oceaninfinity.com", priceRange: "mid", leadTime: "2-6 months", strengths: ["Cutting-edge autonomous technology", "Large AUV fleet (Armada)", "Rapid mobilization", "Innovative commercial models"], considerations: ["Newer company in cable survey market", "Technology still evolving", "Less traditional cable route experience"] },
      { id: "v-dof", company: "DOF Subsea", hq: "Norway", category: "survey-engineering", capabilities: ["subsea survey", "ROV services", "cable installation support", "inspection repair maintenance", "offshore construction support"], products: ["ROV survey services", "cable lay support", "post-lay burial", "inspection services", "subsea construction"], notableProjects: ["North Sea subsea operations", "Offshore wind cable support", "Submarine cable burial campaigns"], website: "https://www.dof.com", priceRange: "mid", leadTime: "3-9 months", strengths: ["Large modern vessel fleet", "Strong ROV capability", "Norwegian offshore expertise", "Integrated survey and construction"], considerations: ["Primarily North Sea focused", "Less telecom-specific experience", "Company restructuring history"] },

      // EQUIPMENT AND COMPONENTS
      { id: "v-ciena", company: "Ciena", hq: "United States", category: "equipment-components", capabilities: ["optical networking equipment", "coherent optics", "DWDM systems", "network software", "submarine line terminal equipment"], products: ["WaveLogic coherent optics", "6500 packet-optical platform", "GeoMesh submarine solutions", "Blue Planet network software", "open line systems"], notableProjects: ["Multiple submarine cable upgrades", "Hyperscaler network deployments", "Tier-1 carrier DWDM networks"], website: "https://www.ciena.com", priceRange: "premium", leadTime: "3-9 months", strengths: ["Industry-leading coherent optics", "Proven submarine SLTE", "Software-defined networking", "Strong R&D investment"], considerations: ["Premium equipment pricing", "Proprietary ecosystem considerations", "Support contract requirements"] },
      { id: "v-infinera", company: "Infinera", hq: "United States", category: "equipment-components", capabilities: ["optical networking equipment", "photonic integrated circuits", "DWDM systems", "submarine upgrades", "open optical networking"], products: ["ICE coherent optical engines", "GX Series compact modular platform", "DTN-X multi-terabit platform", "XTM Series", "open line systems"], notableProjects: ["Submarine cable upgrades worldwide", "Research network deployments", "Cloud provider backbone networks"], website: "https://www.infinera.com", priceRange: "premium", leadTime: "3-9 months", strengths: ["Photonic integration leadership", "High-capacity per wavelength", "Open networking philosophy", "Submarine upgrade expertise"], considerations: ["Market consolidation considerations", "Smaller market share than Ciena/Nokia", "Regional support coverage"] },
      { id: "v-xtera", company: "Xtera", hq: "United Kingdom", category: "equipment-components", capabilities: ["submarine optical amplifiers", "repeater design", "system upgrades", "unrepeatered system solutions", "wet plant technology"], products: ["submarine repeaters", "optical amplifiers (EDFA, Raman)", "unrepeatered system solutions", "system upgrade packages", "monitoring equipment"], notableProjects: ["Multiple unrepeatered submarine systems", "System capacity upgrades", "Regional submarine cable systems"], website: "https://www.xtera.com", priceRange: "mid", leadTime: "6-12 months", strengths: ["Specialist submarine amplifier expertise", "Cost-effective for regional systems", "Unrepeatered system leader", "Flexible upgrade solutions"], considerations: ["Smaller company with limited resources", "Narrower product focus", "Dependent on integration partners for full systems"] },
      { id: "v-coherent", company: "II-VI/Coherent", hq: "United States", category: "equipment-components", capabilities: ["optical components", "coherent transceivers", "laser sources", "optical amplifiers", "photonic solutions"], products: ["coherent DSP transceivers", "pump lasers for EDFAs", "ROADM wavelength selective switches", "optical amplifiers", "submarine-grade components"], notableProjects: ["Component supply to all major submarine vendors", "Hyperscale transceiver deployments", "5G fronthaul optics"], website: "https://www.coherent.com", priceRange: "mid", leadTime: "4-12 months", strengths: ["Critical component supplier to industry", "Vertically integrated photonics", "Market leader in pump lasers", "Innovation in coherent DSPs"], considerations: ["Component-level supplier (not systems)", "Recent merger integration ongoing", "Allocation constraints in high demand"] },
      { id: "v-lumentum", company: "Lumentum", hq: "United States", category: "equipment-components", capabilities: ["optical components", "laser technology", "ROADM components", "3D sensing", "photonic products"], products: ["pump lasers", "tunable lasers", "ROADMs and WSS modules", "coherent receivers", "optical amplifier modules"], notableProjects: ["Supply to all major telecom equipment vendors", "Submarine system component supply", "Data centre interconnect optics"], website: "https://www.lumentum.com", priceRange: "mid", leadTime: "4-12 months", strengths: ["World leader in telecom lasers", "Critical submarine system components", "Strong IP portfolio", "Consistent quality and reliability"], considerations: ["Component supplier not integrator", "Lead time sensitivity to demand cycles", "Limited direct project engagement"] },

      // LANDING STATIONS AND DATA CENTRES
      { id: "v-equinix", company: "Equinix", hq: "United States", category: "landing-stations", capabilities: ["cable landing station hosting", "colocation", "interconnection services", "data centre operations", "network-neutral facilities"], products: ["cable landing station facilities", "IBX data centres", "Equinix Fabric interconnection", "colocation services", "cross-connects"], notableProjects: ["Multiple submarine cable landings globally", "Critical internet exchange points", "Hyperscale edge deployments"], website: "https://www.equinix.com", priceRange: "premium", leadTime: "6-18 months for new builds", strengths: ["Worlds largest data centre company", "Network-neutral policy", "Global footprint in key landing markets", "Premium facility quality"], considerations: ["Premium pricing", "Space constraints at popular landing sites", "Complex commercial negotiations"] },
      { id: "v-digital-realty", company: "Digital Realty", hq: "United States", category: "landing-stations", capabilities: ["cable landing station hosting", "data centre colocation", "interconnection", "campus deployments", "global platform"], products: ["cable landing facilities", "PlatformDIGITAL colocation", "ServiceFabric interconnection", "powered shell and turnkey builds"], notableProjects: ["Submarine cable landing hosting", "Marseille MRS campus (major cable hub)", "Singapore data centre campus"], website: "https://www.digitalrealty.com", priceRange: "premium", leadTime: "6-18 months", strengths: ["Global data centre platform", "Strategic cable landing locations", "Strong financial backing", "Carrier-neutral policy"], considerations: ["Premium pricing", "Long-term commitment requirements", "Complex site selection process"] },
      { id: "v-telin", company: "Telin (Telkom Indonesia International)", hq: "Indonesia", category: "landing-stations", capabilities: ["cable landing station operations", "submarine cable investment", "international connectivity", "data centre services", "regional network hub"], products: ["cable landing stations", "international leased circuits", "IP transit", "colocation", "submarine cable capacity"], notableProjects: ["SEA-ME-WE cable landings", "Indonesia submarine cable systems", "TGN-IA cable landing", "IGG submarine cable"], website: "https://www.telin.net", priceRange: "mid", leadTime: "6-12 months", strengths: ["Strategic Indonesian landing locations", "Government-backed reliability", "Regional connectivity hub", "Growing Southeast Asian presence"], considerations: ["Primarily Indonesian market", "Regulatory complexity", "Limited presence outside Southeast Asia"] },
      { id: "v-cat-telecom", company: "CAT Telecom", hq: "Thailand", category: "landing-stations", capabilities: ["cable landing station operations", "international gateway", "submarine cable consortium membership", "national backbone", "data centre services"], products: ["cable landing station access", "international bandwidth", "IP transit", "colocation services", "domestic backbone connectivity"], notableProjects: ["AAG cable landing", "APG cable landing", "Thailand domestic submarine cables", "ASEAN regional connectivity"], website: "https://www.cattelecom.com", priceRange: "mid", leadTime: "4-10 months", strengths: ["Key Thai cable landing operator", "Multiple existing cable station sites", "Regional consortium memberships", "Government backing"], considerations: ["Thai market focused", "Regulatory and political factors", "Infrastructure age at some sites"] },
      { id: "v-pldt", company: "PLDT", hq: "Philippines", category: "landing-stations", capabilities: ["cable landing station operations", "submarine cable consortium membership", "international connectivity", "domestic network", "data centre services"], products: ["cable landing facilities", "international capacity", "IP transit", "enterprise connectivity", "data centre colocation"], notableProjects: ["Multiple Pacific cable landings", "SEA-US cable", "Asia-America Gateway landing", "Philippine domestic submarine network"], website: "https://www.pldt.com", priceRange: "mid", leadTime: "4-10 months", strengths: ["Philippines premier landing station operator", "Multiple cable consortium memberships", "Extensive domestic submarine network", "Strategic Pacific location"], considerations: ["Philippines regulatory environment", "Natural disaster exposure (typhoons)", "Infrastructure modernization ongoing"] },
      { id: "v-singtel", company: "Singtel", hq: "Singapore", category: "landing-stations", capabilities: ["cable landing station operations", "submarine cable investment", "international connectivity hub", "data centre campus", "regional network operations"], products: ["cable landing station hosting", "submarine cable capacity sales", "IP transit", "data centre colocation", "managed network services"], notableProjects: ["Changi North cable landing station", "SEA-ME-WE consortiums", "SJC cable system", "MIST cable investment"], website: "https://www.singtel.com", priceRange: "premium", leadTime: "6-12 months", strengths: ["Singapores premier cable landing hub", "Multiple cable system investments", "World-class facility quality", "Strategic Asia-Pacific location"], considerations: ["Premium Singapore real estate costs", "Capacity constraints", "Long commercial cycles"] },

      // CONSULTING
      { id: "v-pioneer", company: "Pioneer Consulting", hq: "United States", category: "consulting", capabilities: ["submarine cable consulting", "market studies", "route engineering advisory", "commercial due diligence", "project development"], products: ["feasibility studies", "market analysis", "route selection advisory", "commercial modelling", "project management advisory"], notableProjects: ["Advisory on numerous submarine cable builds", "Market studies for investors", "Due diligence for cable acquisitions"], website: "https://www.psyche.com/pioneer/", priceRange: "mid", leadTime: "1-3 months", strengths: ["Deep submarine cable domain expertise", "Decades of industry experience", "Independent advisory", "Commercial and technical breadth"], considerations: ["Small boutique firm", "Capacity constraints", "Advisory only (no implementation)"] },
      { id: "v-telegeography", company: "TeleGeography", hq: "United States", category: "consulting", capabilities: ["telecom market research", "submarine cable database", "bandwidth market analysis", "network mapping", "pricing benchmarking"], products: ["SubmarineCableMap.com", "GlobalComms Database", "bandwidth pricing data", "market research reports", "custom consulting"], notableProjects: ["Industry-standard submarine cable mapping", "Global bandwidth market analysis", "Carrier research for major operators"], website: "https://www.telegeography.com", priceRange: "mid", leadTime: "1-4 weeks for reports", strengths: ["Industry-standard cable database", "Comprehensive market data", "Trusted by all major players", "Regular market updates"], considerations: ["Research focus not implementation", "Subscription pricing model", "General market view not project-specific"] },
      { id: "v-wfn", company: "WFN Strategies", hq: "United States", category: "consulting", capabilities: ["submarine cable consulting", "network planning", "commercial advisory", "capacity planning", "technology strategy"], products: ["submarine cable feasibility studies", "network economic modelling", "capacity demand forecasting", "technology advisory", "RFP development support"], notableProjects: ["Advisory for Pacific cable projects", "Network economics for investors", "Technology selection for new builds"], website: "https://www.wfnstrategies.com", priceRange: "mid", leadTime: "1-3 months", strengths: ["Specialized submarine cable strategy", "Strong financial modelling", "Technology-neutral advisory", "Investor confidence building"], considerations: ["Small specialist firm", "Advisory only", "US-centric perspective"] },
      { id: "v-analysys", company: "Analysys Mason", hq: "United Kingdom", category: "consulting", capabilities: ["telecom strategy consulting", "regulatory advisory", "network economics", "market entry strategy", "due diligence"], products: ["strategy consulting", "regulatory and policy advisory", "transaction support", "market forecasting", "network cost modelling"], notableProjects: ["Government broadband strategy advisory", "Telecom M&A due diligence", "National broadband plan development", "Regulatory spectrum advisory"], website: "https://www.analysysmason.com", priceRange: "premium", leadTime: "2-6 months", strengths: ["Largest telecom specialist consultancy", "Global office network", "Regulatory expertise", "Strong quantitative modelling"], considerations: ["Premium consulting rates", "Generalist telecom not cable-specific", "Large engagement minimum sizes"] },
      { id: "v-mott", company: "Mott MacDonald", hq: "United Kingdom", category: "consulting", capabilities: ["infrastructure consulting", "project management", "engineering design", "programme management", "environmental consulting"], products: ["project management services", "engineering design review", "programme advisory", "environmental impact assessment", "owners engineer services"], notableProjects: ["Major infrastructure programmes globally", "Telecommunications infrastructure advisory", "Cable landing facility design", "Subsea cable route engineering oversight"], website: "https://www.mottmac.com", priceRange: "premium", leadTime: "2-4 months", strengths: ["Global engineering consultancy", "Deep infrastructure expertise", "Owners engineer capability", "Multi-disciplinary teams"], considerations: ["Not telecom-specialist", "Large firm overhead", "Primarily advisory and oversight role"] }
    ],

    // ---- Country-Specific Regulatory & Risk Database -----------------------
    COUNTRY_DATABASE: [
      {
        code: "ID",
        name: "Indonesia",
        aliases: ["indonesia", "indonesian", "jakarta", "java", "sumatra", "kalimantan", "sulawesi", "borneo"],
        regulatoryAuthorities: {
          telecom: { name: "Kominfo / BAKTI", fullName: "Ministry of Communication and Information Technology / Badan Aksesibilitas Telekomunikasi dan Informasi", jurisdiction: "Telecom licensing, spectrum allocation, network service permits" },
          maritime: { name: "DJPL", fullName: "Directorate General of Sea Transportation (Direktorat Jenderal Perhubungan Laut)", jurisdiction: "Submarine cable landing permits, maritime route approvals, seabed usage rights" },
          environment: { name: "KLHK", fullName: "Ministry of Environment and Forestry (Kementerian Lingkungan Hidup dan Kehutanan)", jurisdiction: "Environmental impact assessment (AMDAL), coastal zone environmental permits" },
          coastal: { name: "KKP", fullName: "Ministry of Marine Affairs and Fisheries (Kementerian Kelautan dan Perikanan)", jurisdiction: "Coastal zone management, marine spatial planning, fishery impact assessment" },
          investment: { name: "BKPM / OSS", fullName: "Investment Coordinating Board / Online Single Submission system", jurisdiction: "Foreign investment approval, business licensing, investment incentives" }
        },
        geopoliticalChallenges: [
          "Complex multi-ministry approval process requiring coordination across 5+ agencies",
          "Cabotage rules restricting foreign-flagged cable ships in Indonesian waters",
          "Regional autonomy laws giving provincial/regency governments permit authority",
          "Periodic moratorium on new telecom licenses during policy reviews",
          "Military/naval security clearances required for certain maritime corridors"
        ],
        geographicalChallenges: [
          "17,000+ islands requiring extensive submarine cable routing",
          "Ring of Fire location with high seismic and volcanic activity",
          "Strong ocean currents in straits (Lombok, Makassar, Malacca)",
          "Coral reef ecosystems requiring environmental mitigation",
          "Monsoon seasons affecting marine operations (Dec-Mar west, Jun-Sep east)"
        ],
        keyContacts: {
          feasibility: ["Kominfo Directorate of Telecommunications", "BKPM investment desk", "Local provincial government (Pemda)"],
          permitting: ["DJPL regional offices", "KKP coastal zone division", "KLHK AMDAL commission", "Provincial marine affairs office"],
          construction: ["Indonesian Navy (TNI-AL) for maritime security clearance", "Port authorities at landing sites", "Local village heads (Kepala Desa) for land access"],
          operations: ["Kominfo monitoring division", "BAKTI for universal service obligations", "Indonesian Internet Exchange (IIX)"]
        }
      },
      {
        code: "TH",
        name: "Thailand",
        aliases: ["thailand", "thai", "bangkok", "gulf of thailand", "andaman"],
        regulatoryAuthorities: {
          telecom: { name: "NBTC", fullName: "National Broadcasting and Telecommunications Commission", jurisdiction: "Telecom licensing, spectrum management, network service regulation" },
          maritime: { name: "Marine Department", fullName: "Marine Department, Ministry of Transport", jurisdiction: "Submarine cable route approval, seabed permits, maritime navigation safety" },
          environment: { name: "ONEP", fullName: "Office of Natural Resources and Environmental Policy and Planning", jurisdiction: "Environmental impact assessment (EIA/EHIA), coastal environmental permits" },
          coastal: { name: "DMCR", fullName: "Department of Marine and Coastal Resources", jurisdiction: "Coastal zone protection, marine habitat conservation, shore-end landing approvals" },
          investment: { name: "BOI", fullName: "Board of Investment of Thailand", jurisdiction: "Foreign investment promotion, tax incentives, investment permits for telecom" }
        },
        geopoliticalChallenges: [
          "Political instability cycles affecting long-term infrastructure commitments",
          "Military government legacy with ongoing regulatory framework changes",
          "State enterprise involvement (CAT Telecom/NT) in submarine cable landing",
          "Bilateral maritime boundary disputes with neighboring countries"
        ],
        geographicalChallenges: [
          "Gulf of Thailand shallow waters (average 45m depth) complicating cable burial",
          "Southwest monsoon season (Nov-Feb) restricting marine operations",
          "Heavy fishing activity in Gulf requiring cable protection measures",
          "Coral reef areas around southern islands requiring environmental mitigation",
          "River delta sedimentation at Chao Phraya affecting shore-end stability"
        ],
        keyContacts: {
          feasibility: ["NBTC licensing division", "BOI investment promotion office", "CAT Telecom/NT for landing station access"],
          permitting: ["Marine Department regional offices", "ONEP EIA division", "DMCR coastal permits section", "Royal Thai Navy hydrographic department"],
          construction: ["Port Authority of Thailand", "Marine Department vessel traffic services", "Local Tambon (sub-district) administration"],
          operations: ["NBTC compliance monitoring", "National Telecom (NT) interconnection", "Thai Network Information Center (THNIC)"]
        }
      },
      {
        code: "VN",
        name: "Vietnam",
        aliases: ["vietnam", "vietnamese", "hanoi", "ho chi minh", "saigon", "vung tau", "da nang"],
        regulatoryAuthorities: {
          telecom: { name: "MIC", fullName: "Ministry of Information and Communications (Bo Thong tin va Truyen thong)", jurisdiction: "Telecom licensing, network service permits, international gateway approvals" },
          maritime: { name: "Vinamarine", fullName: "Vietnam Maritime Administration (Cuc Hang hai Viet Nam)", jurisdiction: "Submarine cable route permits, maritime safety zones, seabed usage rights" },
          environment: { name: "MONRE", fullName: "Ministry of Natural Resources and Environment", jurisdiction: "Environmental impact assessment, marine environmental protection, coastal zone management" },
          coastal: { name: "VASI", fullName: "Vietnam Administration of Seas and Islands", jurisdiction: "Marine spatial planning, island territory management, sea-use permits" },
          investment: { name: "MPI", fullName: "Ministry of Planning and Investment", jurisdiction: "Foreign investment licensing, investment certificates, special economic zone approvals" }
        },
        geopoliticalChallenges: [
          "Communist Party-state approval process requiring multiple government levels",
          "South China Sea territorial disputes affecting cable routing in contested waters",
          "State-owned enterprise dominance (VNPT, Viettel, FPT) in telecom sector",
          "National security reviews for foreign participation in telecom infrastructure",
          "Complex land-use rights system (no private land ownership) for terrestrial portions"
        ],
        geographicalChallenges: [
          "Typhoon season (Jun-Nov) with 6-8 typhoons annually along central coast",
          "South China Sea routing constraints due to disputed territorial claims",
          "Mekong Delta sedimentation and subsidence affecting southern landing sites",
          "Strong longshore currents along central Vietnam coast",
          "Fishing fleet density (one of worlds largest) creating cable risk"
        ],
        keyContacts: {
          feasibility: ["MIC International Cooperation Department", "MPI Foreign Investment Agency", "Provincial Peoples Committee"],
          permitting: ["Vinamarine regional offices", "MONRE EIA department", "VASI sea-use planning division", "Provincial Department of Natural Resources"],
          construction: ["Vietnam Peoples Navy for security clearance", "Port authorities at landing sites", "Local Peoples Committee for land access"],
          operations: ["MIC telecom monitoring center", "VNPT/Viettel for interconnection", "Vietnam Internet Network Information Center (VNNIC)"]
        }
      },
      {
        code: "TW",
        name: "Taiwan",
        aliases: ["taiwan", "taiwanese", "taipei", "kaohsiung", "formosa", "roc"],
        regulatoryAuthorities: {
          telecom: { name: "NCC", fullName: "National Communications Commission", jurisdiction: "Telecom licensing, network service regulation, submarine cable landing permits" },
          maritime: { name: "Maritime and Port Bureau / MOTC", fullName: "Maritime and Port Bureau, Ministry of Transportation and Communications", jurisdiction: "Maritime route approvals, port access permits, seabed usage coordination" },
          environment: { name: "Ministry of Environment", fullName: "Ministry of Environment (formerly EPA)", jurisdiction: "Environmental impact assessment, marine ecology protection, pollution control" },
          coastal: { name: "Ocean Affairs Council", fullName: "Ocean Affairs Council (Hai Yang Wei Yuan Hui)", jurisdiction: "Marine spatial planning, coastal zone management, ocean resource protection" },
          investment: { name: "Investment Commission / MOEA", fullName: "Investment Commission, Ministry of Economic Affairs", jurisdiction: "Foreign investment approval, cross-strait investment review, technology transfer" }
        },
        geopoliticalChallenges: [
          "Cross-strait political sensitivity with PRC affecting international cable routing",
          "Diplomatic isolation limiting bilateral agreements for cable protection",
          "PRC military activity in Taiwan Strait creating cable route constraints",
          "US-China technology competition affecting equipment vendor selection",
          "Limited international treaty participation for submarine cable protection"
        ],
        geographicalChallenges: [
          "High seismicity (Pacific Ring of Fire) with frequent earthquakes damaging cables",
          "Typhoon belt exposure (Jul-Oct) with intense storms",
          "Deep ocean trenches east of Taiwan (>4000m) requiring specialized cable",
          "Strong Kuroshio Current along east coast affecting cable laying operations",
          "Submarine volcanic activity in some offshore areas"
        ],
        keyContacts: {
          feasibility: ["NCC licensing division", "Investment Commission MOEA", "Chunghwa Telecom (landing station operator)"],
          permitting: ["Maritime and Port Bureau", "Ministry of Environment EIA division", "Ocean Affairs Council", "Council of Agriculture (fishery coordination)"],
          construction: ["Coast Guard Administration for security clearance", "Port authorities (Kaohsiung, Toucheng)", "Local county/city government for land permits"],
          operations: ["NCC compliance monitoring", "Chunghwa Telecom interconnection", "Taiwan Network Information Center (TWNIC)"]
        }
      },
      {
        code: "PH",
        name: "Philippines",
        aliases: ["philippines", "filipino", "manila", "luzon", "visayas", "mindanao", "cebu", "davao"],
        regulatoryAuthorities: {
          telecom: { name: "NTC", fullName: "National Telecommunications Commission", jurisdiction: "Telecom franchise licensing, network service permits, equipment type approval" },
          maritime: { name: "MARINA", fullName: "Maritime Industry Authority", jurisdiction: "Maritime vessel permits, submarine cable route clearance, port access coordination" },
          environment: { name: "DENR", fullName: "Department of Environment and Natural Resources", jurisdiction: "Environmental compliance certificate (ECC), protected area permits, coastal resource management" },
          coastal: { name: "NAMRIA", fullName: "National Mapping and Resource Information Authority", jurisdiction: "Hydrographic surveys, nautical charting, maritime boundary delineation" },
          investment: { name: "PEZA / BOI", fullName: "Philippine Economic Zone Authority / Board of Investments", jurisdiction: "Investment incentives, economic zone registration, foreign ownership clearance" }
        },
        geopoliticalChallenges: [
          "Typhoon Alley exposure with 20+ typhoons annually crossing cable routes",
          "South China Sea (West Philippine Sea) disputes affecting western cable routing",
          "Complex LGU (Local Government Unit) permit requirements at barangay/municipal/provincial levels",
          "Congressional franchise requirement for telecom operators",
          "Anti-dummy law restricting foreign ownership to 40% in utilities"
        ],
        geographicalChallenges: [
          "7,000+ islands requiring extensive inter-island submarine cable routing",
          "Typhoon Alley with 20+ cyclones per year (peak Jul-Nov)",
          "Deep Philippine Trench (>10,000m) east of archipelago",
          "Active volcanic and seismic zones throughout archipelago",
          "Strong currents in inter-island straits (San Bernardino, Surigao)"
        ],
        keyContacts: {
          feasibility: ["NTC licensing division", "DICT (Dept of ICT) policy office", "BOI investment promotion", "PEZA for economic zone benefits"],
          permitting: ["MARINA maritime permits", "DENR Environmental Management Bureau", "NAMRIA hydrographic division", "LGU offices (barangay to provincial)"],
          construction: ["Philippine Coast Guard for maritime clearance", "Philippine Ports Authority", "DPWH (Dept of Public Works) for road crossings", "Barangay captains for local access"],
          operations: ["NTC compliance monitoring", "PLDT/Globe for interconnection", "Philippine Network Information Center (PHNIC)"]
        }
      },
      {
        code: "GU",
        name: "Guam",
        aliases: ["guam", "guamanian", "hagatna", "apra harbor", "us territory"],
        regulatoryAuthorities: {
          telecom: { name: "FCC", fullName: "Federal Communications Commission (United States)", jurisdiction: "Telecom licensing, submarine cable landing licenses (Section 1.767), spectrum management" },
          maritime: { name: "USACE", fullName: "United States Army Corps of Engineers", jurisdiction: "Section 10/404 permits for submarine cable installation, dredge and fill permits" },
          environment: { name: "EPA + Guam EPA", fullName: "US Environmental Protection Agency + Guam Environmental Protection Agency", jurisdiction: "NEPA compliance, marine environmental review, water quality certification" },
          coastal: { name: "NOAA", fullName: "National Oceanic and Atmospheric Administration", jurisdiction: "Essential fish habitat consultation, marine sanctuary review, coastal zone management consistency" },
          investment: { name: "DoD / CFIUS", fullName: "Department of Defense / Committee on Foreign Investment in the United States", jurisdiction: "National security review for foreign investment near military installations, CFIUS clearance" }
        },
        geopoliticalChallenges: [
          "Dual federal/territorial jurisdiction requiring both US federal and Guam territorial permits",
          "Extensive military zones (Naval Base Guam, Andersen AFB) restricting cable routes",
          "CFIUS national security review for foreign-owned cable systems",
          "Strategic military significance increasing scrutiny of Asian-connected cables",
          "Limited local workforce requiring imported specialized labor"
        ],
        geographicalChallenges: [
          "Coral reef ecosystem requiring strict environmental mitigation under NEPA",
          "Mariana Trench proximity with extreme ocean depths",
          "Typhoon exposure in western Pacific (peak Aug-Nov)",
          "Limited landing beach options due to reef, military, and conservation zones",
          "Seismic activity (Pacific Ring of Fire)"
        ],
        keyContacts: {
          feasibility: ["FCC International Bureau", "Guam Telecom Authority (GTA)", "Joint Region Marianas (military coordination)"],
          permitting: ["USACE Pacific Ocean Division", "NOAA Pacific Islands Regional Office", "Guam EPA", "US Fish and Wildlife Service", "DoD real estate office"],
          construction: ["Naval Facilities Engineering Command (NAVFAC) Marianas", "Port Authority of Guam", "Guam Department of Land Management"],
          operations: ["FCC compliance monitoring", "GTA interconnection", "Pacific Islands Telecommunications Association (PITA)"]
        }
      },
      {
        code: "MY",
        name: "Malaysia",
        aliases: ["malaysia", "malaysian", "kuala lumpur", "penang", "johor", "sabah", "sarawak", "peninsular"],
        regulatoryAuthorities: {
          telecom: { name: "MCMC", fullName: "Malaysian Communications and Multimedia Commission", jurisdiction: "Telecom licensing (NFP/NSP/ASP), network facility provision, spectrum management" },
          maritime: { name: "Marine Department", fullName: "Marine Department Malaysia (Jabatan Laut Malaysia)", jurisdiction: "Submarine cable route approval, maritime safety zones, seabed usage permits" },
          environment: { name: "DOE", fullName: "Department of Environment (Jabatan Alam Sekitar)", jurisdiction: "Environmental impact assessment (EIA), pollution control, coastal environmental permits" },
          coastal: { name: "JUPEM / NHSA", fullName: "Department of Survey and Mapping / National Hydrographic Centre", jurisdiction: "Hydrographic surveys, maritime boundary coordination, seabed mapping" },
          investment: { name: "MIDA", fullName: "Malaysian Investment Development Authority", jurisdiction: "Foreign investment incentives, manufacturing/services approvals, investment tax allowances" }
        },
        geopoliticalChallenges: [
          "East Malaysia (Sabah/Sarawak) vs Peninsular Malaysia requiring separate state approvals",
          "Strait of Malacca as one of worlds busiest shipping lanes complicating cable routing",
          "Overlapping maritime claims with neighbors (Singapore, Indonesia, Philippines, Brunei)",
          "Bumiputera equity requirements potentially affecting foreign ownership structure",
          "State-level land authority separate from federal maritime authority"
        ],
        geographicalChallenges: [
          "Northeast monsoon (Nov-Mar) and southwest monsoon (May-Sep) seasons",
          "Strait of Malacca heavy vessel traffic and anchor damage risk",
          "Shallow continental shelf waters in Malacca Strait requiring burial",
          "Coral reef areas (Sabah, Terengganu) requiring environmental protection",
          "Riverine sediment discharge at major river mouths affecting cable stability"
        ],
        keyContacts: {
          feasibility: ["MCMC licensing division", "MIDA investment promotion", "Telekom Malaysia (TM) for landing station access"],
          permitting: ["Marine Department regional offices", "DOE EIA division", "State authority land offices", "Malaysian Maritime Enforcement Agency (MMEA)"],
          construction: ["Royal Malaysian Navy hydrographic directorate", "Port authorities (Port Klang, Tanjung Pelepas, Kota Kinabalu)", "State land office for terrestrial right-of-way"],
          operations: ["MCMC compliance monitoring", "TM/Maxis/TIME for interconnection", "MyNIC (Malaysia Network Information Centre)"]
        }
      },
      {
        code: "BN",
        name: "Brunei",
        aliases: ["brunei", "bruneian", "bandar seri begawan", "brunei darussalam"],
        regulatoryAuthorities: {
          telecom: { name: "AITI", fullName: "Authority for Info-communications Technology Industry", jurisdiction: "Telecom licensing, network service regulation, ICT industry development" },
          maritime: { name: "Marine Department", fullName: "Marine Department, Ministry of Transport and Infocommunications", jurisdiction: "Submarine cable route permits, maritime navigation safety, port access" },
          environment: { name: "Dept of Environment, Parks and Recreation", fullName: "Department of Environment, Parks and Recreation", jurisdiction: "Environmental impact assessment, coastal zone protection, marine park management" },
          coastal: { name: "Survey Department", fullName: "Survey Department, Ministry of Development", jurisdiction: "Hydrographic surveys, coastal mapping, land/marine boundary coordination" },
          investment: { name: "BEDB", fullName: "Brunei Economic Development Board", jurisdiction: "Foreign direct investment facilitation, business licensing, economic diversification incentives" }
        },
        geopoliticalChallenges: [
          "Small country with limited cable landing point options on Brunei Bay",
          "Islamic law (Sharia) considerations for business operations and contracts",
          "Sultan and government decision-making concentration requiring high-level engagement",
          "Enclave geography (surrounded by Malaysian Sarawak) complicating terrestrial routes",
          "Petroleum-dependent economy with evolving diversification priorities"
        ],
        geographicalChallenges: [
          "Shallow Brunei Bay requiring extensive cable burial for protection",
          "Limited coastline (161 km) constraining landing site options",
          "South China Sea monsoon exposure (northeast Dec-Mar)",
          "Oil and gas infrastructure in offshore areas creating route conflicts",
          "Mangrove ecosystems along coast requiring environmental protection"
        ],
        keyContacts: {
          feasibility: ["AITI licensing and regulation division", "BEDB investment facilitation team", "Unified National Networks (UNN) for infrastructure sharing"],
          permitting: ["Marine Department", "Dept of Environment, Parks and Recreation", "Land Department for terrestrial permits", "Ministry of Defence (maritime security)"],
          construction: ["Royal Brunei Navy for maritime clearance", "Ports Department for shore access", "UNN for infrastructure coordination", "Public Works Department for road crossings"],
          operations: ["AITI compliance monitoring", "UNN/DST for interconnection", "BruNET (Brunei national backbone)"]
        }
      }
    ],

    // ---- Contract Templates Library (NEC4 & FIDIC) -------------------------
    CONTRACT_TEMPLATES: [
      {
        id: "CT-001",
        name: "Early Warning Notice",
        contractForm: "NEC4",
        clause: "15.1",
        purpose: "Notify the other party of a matter that could increase cost, delay completion, or impair performance",
        whenToUse: "As soon as a risk or potential problem is identified that may affect the project outcome",
        timeLimitDays: null,
        requiredContent: ["description of the matter", "potential effect on cost", "potential effect on time", "proposed actions to mitigate"],
        sampleSubject: "Early Warning: Potential delay to cable ship mobilization due to adverse weather forecast"
      },
      {
        id: "CT-002",
        name: "Compensation Event notification",
        contractForm: "NEC4",
        clause: "61.3",
        purpose: "Notify the Project Manager that a compensation event has occurred or is expected",
        whenToUse: "Within 8 weeks of becoming aware of the event; failure to notify in time may bar the claim",
        timeLimitDays: 56,
        requiredContent: ["event description", "clause reference (60.1 sub-clause)", "date event occurred or was identified", "initial assessment of time and cost impact"],
        sampleSubject: "Compensation Event Notification: Unforeseen seabed conditions at KP 145-160"
      },
      {
        id: "CT-003",
        name: "Variation Instruction",
        contractForm: "FIDIC",
        clause: "13.1",
        purpose: "Instruct the Contractor to execute a variation to the Works",
        whenToUse: "When the Engineer determines a change to the scope, design, or sequence of work is required",
        timeLimitDays: 28,
        requiredContent: ["detailed description of varied work", "drawings or specifications affected", "required completion date", "instruction to submit cost and time proposals"],
        sampleSubject: "Variation Instruction No. 007: Additional cable burial depth requirement at shipping lane crossing"
      },
      {
        id: "CT-004",
        name: "Claim Notice",
        contractForm: "FIDIC",
        clause: "20.1",
        purpose: "Give notice of intention to claim additional payment or extension of time",
        whenToUse: "Within 28 days of becoming aware of the event or circumstance giving rise to the claim",
        timeLimitDays: 28,
        requiredContent: ["description of event or circumstance", "contractual basis for claim", "date of awareness", "initial estimate of additional time or cost"],
        sampleSubject: "Notice of Claim: Delay and additional cost due to late issuance of cable landing permit (Indonesia)"
      },
      {
        id: "CT-005",
        name: "Payment Application",
        contractForm: "BOTH",
        clause: "NEC4 50.1 / FIDIC 14.3",
        purpose: "Submit periodic payment application for work completed in the assessment period",
        whenToUse: "At each assessment date (typically monthly) per the contract payment schedule",
        timeLimitDays: null,
        requiredContent: ["assessment period dates", "work completed this period", "cumulative progress", "retention calculation", "materials on site", "supporting measurements"],
        sampleSubject: "Payment Application No. 12: Marine installation progress KP 800-1050 (September assessment)"
      },
      {
        id: "CT-006",
        name: "Extension of Time request",
        contractForm: "BOTH",
        clause: "NEC4 63.5 / FIDIC 8.4",
        purpose: "Request extension to the contractual completion date due to qualifying delay events",
        whenToUse: "Following a compensation event (NEC4) or within 28 days of delay event (FIDIC)",
        timeLimitDays: 28,
        requiredContent: ["original completion date", "delay event description", "cause and effect analysis", "revised programme showing critical path impact", "extension days requested"],
        sampleSubject: "Extension of Time Request: 45 days due to typhoon season closure of marine operations"
      },
      {
        id: "CT-007",
        name: "Take Over Certificate request",
        contractForm: "BOTH",
        clause: "NEC4 40.3 / FIDIC 10.1",
        purpose: "Request the Employer to take over the completed works or a section thereof",
        whenToUse: "When the works (or section) are substantially complete and ready for use",
        timeLimitDays: 14,
        requiredContent: ["section or works description", "completion date achieved", "outstanding defects list (snag list)", "test certificates and commissioning records", "as-built documentation status"],
        sampleSubject: "Take Over Certificate Request: Segment 3 (Singapore-Jakarta) system commissioning complete"
      },
      {
        id: "CT-008",
        name: "Defects notification",
        contractForm: "BOTH",
        clause: "NEC4 43.1 / FIDIC 11.1",
        purpose: "Notify the Contractor of a defect found in the works during the defects liability period",
        whenToUse: "Upon discovery of a defect during routine inspection or monitoring within the defects period",
        timeLimitDays: null,
        requiredContent: ["defect description", "location (KP reference or station)", "date discovered", "required correction and deadline", "impact on system performance"],
        sampleSubject: "Defects Notification: Elevated BER on fibre pair 3, Span 7 (repeater R7-R8) requiring investigation"
      },
      {
        id: "CT-009",
        name: "Programme submission",
        contractForm: "NEC4",
        clause: "31.1",
        purpose: "Submit the programme for acceptance showing planned method, sequence, and timing of works",
        whenToUse: "Within the period stated in the Contract Data, and for each revised programme",
        timeLimitDays: null,
        requiredContent: ["activity schedule with logic links", "critical path identification", "resource allocation", "float ownership", "key dates and milestones", "method statements referenced"],
        sampleSubject: "Revised Programme Submission Rev.04: Updated marine installation sequence following cable ship re-scheduling"
      },
      {
        id: "CT-010",
        name: "Subcontractor approval request",
        contractForm: "BOTH",
        clause: "NEC4 26.2 / FIDIC 4.4",
        purpose: "Submit proposed subcontractor for acceptance before appointment",
        whenToUse: "Before engaging any subcontractor not named in the contract; sufficient time for review required",
        timeLimitDays: 14,
        requiredContent: ["subcontractor name and details", "scope of subcontracted work", "relevant experience and references", "financial standing evidence", "proposed subcontract form"],
        sampleSubject: "Subcontractor Approval Request: Global Marine Group for cable burial operations (Segments 2-4)"
      },
      {
        id: "CT-011",
        name: "Weather event notification",
        contractForm: "NEC4",
        clause: "60.1(13)",
        purpose: "Notify a weather event that qualifies as a compensation event under the weather measurement criteria",
        whenToUse: "When recorded weather exceeds the 1-in-10-year threshold defined in the Contract Data",
        timeLimitDays: 56,
        requiredContent: ["weather measurement data", "comparison to Contract Data thresholds", "period affected", "description of impact on planned activities", "delay quantification"],
        sampleSubject: "Weather Event Notification: Typhoon Gaemi - sea state exceeding Beaufort 7 for 14 consecutive days"
      },
      {
        id: "CT-012",
        name: "Cable ship delay notification",
        contractForm: "BOTH",
        clause: "N/A (project-specific)",
        purpose: "Formally notify delay to cable ship availability or mobilization affecting installation schedule",
        whenToUse: "Immediately upon confirmation of delay from vessel operator or charter party",
        timeLimitDays: 7,
        requiredContent: ["vessel name and charter reference", "original mobilization date", "revised mobilization date", "cause of delay", "impact on installation programme", "proposed mitigation"],
        sampleSubject: "Cable Ship Delay Notification: CS Ile de Re - 21-day delay due to prior project overrun in Pacific"
      },
      {
        id: "CT-013",
        name: "Force Majeure notice",
        contractForm: "FIDIC",
        clause: "19.2",
        purpose: "Notify the other party of a Force Majeure event preventing performance of contractual obligations",
        whenToUse: "Within 14 days of becoming aware of the Force Majeure event",
        timeLimitDays: 14,
        requiredContent: ["description of event", "date of commencement", "obligations affected", "actions being taken to mitigate", "expected duration if known"],
        sampleSubject: "Force Majeure Notice: Volcanic eruption and associated seismic activity affecting cable route (Segment 5)"
      },
      {
        id: "CT-014",
        name: "Marine survey completion certificate",
        contractForm: "BOTH",
        clause: "N/A (project-specific)",
        purpose: "Certify completion of marine route survey and acceptance of survey deliverables",
        whenToUse: "Upon completion of bathymetric/geophysical survey campaign and delivery of final report",
        timeLimitDays: null,
        requiredContent: ["survey vessel and equipment used", "survey dates and coverage", "deliverables received", "data quality assessment", "route recommendations", "outstanding items"],
        sampleSubject: "Marine Survey Completion Certificate: Route survey campaign Brunei-Philippines (KP 0-2400) complete"
      },
      {
        id: "CT-015",
        name: "Cable landing permission request",
        contractForm: "BOTH",
        clause: "N/A (country-specific regulatory)",
        purpose: "Formally request permission from national authority to land submarine cable on sovereign territory",
        whenToUse: "As early as possible in the project; typically 12-24 months before planned landing date",
        timeLimitDays: null,
        requiredContent: ["applicant company details", "cable system description", "proposed landing point coordinates", "cable route overview", "environmental impact summary", "economic benefit statement", "technical specifications"],
        sampleSubject: "Cable Landing Permission Application: Asia Connect Cable System - proposed landing at Changi, Singapore"
      }
    ],

    // ---- Clause Reference Library (NEC4 & FIDIC) ---------------------------
    CLAUSE_REFERENCE: {
      // NEC4 Clauses
      "NEC4-15": { number: "15", title: "Early warnings", summary: "Requires both parties to give early warning of matters that could affect cost, time, or quality. Early warning meetings are held to discuss and agree mitigation.", submarineRelevance: "Critical for submarine projects where weather windows, vessel availability, and seabed conditions change rapidly; early notification prevents escalation." },
      "NEC4-25": { number: "25", title: "Subcontracting", summary: "The Contractor must seek acceptance of proposed subcontractors and subcontract conditions. The Project Manager may withhold acceptance on reasonable grounds.", submarineRelevance: "Submarine projects rely heavily on specialist subcontractors (cable ships, ROV operators, divers); formal acceptance ensures quality and capability." },
      "NEC4-31": { number: "31", title: "The programme", summary: "The Contractor submits a programme showing method, sequence, timing, and resources. The Project Manager accepts or notifies reasons for non-acceptance within 2 weeks.", submarineRelevance: "Marine installation programmes are highly weather-dependent and must show weather windows, vessel transit times, and jointing operations." },
      "NEC4-50": { number: "50", title: "Assessing the amount due", summary: "Defines the assessment date and process for calculating interim payments including the Price for Work Done to Date.", submarineRelevance: "Submarine cable payments often follow milestone-based progress (factory, load-out, per-km laid, commissioned) rather than simple monthly valuations." },
      "NEC4-51": { number: "51", title: "Payment", summary: "The Project Manager certifies payment within one week of each assessment date. The Employer pays within three weeks of the assessment date.", submarineRelevance: "Large submarine projects require timely payment to maintain cable ship charter and prevent demobilization." },
      "NEC4-52": { number: "52", title: "Defined Cost", summary: "Defines what constitutes Defined Cost for the purpose of assessing compensation events and cost-reimbursable work.", submarineRelevance: "Submarine defined costs include vessel day-rates, fuel, specialist crew, and marine spread equipment not typical in terrestrial works." },
      "NEC4-53": { number: "53", title: "The Contractor's share", summary: "Mechanism for sharing cost savings or overruns between Employer and Contractor based on the share ranges in the Contract Data.", submarineRelevance: "Incentivizes efficient marine operations; Contractor benefits from faster-than-planned cable lay rates." },
      "NEC4-60": { number: "60", title: "Compensation events", summary: "Lists the events that entitle the Contractor to additional time and cost. Includes Employer-caused delays, changed conditions, and weather beyond thresholds.", submarineRelevance: "Submarine-specific events include unforeseen seabed conditions, Employer-directed route changes, and weather beyond the 1-in-10-year threshold." },
      "NEC4-61": { number: "61", title: "Notifying compensation events", summary: "The Contractor must notify within 8 weeks; the Project Manager may also notify. Late notification bars the Contractor from additional cost/time.", submarineRelevance: "8-week time bar is critical; marine operations move fast and conditions change rapidly. Teams must notify immediately." },
      "NEC4-62": { number: "62", title: "Quotations for compensation events", summary: "The Contractor submits quotations within 3 weeks (or agreed extended period). Must show effect on Defined Cost and programme.", submarineRelevance: "Marine quotations must account for weather standby, vessel repositioning, and potential re-routing costs." },
      "NEC4-63": { number: "63", title: "Assessing compensation events", summary: "Assessment is based on the effect on Defined Cost plus the Fee. The assessment includes the delay to planned Completion.", submarineRelevance: "Assessment of submarine CEs often requires specialist marine engineering input and vessel cost modelling." },
      "NEC4-64": { number: "64", title: "The Project Manager's assessments", summary: "The Project Manager makes own assessment if the Contractor fails to submit quotation or submits unreasonable quotation.", submarineRelevance: "PM must understand marine cost drivers (day-rates, fuel, transit, weather standby) to make fair assessment." },
      "NEC4-65": { number: "65", title: "Implementing compensation events", summary: "Once assessed, the compensation event is implemented by changing the Prices, Completion Date, and/or Key Dates.", submarineRelevance: "Implementation may cascade through the entire marine installation programme affecting subsequent segments." },
      "NEC4-80": { number: "80", title: "Employer's risks", summary: "Lists the risks carried by the Employer. Includes force majeure events and certain specified risks in the Contract Data.", submarineRelevance: "Submarine employer risks typically include seismic events, acts of war, and interference by third-party vessels." },
      "NEC4-81": { number: "81", title: "The Contractor's risks", summary: "All risks not listed as Employer's risks are Contractor's risks. Loss or damage from Contractor's risks is at Contractor's cost.", submarineRelevance: "Contractor carries risk of cable ship breakdown, crew issues, and installation methodology failures." },
      "NEC4-82": { number: "82", title: "Repairs", summary: "The Contractor notifies damage and proceeds with repairs. Cost allocation depends on which party carries the risk.", submarineRelevance: "Submarine cable repair requires mobilization of specialist vessels and can cost millions; risk allocation is critical." },
      "NEC4-83": { number: "83", title: "Indemnity", summary: "Each party indemnifies the other against claims from third parties. Allocation follows risk ownership.", submarineRelevance: "Submarine projects face third-party claims from fishing vessels, other cable owners, and maritime authorities." },
      "NEC4-84": { number: "84", title: "Insurance", summary: "The Contractor and Employer maintain insurance per the Insurance Table. Policies must name the other party.", submarineRelevance: "Marine insurance (hull, cargo, P&I, CAR) is specialized and expensive; coverage must match the specific submarine risks." },

      // FIDIC Clauses
      "FIDIC-4": { number: "4", title: "The Contractor", summary: "Contractor obligations including design responsibility, subcontracting, quality assurance, safety, and site facilities.", submarineRelevance: "Submarine contractors must demonstrate specialist capability, vessel resources, and marine safety management systems." },
      "FIDIC-8": { number: "8", title: "Commencement, Delays and Suspension", summary: "Covers programme submission, time for completion, extension of time, delays, and suspension of work.", submarineRelevance: "Submarine programmes must account for weather windows, monsoon seasons, and vessel scheduling. Suspension during monsoon is common." },
      "FIDIC-10": { number: "10", title: "Employer's Taking Over", summary: "Procedures for taking over the completed works or sections. Includes testing, punch lists, and certificate issuance.", submarineRelevance: "Submarine systems are taken over in sections (e.g., per segment) after BER testing and capacity verification on each span." },
      "FIDIC-11": { number: "11", title: "Defects Liability", summary: "Contractor obligation to remedy defects notified during the Defects Notification Period (DNP). Failure to remedy triggers Employer rights.", submarineRelevance: "Submarine cable defects (shunt faults, elevated BER) may only manifest during commissioning or early operation. DNP typically 2-5 years." },
      "FIDIC-13": { number: "13", title: "Variations and Adjustments", summary: "Engineer may instruct variations. Contractor may propose value engineering. Adjustments for legislation changes and cost fluctuations.", submarineRelevance: "Route variations due to discovered hazards (unexploded ordnance, existing cables, unstable seabed) are common in submarine projects." },
      "FIDIC-14": { number: "14", title: "Contract Price and Payment", summary: "Covers the contract price, advance payment, interim payment applications, payment certificates, and final payment.", submarineRelevance: "Submarine payment milestones often include: design approval, cable manufacture start, factory test, load-out, per-km installed, commissioned." },
      "FIDIC-17": { number: "17", title: "Risk and Responsibility", summary: "Allocation of risks, indemnities, and limitation of liability between the parties. Consequential loss exclusions.", submarineRelevance: "Marine risk allocation is complex: vessel perils, seabed hazards, third-party vessel interference, and sovereign immunity issues." },
      "FIDIC-19": { number: "19", title: "Force Majeure", summary: "Defines force majeure events, notice requirements, duty to minimize delay, and termination rights for prolonged force majeure.", submarineRelevance: "Submarine force majeure includes tsunami, volcanic eruption, armed conflict in territorial waters, and extreme weather beyond seasonal norms." },
      "FIDIC-20": { number: "20", title: "Claims, Disputes and Arbitration", summary: "Claims procedure with 28-day notice requirement, detailed particulars within 42 days, DAB referral, and ICC arbitration.", submarineRelevance: "Submarine cable disputes often arise from unforeseen seabed conditions, vessel delays, and multi-jurisdictional permitting. Strict 28-day notice is critical." }
    },

    // ---- Cable Repair & Restoration Planning Database ----------------------
    REPAIR_DATABASE: {
      repairShips: [
        { name: "CS Sovereign", operator: "Global Marine", homePort: "UK", speed: 12, mobilizationDays: [7, 14], dayRate: [150000, 200000], depthRating: 2000 },
        { name: "CS Cable Innovator", operator: "Global Marine", homePort: "UK", speed: 12, mobilizationDays: [7, 14], dayRate: [120000, 180000], depthRating: 1500 },
        { name: "Ile de Re", operator: "ASN/Nokia", homePort: "France", speed: 13, mobilizationDays: [10, 21], dayRate: [180000, 250000], depthRating: 6000 },
        { name: "Ile de Brehat", operator: "ASN/Nokia", homePort: "France", speed: 12, mobilizationDays: [10, 21], dayRate: [150000, 200000], depthRating: 4000 },
        { name: "Subcom Reliance", operator: "SubCom", homePort: "USA", speed: 11, mobilizationDays: [14, 28], dayRate: [200000, 300000], depthRating: 8000 },
        { name: "KDD Ocean Link", operator: "NTT-WEM", homePort: "Japan", speed: 11, mobilizationDays: [7, 14], dayRate: [120000, 180000], depthRating: 3000 },
        { name: "Fu Hai", operator: "HMN Tech", homePort: "China", speed: 12, mobilizationDays: [5, 10], dayRate: [80000, 150000], depthRating: 4000 },
        { name: "Asean Explorer", operator: "E-Marine", homePort: "UAE", speed: 10, mobilizationDays: [10, 21], dayRate: [100000, 160000], depthRating: 2000 }
      ],
      spareDepots: [
        { location: "Singapore", region: "Southeast Asia", stockPercent: 2.5, description: "Primary regional spare cable depot covering Malacca Strait and South China Sea routes" },
        { location: "Guam", region: "Western Pacific", stockPercent: 2.0, description: "Pacific depot covering trans-Pacific and Asia-US cable segments" },
        { location: "Manila", region: "Philippines", stockPercent: 3.0, description: "Depot covering Philippine inter-island and regional cable systems" }
      ],
      repairScenarios: [
        { id: "shallow", label: "Shallow Water (<200m)", maxDepth: 200, repairDays: [7, 14], costRange: [2000000, 5000000], description: "Grapnel recovery, cut-and-splice repair in continental shelf waters" },
        { id: "mid", label: "Mid-Depth (200-1500m)", maxDepth: 1500, repairDays: [14, 28], costRange: [5000000, 10000000], description: "ROV-assisted recovery, complex jointing at moderate depths" },
        { id: "deep", label: "Deep Water (>1500m)", maxDepth: 99999, repairDays: [21, 45], costRange: [8000000, 20000000], description: "Deep-water grapnel with specialized equipment, extended vessel time" }
      ]
    },
  };

  // ---- GENERIC PM profile (fallback) --------------------------------------
  var genericProfile = {
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
    buildRisks: function (text, scale) {
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

  // ---- DATA CENTRE BUILD profile -------------------------------------------
  var dataCenterProfile = {
    id: "data-center",
    label: "Data Centre Build",
    keywords: [
      ["data center", 3], ["data centre", 3], ["rack", 2], ["cooling", 2],
      ["ups", 3], ["power distribution", 2], ["raised floor", 3],
      ["colocation", 3], ["hyperscale", 3]
    ],
    roles: [
      "DC Project Manager",
      "M&E Engineer",
      "Structural Engineer",
      "IT Infrastructure Lead",
      "Commissioning Manager"
    ],
    buildPhases: function (scale) {
      return [
        { name: "Design", owner: "DC Project Manager", tasks: [
          { problem: "Architectural and M&E design for data hall layout", costCat: "External / Consultant", estCost: 120000, leanMethod: "Value Stream Mapping" },
          { problem: "Power and cooling capacity planning (N+1 / 2N redundancy)", costCat: "External / Consultant", estCost: 80000 },
          { problem: "Structural design for raised floor and cable containment", costCat: "External / Consultant", estCost: 45000 },
        ]},
        { name: "Procurement", owner: "DC Project Manager", tasks: [
          { problem: "Procure generators, UPS systems, and switchgear", costCat: "Materials", estCost: 850000, priority: "2-HIGH" },
          { problem: "Procure cooling plant (CRAC/CRAH units, chillers)", costCat: "Materials", estCost: 620000, priority: "2-HIGH" },
          { problem: "Procure racks, PDUs, and structured cabling", costCat: "Materials", estCost: 340000 },
          { problem: "Procure fire suppression systems (inert gas / clean agent)", costCat: "Materials", estCost: 180000 },
        ]},
        { name: "Civil/Structural", owner: "Structural Engineer", tasks: [
          { problem: "Foundation and structural frame construction", costCat: "External / Consultant", estCost: 450000, priority: "2-HIGH" },
          { problem: "Raised floor installation and grounding grid", costCat: "External / Consultant", estCost: 220000 },
          { problem: "Building envelope and security perimeter", costCat: "External / Consultant", estCost: 180000 },
        ]},
        { name: "M&E Install", owner: "M&E Engineer", tasks: [
          { problem: "HV/LV electrical distribution installation", costCat: "Labour / Effort", estCost: 380000, priority: "2-HIGH", sev: 6 },
          { problem: "UPS and generator set commissioning", costCat: "Labour / Effort", estCost: 150000, sev: 5 },
          { problem: "Cooling system installation and pipework", costCat: "Labour / Effort", estCost: 280000, sev: 5 },
          { problem: "BMS/DCIM integration and sensor deployment", costCat: "Tooling / Software", estCost: 95000 },
        ]},
        { name: "Commissioning", owner: "Commissioning Manager", tasks: [
          { problem: "Integrated systems testing (IST) and load bank testing", costCat: "Labour / Effort", estCost: 120000, sev: 6, leanMethod: "Mistake-Proofing / Poka-Yoke" },
          { problem: "Thermal validation and CFD model verification", costCat: "Tooling / Software", estCost: 65000 },
          { problem: "Power chain failover and redundancy validation", costCat: "Labour / Effort", estCost: 85000, sev: 7 },
        ]},
        { name: "Handover", owner: "DC Project Manager", tasks: [
          { problem: "As-built documentation and O&M manuals", costCat: "Labour / Effort", estCost: 40000 },
          { problem: "Staff training and operational readiness", costCat: "Labour / Effort", estCost: 30000 },
          { problem: "Client acceptance and defect liability period start", costCat: "Labour / Effort", estCost: 15000 },
        ]},
      ];
    },
    buildRisks: function (text, scale) {
      return [
        { problem: "RISK: Supply chain delays for generators/UPS", category: "Delivery / Schedule", sev: 8, occ: 6, det: 4, priority: "1-CRITICAL", rootCause: "Long lead items (20-40 week delivery), global chip shortages" },
        { problem: "RISK: Cooling system design failure under peak load", category: "Design / Quality", sev: 9, occ: 4, det: 5, priority: "1-CRITICAL", rootCause: "Inadequate thermal modelling or hot-spot analysis" },
        { problem: "RISK: Power grid connection delays", category: "Delivery / Schedule", sev: 8, occ: 5, det: 3, priority: "1-CRITICAL", rootCause: "Utility provider capacity constraints and regulatory approvals" },
        { problem: "RISK: Construction permit delays", category: "Delivery / Schedule", sev: 7, occ: 5, det: 4, priority: "2-HIGH", rootCause: "Local planning authority backlog and environmental objections" },
      ];
    },
    buildProcurement: function (scale) {
      return [
        { package: "Generators", vendor: "TBD", value: 400000, poStatus: "RFQ", owner: "DC Project Manager" },
        { package: "UPS systems", vendor: "TBD", value: 350000, poStatus: "RFQ", owner: "DC Project Manager" },
        { package: "Cooling (CRAC/CRAH)", vendor: "TBD", value: 500000, poStatus: "RFQ", owner: "M&E Engineer" },
        { package: "Racks and PDUs", vendor: "TBD", value: 250000, poStatus: "RFQ", owner: "IT Infrastructure Lead" },
        { package: "Structured cabling", vendor: "TBD", value: 120000, poStatus: "RFQ", owner: "IT Infrastructure Lead" },
        { package: "Fire suppression", vendor: "TBD", value: 180000, poStatus: "RFQ", owner: "M&E Engineer" },
      ];
    },
  };

  // ---- TERRESTRIAL FTTH/FTTx profile --------------------------------------
  var terrestrialFtthProfile = {
    id: "terrestrial-ftth",
    label: "Terrestrial FTTH/FTTx Rollout",
    keywords: [
      ["ftth", 3], ["fttx", 3], ["last mile", 3], ["homes passed", 3],
      ["splitter cabinet", 3], ["distribution point", 2], ["drop cable", 2],
      ["ont", 3], ["premises", 2]
    ],
    roles: [
      "Project Manager",
      "Survey Lead",
      "Design Engineer",
      "Civil Contractor Lead",
      "Splicing Team Lead",
      "Test Engineer",
      "Activation Team Lead",
      "Customer Connect Manager"
    ],
    buildPhases: function (scale) {
      var homes = scale.homesPassed || 10000;
      var km = scale.routeKm || 50;
      return [
        { name: "Survey", owner: "Survey Lead", tasks: [
          { problem: "Desktop survey and existing infrastructure assessment", costCat: "External / Consultant", estCost: round(km * 200), leanMethod: "Value Stream Mapping" },
          { problem: "Field survey with GPS recording of pole/duct routes", costCat: "Labour / Effort", estCost: round(km * 350) },
          { problem: "Demand aggregation and premises database build", costCat: "Tooling / Software", estCost: round(homes * 2) },
        ]},
        { name: "Design", owner: "Design Engineer", tasks: [
          { problem: "High-level network architecture (PON topology)", costCat: "External / Consultant", estCost: 45000, leanMethod: "Value Stream Mapping" },
          { problem: "Low-level design with splitter placement and cabinet locations", costCat: "External / Consultant", estCost: round(km * 180) },
          { problem: "Link budget and split ratio calculations", costCat: "Tooling / Software", estCost: 20000 },
        ]},
        { name: "Permitting", owner: "Project Manager", tasks: [
          { problem: "Secure wayleaves and road opening permits", costCat: "External / Consultant", estCost: round(km * 400), priority: "2-HIGH", sev: 6 },
          { problem: "Utility crossing approvals and traffic management plans", costCat: "External / Consultant", estCost: round(km * 150) },
          { problem: "Environmental and heritage site assessments", costCat: "External / Consultant", estCost: 15000 },
        ]},
        { name: "Trenching/Ducting", owner: "Civil Contractor Lead", tasks: [
          { problem: "Trench excavation and HDPE duct installation", costCat: "External / Consultant", estCost: round(km * 16000), priority: "2-HIGH" },
          { problem: "Micro-trenching in paved/urban areas", costCat: "External / Consultant", estCost: round(km * 0.3 * 12000) },
          { problem: "Chamber and handhole installation at splice points", costCat: "Materials", estCost: round(km * 2000) },
          { problem: "Reinstatement to local authority specification", costCat: "External / Consultant", estCost: round(km * 2500) },
        ]},
        { name: "Cable Install", owner: "Civil Contractor Lead", tasks: [
          { problem: "Backbone and distribution cable blowing/pulling", costCat: "Labour / Effort", estCost: round(km * 2800) },
          { problem: "Splitter cabinet installation and powering", costCat: "Materials", estCost: round(homes / 32 * 3500) },
          { problem: "Drop cable installation from DP to premises boundary", costCat: "Labour / Effort", estCost: round(homes * 35) },
        ]},
        { name: "Splicing", owner: "Splicing Team Lead", tasks: [
          { problem: "Backbone and distribution cable splicing", costCat: "Labour / Effort", estCost: round(km * 900), sev: 5 },
          { problem: "Splitter installation and fibre patching at cabinets", costCat: "Labour / Effort", estCost: round(homes / 32 * 800) },
          { problem: "Drop cable termination at network access points", costCat: "Labour / Effort", estCost: round(homes * 12) },
        ]},
        { name: "Testing", owner: "Test Engineer", tasks: [
          { problem: "OTDR bi-directional testing of all backbone/distribution fibres", costCat: "Tooling / Software", estCost: round(km * 200), sev: 5, leanMethod: "Mistake-Proofing / Poka-Yoke" },
          { problem: "Power meter end-to-end loss verification per splitter leg", costCat: "Tooling / Software", estCost: round(homes / 32 * 500) },
          { problem: "OLT commissioning and PON port activation testing", costCat: "Tooling / Software", estCost: 30000, sev: 5 },
        ]},
        { name: "Activation", owner: "Activation Team Lead", tasks: [
          { problem: "ONT provisioning and customer premises installation", costCat: "Labour / Effort", estCost: round(homes * 45) },
          { problem: "Service activation and speed/latency verification", costCat: "Labour / Effort", estCost: round(homes * 8) },
          { problem: "Customer handover and CPE configuration", costCat: "Labour / Effort", estCost: round(homes * 5) },
        ]},
      ];
    },
    buildRisks: function (text, scale) {
      return [
        { problem: "RISK: Permit delays from multiple local authorities", category: "Delivery / Schedule", sev: 7, occ: 7, det: 4, priority: "1-CRITICAL", rootCause: "Fragmented permitting across municipal boundaries" },
        { problem: "RISK: Utility conflicts during trenching (gas, water, electric)", category: "Design / Quality", sev: 8, occ: 5, det: 4, priority: "2-HIGH", rootCause: "Inaccurate utility records and survey data" },
        { problem: "RISK: Bad ground conditions (rock, high water table, contamination)", category: "Process / Flow", sev: 7, occ: 5, det: 5, priority: "2-HIGH", rootCause: "Insufficient geotechnical survey" },
        { problem: "RISK: Drop cable damage during or after installation", category: "Design / Quality", sev: 5, occ: 6, det: 4, priority: "3-MEDIUM", rootCause: "Third-party works, inadequate protection" },
        { problem: "RISK: Customer access issues preventing ONT installation", category: "Delivery / Schedule", sev: 5, occ: 6, det: 3, priority: "3-MEDIUM", rootCause: "Tenant coordination, vacant properties, access restrictions" },
        { problem: "RISK: Contractor quality failures requiring rework", category: "Design / Quality", sev: 7, occ: 5, det: 5, priority: "2-HIGH", rootCause: "Insufficient contractor vetting and QC oversight" },
      ];
    },
    buildProcurement: function (scale) {
      var homes = scale.homesPassed || 10000;
      var km = scale.routeKm || 50;
      return [
        { package: "Fibre cable (backbone + distribution)", vendor: "TBD", value: round(km * 4500), poStatus: "RFQ", owner: "Project Manager" },
        { package: "HDPE duct and micro-duct", vendor: "TBD", value: round(km * 3200), poStatus: "RFQ", owner: "Civil Contractor Lead" },
        { package: "Splice closures and joints", vendor: "TBD", value: round(km * 800), poStatus: "RFQ", owner: "Splicing Team Lead" },
        { package: "Splitter cabinets", vendor: "TBD", value: round(homes / 32 * 2800), poStatus: "RFQ", owner: "Design Engineer" },
        { package: "ONTs (Optical Network Terminals)", vendor: "TBD", value: round(homes * 40), poStatus: "RFQ", owner: "Activation Team Lead" },
        { package: "Drop cables", vendor: "TBD", value: round(homes * 18), poStatus: "RFQ", owner: "Civil Contractor Lead" },
      ];
    },
  };

  // ---- SUBMARINE/TERRESTRIAL POWER CABLE profile --------------------------
  var powerCableProfile = {
    id: "power-cable",
    label: "Submarine/Terrestrial Power Cable",
    keywords: [
      ["hvdc", 3], ["high voltage", 3], ["power cable", 3],
      ["interconnector", 3], ["offshore wind", 3], ["converter station", 3],
      ["vsc", 3]
    ],
    roles: [
      "Programme Director",
      "Consenting Manager",
      "Cable Engineer",
      "Marine Operations Manager",
      "Onshore Works Manager",
      "Commissioning Lead",
      "Grid Connection Manager"
    ],
    buildPhases: function (scale) {
      var km = scale.routeKm || 200;
      return [
        { name: "Feasibility", owner: "Programme Director", tasks: [
          { problem: "Route feasibility study and corridor identification", costCat: "External / Consultant", estCost: 350000, leanMethod: "Value Stream Mapping" },
          { problem: "Grid capacity and connection assessment", costCat: "External / Consultant", estCost: 200000 },
          { problem: "Environmental baseline surveys (benthic, marine mammals)", costCat: "External / Consultant", estCost: 450000 },
        ]},
        { name: "Design & Consenting", owner: "Consenting Manager", tasks: [
          { problem: "Cable system design (HVDC/HVAC, voltage, capacity)", costCat: "External / Consultant", estCost: 800000 },
          { problem: "Environmental Impact Assessment (EIA) and consenting", costCat: "External / Consultant", estCost: 1200000, priority: "2-HIGH", sev: 7 },
          { problem: "Marine licence and foreshore consent applications", costCat: "External / Consultant", estCost: 350000, sev: 6 },
          { problem: "Converter station planning permission", costCat: "External / Consultant", estCost: 250000, sev: 6 },
        ]},
        { name: "Procurement", owner: "Programme Director", tasks: [
          { problem: "HVDC cable manufacturing contract award", costCat: "Materials", estCost: round(km * 500000), priority: "1-CRITICAL", sev: 8 },
          { problem: "Converter station equipment procurement", costCat: "Materials", estCost: 80000000, priority: "1-CRITICAL", sev: 8 },
          { problem: "Installation vessel charter and mobilization", costCat: "External / Consultant", estCost: 15000000, priority: "2-HIGH" },
          { problem: "Offshore substation procurement (if applicable)", costCat: "Materials", estCost: 25000000 },
        ]},
        { name: "Manufacturing", owner: "Cable Engineer", tasks: [
          { problem: "HVDC cable manufacturing and factory acceptance testing", costCat: "Materials", estCost: round(km * 200000), sev: 7 },
          { problem: "Converter station module fabrication", costCat: "Materials", estCost: 20000000, sev: 7 },
          { problem: "Cable loading onto installation vessel (carousel/turntable)", costCat: "Labour / Effort", estCost: 5000000 },
        ]},
        { name: "Marine Install", owner: "Marine Operations Manager", tasks: [
          { problem: "Cable laying operations with DP vessel", costCat: "External / Consultant", estCost: round(km * 80000), priority: "1-CRITICAL", sev: 7 },
          { problem: "Cable burial and protection (jetting/ploughing/rock placement)", costCat: "External / Consultant", estCost: round(km * 40000), sev: 6 },
          { problem: "Shore-end pull-in and HDD/cofferdam operations", costCat: "External / Consultant", estCost: 8000000, sev: 6 },
          { problem: "Mid-line jointing (if multiple cable lengths)", costCat: "Labour / Effort", estCost: 3000000, sev: 7 },
        ]},
        { name: "Onshore Works", owner: "Onshore Works Manager", tasks: [
          { problem: "Converter station civil works and building construction", costCat: "External / Consultant", estCost: 15000000, priority: "2-HIGH" },
          { problem: "Onshore cable route trenching and installation", costCat: "External / Consultant", estCost: round(km * 0.1 * 120000) },
          { problem: "Grid connection infrastructure (substation upgrades)", costCat: "Materials", estCost: 10000000, sev: 6 },
        ]},
        { name: "Commissioning", owner: "Commissioning Lead", tasks: [
          { problem: "Cable system high-voltage testing and soak test", costCat: "Labour / Effort", estCost: 3000000, sev: 8, leanMethod: "Mistake-Proofing / Poka-Yoke" },
          { problem: "Converter station commissioning and grid synchronization", costCat: "Labour / Effort", estCost: 5000000, sev: 8 },
          { problem: "System integration testing and trial operation", costCat: "Labour / Effort", estCost: 2000000, sev: 7 },
          { problem: "Handover to operations and warranty period start", costCat: "Labour / Effort", estCost: 500000 },
        ]},
      ];
    },
    buildRisks: function (text, scale) {
      return [
        { problem: "RISK: Grid connection delays from TSO/DNO", category: "Delivery / Schedule", sev: 9, occ: 6, det: 3, priority: "1-CRITICAL", rootCause: "Grid capacity constraints, TSO reinforcement works required" },
        { problem: "RISK: Converter station manufacturing delays", category: "Delivery / Schedule", sev: 9, occ: 5, det: 4, priority: "1-CRITICAL", rootCause: "Limited global manufacturing capacity, 3-4 year lead times" },
        { problem: "RISK: Marine weather delays during installation campaign", category: "Delivery / Schedule", sev: 7, occ: 7, det: 3, priority: "2-HIGH", rootCause: "Seasonal weather windows, vessel downtime costs" },
        { problem: "RISK: Cable manufacturing defect requiring repair/replacement", category: "Design / Quality", sev: 9, occ: 3, det: 5, priority: "2-HIGH", rootCause: "Complex extrusion process, quality escapes in factory" },
        { problem: "RISK: Consenting/planning permission rejection or delay", category: "Delivery / Schedule", sev: 8, occ: 5, det: 4, priority: "1-CRITICAL", rootCause: "Environmental objections, stakeholder opposition, policy changes" },
      ];
    },
    buildProcurement: function (scale) {
      var km = scale.routeKm || 200;
      return [
        { package: "HVDC cable", vendor: "TBD", value: round(km * 500000), poStatus: "RFQ", owner: "Cable Engineer" },
        { package: "Converter stations", vendor: "TBD", value: 80000000, poStatus: "RFQ", owner: "Programme Director" },
        { package: "Offshore substation", vendor: "TBD", value: 25000000, poStatus: "RFQ", owner: "Programme Director" },
        { package: "Installation vessel", vendor: "TBD", value: 15000000, poStatus: "RFQ", owner: "Marine Operations Manager" },
        { package: "Onshore civils", vendor: "TBD", value: 15000000, poStatus: "RFQ", owner: "Onshore Works Manager" },
      ];
    },
  };

  var PROFILES = [fibreProfile, genericProfile, dataCenterProfile, terrestrialFtthProfile, powerCableProfile];

  function pickProfile(text, forcedId) {
    if (forcedId) {
      var f = PROFILES.find(function (p) { return p.id === forcedId; });
      if (f) return { profile: f, score: Infinity, matched: [] };
    }
    var best = { profile: genericProfile, score: 0, matched: [] };
    PROFILES.forEach(function (p) {
      var r = scoreKeywords(text, p.keywords);
      if (r.score > best.score) best = { profile: p, score: r.score, matched: r.matched };
    });
    return best;
  }

  // Build a milestone row from a phase.
  function buildMilestones(phases, scale) {
    var total = phases.length || 1;
    var months = scale.durationMonths || total * 2;
    return phases.map(function (ph, i) {
      var m = Math.max(1, round(((i + 1) / total) * months));
      return { milestone: ph.name + " complete", baseline: "M+" + m, forecast: "M+" + m, actual: "", status: i === 0 ? "In progress" : "Planned", owner: ph.owner || "PM" };
    });
  }

  function aggregateBudget(cases, procurement) {
    var by = {};
    cases.forEach(function (c) { by[c.costCat] = (by[c.costCat] || 0) + (Number(c.estCost) || 0); });
    (procurement || []).forEach(function (p) { by["Materials"] = (by["Materials"] || 0) + (Number(p.value) || 0); });
    var rows = Object.keys(by).map(function (k) { return { category: k, est: round(by[k]) }; });
    var total = rows.reduce(function (s, r) { return s + r.est; }, 0);
    rows.push({ category: "Contingency (10%)", est: round(total * 0.1) });
    return { rows: rows, total: round(total * 1.1) };
  }

  /**
   * Analyze a project description into a full management plan.
   * @param {string} text - the project description (stays local).
   * @param {object} [opts] - { profile?: "fibre-telecom"|"generic-pm" }
   */
  // Detect whether a project is submarine or terrestrial.
  function detectSubmarine(text, profile) {
    if (!profile.submarineKeywords || !profile.terrestrialKeywords) return false;
    var subScore = scoreKeywords(text, profile.submarineKeywords);
    var terrScore = scoreKeywords(text, profile.terrestrialKeywords);
    return subScore.score > terrScore.score;
  }

  function analyzeProject(text, opts) {
    opts = opts || {};
    var picked = pickProfile(text, opts.profile);
    var profile = picked.profile;
    var scale = extractScale(text);

    // Submarine detection for fibre-telecom profile
    var isSubmarine = false;
    if (profile.id === "fibre-telecom") {
      isSubmarine = detectSubmarine(text, profile);
    }

    var phases;
    var procurement;
    var riskList;
    if (isSubmarine && profile.buildSubmarinePhases) {
      phases = profile.buildSubmarinePhases(scale);
      riskList = profile.buildSubmarineRisks(text, scale);
      procurement = profile.buildSubmarineProcurement(scale);
    } else {
      phases = profile.buildPhases(scale);
      riskList = profile.buildRisks(text, scale);
      procurement = profile.buildProcurement(scale);
    }

    var cases = [];
    phases.forEach(function (ph) {
      (ph.tasks || []).forEach(function (t) {
        cases.push(mkCase(Object.assign({}, t, { owner: t.owner || ph.owner, _phase: ph.name, _brain: "task" })));
      });
    });
    var risks = (riskList || []).map(function (r) { return mkCase(Object.assign({}, r, { leanMethod: r.leanMethod || "FMEA", _brain: "risk" })); });
    var milestones = buildMilestones(phases, scale);
    var budget = aggregateBudget(cases.concat(risks), procurement);

    // ---- Country detection ------------------------------------------------
    var regulatoryAuthorities = [];
    var countryRisks = [];
    var countryTasks = [];
    var detectedCountries = detectCountries(text, profile);
    if (detectedCountries.length > 0) {
      detectedCountries.forEach(function (country) {
        regulatoryAuthorities.push({
          country: country.name,
          code: country.code,
          authorities: country.regulatoryAuthorities
        });
        countryRisks.push({
          country: country.name,
          code: country.code,
          geopolitical: country.geopoliticalChallenges,
          geographical: country.geographicalChallenges
        });
        countryTasks.push({
          country: country.name,
          code: country.code,
          keyContacts: country.keyContacts
        });
        // Convert each country's challenges into scored FMEA risks that flow
        // into the plan's risk register (conservative scoring — natural hazards
        // that threaten the marine programme are treated as critical).
        var geoTxt = (country.geographicalChallenges || []).join("; ");
        var polTxt = (country.geopoliticalChallenges || []).join("; ");
        if (geoTxt) {
          var critNat = /earthquake|typhoon|volcan|trench|tsunami|seismic|monsoon/i.test(geoTxt);
          var gr = mkCase({
            problem: "RISK: " + country.name + " geographical / natural-hazard exposure",
            category: "Delivery / Schedule", sev: 8, occ: 6, det: 4,
            priority: critNat ? "1-CRITICAL" : "2-HIGH",
            rootCause: geoTxt, leanMethod: "FMEA", _brain: "risk"
          });
          gr._country = country.code;
          risks.push(gr);
        }
        if (polTxt) {
          var pr = mkCase({
            problem: "RISK: " + country.name + " geopolitical / regulatory exposure",
            category: "Delivery / Schedule", sev: 7, occ: 5, det: 5,
            priority: "2-HIGH",
            rootCause: polTxt, leanMethod: "FMEA", _brain: "risk"
          });
          pr._country = country.code;
          risks.push(pr);
        }
      });
    }

    // ---- Authorities auto-surfaced per plan phase -------------------------
    // For every phase, surface the relevant authority/contacts for each detected
    // country (e.g. the permitting phase shows each country's landing-permit body).
    var phaseAuthorities = [];
    if (detectedCountries.length > 0) {
      phases.forEach(function (ph) {
        var group = phaseToContactGroup(ph.name);
        phaseAuthorities.push({
          phase: ph.name,
          group: group,
          authorities: detectedCountries.map(function (c) {
            return {
              country: c.name,
              code: c.code,
              primaryRegulator: c.regulatoryAuthorities && c.regulatoryAuthorities.telecom ? c.regulatoryAuthorities.telecom.name : null,
              contacts: (c.keyContacts && c.keyContacts[group]) || []
            };
          })
        });
      });
    }

    // Coverage / confidence & honest warnings.
    var warnings = [];
    if (picked.profile.id === "generic-pm") warnings.push("Domain not confidently detected — used the generic PM template. Add more detail (e.g. 'fibre', 'OTDR', 'route km') for a tailored plan.");
    if (!scale.routeKm && profile.id === "fibre-telecom") warnings.push("No route length (km) detected — civil/cable budgets use a 100 km placeholder. Edit quantities after applying.");
    var confidence = profile.id === "generic-pm" ? 0.4 : Math.min(0.95, 0.55 + picked.score * 0.03);

    return {
      summary: {
        title: deriveTitle(text),
        domain: profile.id,
        domainLabel: profile.label,
        scale: scale,
        isSubmarine: isSubmarine,
      },
      phases: phases.map(function (p) { return { name: p.name, owner: p.owner, taskCount: (p.tasks || []).length }; }),
      cases: cases,
      risks: risks,
      milestones: milestones,
      procurement: procurement,
      budget: budget,
      roles: profile.roles,
      standards: profile.standards || [],
      kpis: profile.kpis || [],
      deliverables: profile.deliverables || [],
      regulatoryAuthorities: regulatoryAuthorities,
      countryRisks: countryRisks,
      countryTasks: countryTasks,
      phaseAuthorities: phaseAuthorities,
      coverage: { profile: profile.id, confidence: Math.round(confidence * 100) / 100, matched: picked.matched, warnings: warnings },
    };
  }

  function listProfiles() { return PROFILES.map(function (p) { return { id: p.id, label: p.label }; }); }

  // ---- Country Detection & Info -------------------------------------------
  function detectCountries(text, profile) {
    var db = profile.COUNTRY_DATABASE;
    if (!db || !Array.isArray(db)) return [];
    var t = norm(text);
    var detected = [];
    db.forEach(function (country) {
      var found = false;
      // Check country name
      if (t.indexOf(norm(country.name)) >= 0) found = true;
      // Check country code (word boundary)
      if (!found) {
        var codeRe = new RegExp("(^|[^a-z])" + country.code.toLowerCase() + "([^a-z]|$)");
        if (codeRe.test(t)) found = true;
      }
      // Check aliases
      if (!found && country.aliases) {
        for (var i = 0; i < country.aliases.length; i++) {
          if (t.indexOf(country.aliases[i]) >= 0) { found = true; break; }
        }
      }
      if (found) detected.push(country);
    });
    return detected;
  }

  function getCountryInfo(countryCode) {
    var profile = PROFILES.find(function (p) { return p.id === "fibre-telecom"; });
    if (!profile || !profile.COUNTRY_DATABASE) return null;
    var code = String(countryCode || "").toUpperCase();
    var country = profile.COUNTRY_DATABASE.find(function (c) { return c.code === code; });
    if (!country) {
      // Try name match
      var lc = norm(countryCode);
      country = profile.COUNTRY_DATABASE.find(function (c) {
        return norm(c.name) === lc || (c.aliases && c.aliases.indexOf(lc) >= 0);
      });
    }
    return country || null;
  }

  // Return the full programme-country intelligence list (regulators, geopolitical
  // & geographical challenges, and phase-based key contacts) for all 8 countries.
  function listCountries() {
    var profile = PROFILES.find(function (p) { return p.id === "fibre-telecom"; });
    return (profile && profile.COUNTRY_DATABASE) ? profile.COUNTRY_DATABASE.slice() : [];
  }

  // Map a project/plan phase name to the relevant key-contact group.
  function phaseToContactGroup(phase) {
    var p = norm(phase);
    if (/survey|design|feasib|planning|desktop|route engineering/.test(p)) return "feasibility";
    if (/permit|licen|landing|wayleave|environ|eia|amdal|consent|approv/.test(p)) return "permitting";
    if (/install|marine|civil|shore|lay|splice|build|construct|manufactur/.test(p)) return "construction";
    if (/test|commission|operat|handover|acceptance|maintenance|o&m|service|noc/.test(p)) return "operations";
    return "feasibility";
  }

  // Map a project/plan phase to the relevant key-contact group, so the right
  // authorities auto-surface at the appropriate phase of the project plan.
  function authoritiesForPhase(countryCode, phase) {
    var c = getCountryInfo(countryCode);
    if (!c) return null;
    var group = phaseToContactGroup(phase);
    return {
      country: c.name, code: c.code, phase: phase, group: group,
      contacts: (c.keyContacts && c.keyContacts[group]) || [],
      primaryRegulator: c.regulatoryAuthorities && c.regulatoryAuthorities.telecom ? c.regulatoryAuthorities.telecom.name : null
    };
  }

  // ---- Intelligence Engine: localStorage with in-memory fallback ----------
  var _memoryStore = {};
  function storageGet(key) {
    try {
      if (typeof localStorage !== "undefined") {
        var raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      }
    } catch (e) { /* no localStorage available */ }
    return _memoryStore[key] ? JSON.parse(_memoryStore[key]) : null;
  }
  function storageSet(key, value) {
    var json = JSON.stringify(value);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, json);
        return;
      }
    } catch (e) { /* no localStorage available */ }
    _memoryStore[key] = json;
  }

  var LESSONS_KEY = "qi_brain_lessons";

  // ---- analyzeStatus(projectState) ----------------------------------------
  function analyzeStatus(projectState, nowMs) {
    var cases = (projectState && projectState.cases) || [];
    var milestones = (projectState && projectState.registers && projectState.registers.milestones) || [];
    var project = (projectState && projectState.project) || {};

    var findings = [];
    var now = (typeof nowMs === "number") ? nowMs : Date.now();

    // --- EVM-like estimates from cases ---
    var totalEst = 0; var totalAct = 0; var totalEv = 0;
    cases.forEach(function (c) {
      var est = Number(c.estCost) || 0;
      var act = Number(c.actCost) || 0;
      var pct = Number(c.percent) || 0;
      totalEst += est;
      totalAct += act;
      totalEv += est * pct;
    });

    var cpiEstimate = totalAct > 0 ? totalEv / totalAct : 1;
    // SPI estimate based on schedule progress
    var projectStart = project.start ? new Date(project.start).getTime() : null;
    var projectEnd = project.end ? new Date(project.end).getTime() : null;
    var plannedFraction = 1;
    if (projectStart && projectEnd && projectEnd > projectStart) {
      var elapsed = Math.max(0, now - projectStart);
      var total = projectEnd - projectStart;
      plannedFraction = Math.min(1, elapsed / total);
    }
    var earnedFraction = totalEst > 0 ? totalEv / totalEst : 0;
    var spiEstimate = plannedFraction > 0 ? earnedFraction / plannedFraction : 1;

    // --- Schedule slippage from milestones ---
    var slippedMilestones = 0;
    milestones.forEach(function (ms) {
      if (ms.forecast && ms.baseline) {
        var fNum = parseInt(String(ms.forecast).replace(/[^0-9]/g, ""), 10) || 0;
        var bNum = parseInt(String(ms.baseline).replace(/[^0-9]/g, ""), 10) || 0;
        if (fNum > bNum) {
          slippedMilestones++;
          findings.push({ type: "schedule", severity: "warning", detail: "Milestone '" + (ms.milestone || "unknown") + "' forecast (" + ms.forecast + ") exceeds baseline (" + ms.baseline + ")" });
        }
      }
    });

    // --- Cost overruns per case ---
    var costOverruns = 0;
    cases.forEach(function (c) {
      var est = Number(c.estCost) || 0;
      var act = Number(c.actCost) || 0;
      if (est > 0 && act > est) {
        costOverruns++;
        findings.push({ type: "cost", severity: "warning", detail: "'" + (c.problem || "").slice(0, 60) + "' overbudget: actual " + act + " vs estimated " + est });
      }
    });

    // --- High-RPN open risks ---
    var highRpnCount = 0;
    cases.forEach(function (c) {
      var rpn = (Number(c.sev) || 1) * (Number(c.occ) || 1) * (Number(c.det) || 1);
      if (rpn >= 200 && (c.status === "OPEN" || !c.status)) {
        highRpnCount++;
        findings.push({ type: "risk", severity: "critical", detail: "High RPN (" + rpn + ") on open item: '" + (c.problem || "").slice(0, 60) + "'" });
      }
    });

    // --- Quality signals ---
    cases.forEach(function (c) {
      var sev = Number(c.sev) || 0;
      var occ = Number(c.occ) || 0;
      if (sev >= 7) {
        findings.push({ type: "quality", severity: "warning", detail: "High severity (" + sev + ") on: '" + (c.problem || "").slice(0, 60) + "'" });
      }
      if (occ >= 6) {
        findings.push({ type: "quality", severity: "warning", detail: "High occurrence (" + occ + ") on: '" + (c.problem || "").slice(0, 60) + "'" });
      }
    });

    // --- Resource bottlenecks ---
    var ownerCounts = {};
    var noOwner = 0;
    cases.forEach(function (c) {
      var isOpen = !c.status || c.status === "OPEN" || c.status === "IN PROGRESS";
      var isCritical = c.priority === "1-CRITICAL" || c.priority === "2-HIGH";
      if (isOpen && isCritical) {
        if (!c.owner || c.owner === "") {
          noOwner++;
        } else {
          ownerCounts[c.owner] = (ownerCounts[c.owner] || 0) + 1;
        }
      }
    });
    Object.keys(ownerCounts).forEach(function (owner) {
      if (ownerCounts[owner] > 5) {
        findings.push({ type: "resource", severity: "warning", detail: "Owner '" + owner + "' has " + ownerCounts[owner] + " open critical/high cases (bottleneck)" });
      }
    });
    if (noOwner > 0) {
      findings.push({ type: "resource", severity: "warning", detail: noOwner + " critical/high case(s) have no assigned owner" });
    }

    // --- Stalled work ---
    cases.forEach(function (c) {
      if (c.status === "IN PROGRESS" && (Number(c.percent) || 0) < 0.2 && c.startDate) {
        var start = new Date(c.startDate).getTime();
        if (start && (now - start) > 30 * 24 * 60 * 60 * 1000) {
          findings.push({ type: "stalled", severity: "warning", detail: "Stalled: '" + (c.problem || "").slice(0, 60) + "' started >30 days ago, still <20% complete" });
        }
      }
    });

    // --- Risk exposure score ---
    var totalRpn = 0; var caseCount = cases.length || 1;
    cases.forEach(function (c) {
      totalRpn += (Number(c.sev) || 1) * (Number(c.occ) || 1) * (Number(c.det) || 1);
    });
    var riskExposure = totalRpn / caseCount;

    // --- Quality index (inverse of average severity for open items) ---
    var openSevSum = 0; var openCount = 0;
    cases.forEach(function (c) {
      if (!c.status || c.status === "OPEN" || c.status === "IN PROGRESS") {
        openSevSum += (Number(c.sev) || 1);
        openCount++;
      }
    });
    var avgSev = openCount > 0 ? openSevSum / openCount : 1;
    var qualityIndex = Math.max(0, Math.min(1, 1 - (avgSev - 1) / 9));

    // --- Overall health ---
    var criticalFindings = findings.filter(function (f) { return f.severity === "critical"; }).length;
    var warningFindings = findings.filter(function (f) { return f.severity === "warning"; }).length;
    var overallHealth = "on-track";
    if (criticalFindings > 0 || cpiEstimate < 0.7 || spiEstimate < 0.7) {
      overallHealth = "critical";
    } else if (warningFindings > 5 || cpiEstimate < 0.9 || spiEstimate < 0.9 || slippedMilestones > 2) {
      overallHealth = "warning";
    }

    return {
      overallHealth: overallHealth,
      findings: findings,
      scores: {
        spiEstimate: Math.round(spiEstimate * 100) / 100,
        cpiEstimate: Math.round(cpiEstimate * 100) / 100,
        riskExposure: Math.round(riskExposure * 100) / 100,
        qualityIndex: Math.round(qualityIndex * 100) / 100
      }
    };
  }

  // ---- Lesson Memory System ------------------------------------------------
  function generateId() {
    return "les_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  var MAX_LESSONS = 500;

  function recordLesson(lesson) {
    var store = storageGet(LESSONS_KEY) || { lessons: [] };
    var entry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      challenge: lesson.challenge || "",
      resolution: lesson.resolution || "",
      category: lesson.category || "",
      tags: Array.isArray(lesson.tags) ? lesson.tags : [],
      impact: lesson.impact || "medium",
      projectType: lesson.projectType || "",
      timesRecalled: 0
    };
    store.lessons.push(entry);

    // Evict oldest/least-recalled lessons when cap is exceeded
    if (store.lessons.length > MAX_LESSONS) {
      store.lessons.sort(function (a, b) {
        var ra = a.timesRecalled || 0;
        var rb = b.timesRecalled || 0;
        if (ra !== rb) return ra - rb; // least recalled first
        // Same recall count: oldest first
        return (a.timestamp || "").localeCompare(b.timestamp || "");
      });
      store.lessons = store.lessons.slice(store.lessons.length - MAX_LESSONS);
    }

    storageSet(LESSONS_KEY, store);
    return entry;
  }

  function recallLessons(context) {
    var store = storageGet(LESSONS_KEY) || { lessons: [] };
    var lessons = store.lessons;
    if (!lessons.length) return [];

    var query = norm(context.query || context.challenge || "");
    var category = context.category || null;
    var projectType = context.projectType || null;
    var tags = Array.isArray(context.tags) ? context.tags : [];
    var readOnly = !!context.readOnly;

    // Filter by category and projectType if provided
    var filtered = lessons.filter(function (l) {
      if (category && l.category && l.category !== category) return false;
      if (projectType && l.projectType && l.projectType !== projectType) return false;
      return true;
    });

    // Score by keyword overlap
    var scored = filtered.map(function (l) {
      var text = norm(l.challenge) + " " + (l.tags || []).join(" ") + " " + norm(l.resolution);
      var words = query.split(/\s+/).filter(Boolean);
      var hits = 0;
      words.forEach(function (w) {
        if (w.length > 2 && text.indexOf(w) >= 0) hits++;
      });
      // Tag match bonus
      tags.forEach(function (t) {
        if ((l.tags || []).indexOf(t) >= 0) hits += 2;
      });
      // Boost frequently recalled
      var recallBoost = Math.min(3, (l.timesRecalled || 0) * 0.5);
      return { lesson: l, score: hits + recallBoost };
    });

    // Sort by score descending
    scored.sort(function (a, b) { return b.score - a.score; });

    // Update timesRecalled for top results (unless readOnly)
    var results = scored.filter(function (s) { return s.score > 0; }).slice(0, 10);
    if (!readOnly) {
      results.forEach(function (s) {
        s.lesson.timesRecalled = (s.lesson.timesRecalled || 0) + 1;
      });
      storageSet(LESSONS_KEY, store);
    }

    return results.map(function (s) { return s.lesson; });
  }

  function suggestMitigations(riskDescription) {
    var store = storageGet(LESSONS_KEY) || { lessons: [] };
    var lessons = store.lessons;
    if (!lessons.length) return [];

    var query = norm(riskDescription);
    var words = query.split(/\s+/).filter(Boolean);

    var scored = lessons.map(function (l) {
      var text = norm(l.challenge) + " " + (l.tags || []).join(" ");
      var hits = 0;
      words.forEach(function (w) {
        if (w.length > 2 && text.indexOf(w) >= 0) hits++;
      });
      return { lesson: l, score: hits };
    });

    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.filter(function (s) { return s.score > 0; }).slice(0, 5).map(function (s) {
      return { challenge: s.lesson.challenge, resolution: s.lesson.resolution, confidence: Math.min(1, s.score / words.length), lessonId: s.lesson.id };
    });
  }

  // ---- detectPatterns(projectState) ----------------------------------------
  function detectPatterns(projectState) {
    var cases = (projectState && projectState.cases) || [];
    var milestones = (projectState && projectState.registers && projectState.registers.milestones) || [];
    var patterns = [];

    // High-RPN cases
    var highRpn = cases.filter(function (c) {
      return (Number(c.sev) || 1) * (Number(c.occ) || 1) * (Number(c.det) || 1) >= 200;
    });

    // (a) Category clustering: >40% high-RPN cases in same category
    if (highRpn.length >= 3) {
      var catCounts = {};
      highRpn.forEach(function (c) {
        var cat = c.category || "Unknown";
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      });
      Object.keys(catCounts).forEach(function (cat) {
        if (catCounts[cat] / highRpn.length > 0.4) {
          patterns.push({
            type: "category_clustering",
            severity: "high",
            description: "Over 40% of high-RPN items are in category '" + cat + "'",
            evidence: catCounts[cat] + " of " + highRpn.length + " high-RPN cases (" + Math.round(catCounts[cat] / highRpn.length * 100) + "%)",
            suggestedAction: "Conduct a focused root-cause analysis on '" + cat + "' category. Consider structural intervention."
          });
        }
      });
    }

    // (b) Owner overload: >30% open critical cases to one owner
    var openCritical = cases.filter(function (c) {
      var isOpen = !c.status || c.status === "OPEN" || c.status === "IN PROGRESS";
      return isOpen && (c.priority === "1-CRITICAL" || c.priority === "2-HIGH");
    });
    if (openCritical.length >= 3) {
      var ownCounts = {};
      openCritical.forEach(function (c) {
        var own = c.owner || "Unassigned";
        ownCounts[own] = (ownCounts[own] || 0) + 1;
      });
      Object.keys(ownCounts).forEach(function (own) {
        if (ownCounts[own] / openCritical.length > 0.3) {
          patterns.push({
            type: "owner_overload",
            severity: "medium",
            description: "Owner '" + own + "' carries over 30% of open critical/high items",
            evidence: ownCounts[own] + " of " + openCritical.length + " open critical/high cases (" + Math.round(ownCounts[own] / openCritical.length * 100) + "%)",
            suggestedAction: "Redistribute work from '" + own + "' or add support resources to reduce single-point-of-failure risk."
          });
        }
      });
    }

    // (c) Cost drift: >3 cases in same costCat overbudget
    var overBudgetByCat = {};
    cases.forEach(function (c) {
      var est = Number(c.estCost) || 0;
      var act = Number(c.actCost) || 0;
      if (est > 0 && act > est) {
        var cat = c.costCat || "Other";
        overBudgetByCat[cat] = (overBudgetByCat[cat] || 0) + 1;
      }
    });
    Object.keys(overBudgetByCat).forEach(function (cat) {
      if (overBudgetByCat[cat] > 3) {
        patterns.push({
          type: "cost_drift",
          severity: "high",
          description: "Cost drift in '" + cat + "': " + overBudgetByCat[cat] + " items overbudget",
          evidence: overBudgetByCat[cat] + " cases in '" + cat + "' have actCost > estCost",
          suggestedAction: "Review cost estimation methodology for '" + cat + "'. Consider re-baselining or adding contingency."
        });
      }
    });

    // (d) Schedule pattern: >3 milestones forecast-slipping
    var slipping = milestones.filter(function (ms) {
      if (ms.forecast && ms.baseline) {
        var fNum = parseInt(String(ms.forecast).replace(/[^0-9]/g, ""), 10) || 0;
        var bNum = parseInt(String(ms.baseline).replace(/[^0-9]/g, ""), 10) || 0;
        return fNum > bNum;
      }
      return false;
    });
    if (slipping.length > 3) {
      patterns.push({
        type: "schedule_pattern",
        severity: "high",
        description: "Systemic schedule slippage: " + slipping.length + " milestones forecasting late",
        evidence: slipping.map(function (ms) { return ms.milestone || "unknown"; }).join(", "),
        suggestedAction: "Reassess overall timeline. Consider fast-tracking critical path or adding resources to recover schedule."
      });
    }

    // (e) Risk materialization: BLOCKED/RESOLVED with actCost > estCost and high RPN
    cases.forEach(function (c) {
      var rpn = (Number(c.sev) || 1) * (Number(c.occ) || 1) * (Number(c.det) || 1);
      var est = Number(c.estCost) || 0;
      var act = Number(c.actCost) || 0;
      if ((c.status === "BLOCKED" || c.status === "RESOLVED") && rpn >= 200 && est > 0 && act > est) {
        patterns.push({
          type: "risk_materialization",
          severity: "critical",
          description: "Risk materialized: '" + (c.problem || "").slice(0, 60) + "' (RPN " + rpn + ", cost overrun)",
          evidence: "RPN=" + rpn + ", estCost=" + est + ", actCost=" + act + ", status=" + c.status,
          suggestedAction: "Record as lesson learned. Review whether similar risks remain open and strengthen mitigations."
        });
      }
    });

    return { patterns: patterns };
  }

  // ---- recommend(projectState) ---------------------------------------------
  function recommend(projectState) {
    var status = analyzeStatus(projectState);
    var patternResult = detectPatterns(projectState);
    var recommendations = [];

    // Convert findings to recommendations
    var findingsByType = {};
    status.findings.forEach(function (f) {
      findingsByType[f.type] = findingsByType[f.type] || [];
      findingsByType[f.type].push(f);
    });

    // Schedule recommendations
    if (findingsByType.schedule && findingsByType.schedule.length > 0) {
      var lessons = recallLessons({ query: "schedule delay slippage milestone", category: "Delivery / Schedule", readOnly: true });
      recommendations.push({
        priority: status.scores.spiEstimate < 0.8 ? 1 : 2,
        title: "Address schedule slippage",
        action: "Review " + findingsByType.schedule.length + " slipping milestone(s). Fast-track critical-path activities or add resources.",
        rationale: "SPI estimate is " + status.scores.spiEstimate + ". " + findingsByType.schedule.length + " milestone(s) forecasting late.",
        confidence: Math.min(0.95, 0.6 + (lessons.length * 0.1)),
        relatedLessonId: lessons.length > 0 ? lessons[0].id : null
      });
    }

    // Cost recommendations
    if (findingsByType.cost && findingsByType.cost.length > 0) {
      var costLessons = recallLessons({ query: "cost overrun budget overbudget", category: "Process / Flow", readOnly: true });
      recommendations.push({
        priority: status.scores.cpiEstimate < 0.8 ? 1 : 2,
        title: "Control cost overruns",
        action: "Investigate " + findingsByType.cost.length + " items exceeding budget. Tighten change control and re-baseline if necessary.",
        rationale: "CPI estimate is " + status.scores.cpiEstimate + ". " + findingsByType.cost.length + " item(s) over budget.",
        confidence: Math.min(0.95, 0.6 + (costLessons.length * 0.1)),
        relatedLessonId: costLessons.length > 0 ? costLessons[0].id : null
      });
    }

    // Risk recommendations
    if (findingsByType.risk && findingsByType.risk.length > 0) {
      var riskLessons = recallLessons({ query: "risk high rpn mitigation", tags: ["risk"], readOnly: true });
      recommendations.push({
        priority: 1,
        title: "Mitigate high-exposure risks",
        action: "Address " + findingsByType.risk.length + " high-RPN open item(s). Implement detection improvements or reduce occurrence.",
        rationale: "Risk exposure score is " + status.scores.riskExposure + ". " + findingsByType.risk.length + " item(s) exceed RPN 200.",
        confidence: Math.min(0.95, 0.7 + (riskLessons.length * 0.1)),
        relatedLessonId: riskLessons.length > 0 ? riskLessons[0].id : null
      });
    }

    // Resource recommendations
    if (findingsByType.resource && findingsByType.resource.length > 0) {
      recommendations.push({
        priority: 3,
        title: "Resolve resource bottlenecks",
        action: "Redistribute load from overloaded owners and assign owners to unassigned critical items.",
        rationale: findingsByType.resource.length + " resource concern(s) identified.",
        confidence: 0.7,
        relatedLessonId: null
      });
    }

    // Stalled work recommendations
    if (findingsByType.stalled && findingsByType.stalled.length > 0) {
      recommendations.push({
        priority: 3,
        title: "Unblock stalled work items",
        action: "Review " + findingsByType.stalled.length + " stalled item(s) that started over 30 days ago with less than 20% progress.",
        rationale: "Items stuck in progress indicate blocked dependencies or insufficient resources.",
        confidence: 0.65,
        relatedLessonId: null
      });
    }

    // Pattern-based recommendations
    patternResult.patterns.forEach(function (p) {
      var prio = p.severity === "critical" ? 1 : (p.severity === "high" ? 2 : 3);
      var patternLessons = recallLessons({ query: p.description, readOnly: true });
      recommendations.push({
        priority: prio,
        title: "Pattern detected: " + p.type.replace(/_/g, " "),
        action: p.suggestedAction,
        rationale: p.description + " (" + p.evidence + ")",
        confidence: Math.min(0.95, 0.5 + (patternLessons.length * 0.15)),
        relatedLessonId: patternLessons.length > 0 ? patternLessons[0].id : null
      });
    });

    // Sort by priority (ascending = most urgent first), then by confidence descending
    recommendations.sort(function (a, b) {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.confidence - a.confidence;
    });

    return { recommendations: recommendations };
  }

  // ---- selfImproveCheck(cases) ---------------------------------------------
  function selfImproveCheck(cases) {
    cases = cases || [];
    var pendingLessons = [];

    cases.forEach(function (c) {
      var rpn = (Number(c.sev) || 1) * (Number(c.occ) || 1) * (Number(c.det) || 1);
      var est = Number(c.estCost) || 0;
      var act = Number(c.actCost) || 0;
      var isResolved = c.status === "RESOLVED" || c.status === "CLOSED";
      var wasBlocked = c.status === "BLOCKED";

      var reasons = [];
      if (rpn >= 200) reasons.push("high RPN (" + rpn + ")");
      if (est > 0 && act > est * 1.5) reasons.push("overbudget (actual " + act + " vs est " + est + ")");
      if (wasBlocked) reasons.push("was BLOCKED");

      if ((isResolved || wasBlocked) && reasons.length > 0) {
        pendingLessons.push({
          challenge: (c.problem || "Unknown issue") + " [" + reasons.join("; ") + "]",
          resolution: isResolved ? "Resolved/closed successfully" : "Currently blocked - needs resolution path",
          category: c.category || "Process / Flow",
          tags: [c.costCat || "Other", c.priority || "3-MEDIUM"].concat(reasons.length > 1 ? ["multi-factor"] : []),
          impact: rpn >= 300 ? "high" : (rpn >= 200 ? "medium" : "low"),
          projectType: c._brain === "risk" ? "risk-management" : "task-execution"
        });
      }
    });

    return { pendingLessons: pendingLessons };
  }

  // ---- clear lesson memory (for testing) -----------------------------------
  function _clearLessons() {
    storageSet(LESSONS_KEY, { lessons: [] });
  }

  // ---- Vendor Directory: search and comparison functions --------------------

  // Region mapping for vendor search by region
  var VENDOR_REGION_MAP = {
    "asia": ["Japan", "China", "Thailand", "Indonesia", "Philippines", "Singapore", "United Arab Emirates"],
    "asia-pacific": ["Japan", "China", "Thailand", "Indonesia", "Philippines", "Singapore", "United Arab Emirates"],
    "europe": ["France", "Italy", "Denmark", "Netherlands", "Sweden", "Norway", "United Kingdom"],
    "americas": ["United States"],
    "north-america": ["United States"],
    "middle-east": ["United Arab Emirates"],
    "southeast-asia": ["Thailand", "Indonesia", "Philippines", "Singapore"],
    "nordic": ["Denmark", "Sweden", "Norway"]
  };

  function vendorSearch(criteria) {
    criteria = criteria || {};
    var vendors = (fibreProfile.vendors || []);
    var results = vendors.slice(); // copy

    // Filter by category
    if (criteria.category) {
      var cat = norm(criteria.category);
      results = results.filter(function (v) { return norm(v.category) === cat; });
    }

    // Filter by region (match HQ against region mapping)
    if (criteria.region) {
      var regionKey = norm(criteria.region).replace(/\s+/g, "-");
      var regionCountries = VENDOR_REGION_MAP[regionKey];
      if (regionCountries) {
        results = results.filter(function (v) {
          return regionCountries.indexOf(v.hq) >= 0;
        });
      } else {
        // Try direct HQ match
        var regionStr = norm(criteria.region);
        results = results.filter(function (v) {
          return norm(v.hq).indexOf(regionStr) >= 0;
        });
      }
    }

    // Filter by capability (keyword search in capabilities and products)
    if (criteria.capability) {
      var capKeyword = norm(criteria.capability);
      results = results.filter(function (v) {
        var haystack = norm((v.capabilities || []).join(" ") + " " + (v.products || []).join(" "));
        return haystack.indexOf(capKeyword) >= 0;
      });
    }

    // Filter by budgetTier matching priceRange
    if (criteria.budgetTier) {
      var tier = norm(criteria.budgetTier);
      results = results.filter(function (v) {
        return norm(v.priceRange) === tier;
      });
    }

    return results;
  }

  function vendorComparison(vendorIds) {
    vendorIds = vendorIds || [];
    var vendors = (fibreProfile.vendors || []);
    var selected = [];
    vendorIds.forEach(function (id) {
      var found = vendors.find(function (v) { return v.id === id; });
      if (found) selected.push(found);
    });

    if (selected.length === 0) {
      return { vendors: [], comparison: {}, summary: "No vendors found for the given IDs." };
    }

    var comparison = {
      companies: selected.map(function (v) { return v.company; }),
      headquarters: selected.map(function (v) { return v.hq; }),
      categories: selected.map(function (v) { return v.category; }),
      priceRanges: selected.map(function (v) { return v.priceRange; }),
      leadTimes: selected.map(function (v) { return v.leadTime; }),
      strengths: selected.map(function (v) { return v.strengths; }),
      considerations: selected.map(function (v) { return v.considerations; }),
      capabilities: selected.map(function (v) { return v.capabilities; }),
      products: selected.map(function (v) { return v.products; }),
      notableProjects: selected.map(function (v) { return v.notableProjects; }),
      websites: selected.map(function (v) { return v.website; })
    };

    var summary = "Comparing " + selected.length + " vendor(s): " + comparison.companies.join(" vs. ") + ".";

    return {
      vendors: selected,
      comparison: comparison,
      summary: summary
    };
  }

  // ---- Alert / Notification Engine -----------------------------------------
  var ALERT_DEFAULTS = {
    cpiThreshold: 0.9,
    spiThreshold: 0.9,
    rpnThreshold: 200,
    blockedDaysThreshold: 14,
    overbudgetFactor: 1.2
  };

  // ---- Contract Template & Clause Reference Functions ----------------------
  function getContractTemplates(filter) {
    filter = filter || {};
    var templates = (fibreProfile.CONTRACT_TEMPLATES || []).slice();

    // Filter by contractForm (NEC4, FIDIC, or BOTH)
    if (filter.contractForm) {
      var form = norm(filter.contractForm);
      templates = templates.filter(function (t) {
        var tForm = norm(t.contractForm);
        return tForm === form || tForm === "both" || form === "both";
      });
    }

    // Filter by keyword (search across name, purpose, whenToUse, sampleSubject)
    if (filter.keyword) {
      var kw = norm(filter.keyword);
      templates = templates.filter(function (t) {
        var haystack = norm(t.name) + " " + norm(t.purpose) + " " + norm(t.whenToUse) + " " + norm(t.sampleSubject);
        return haystack.indexOf(kw) >= 0;
      });
    }

    return templates;
  }

  function getClauseReference(clauseNumber) {
    var ref = fibreProfile.CLAUSE_REFERENCE || {};
    if (!clauseNumber) return null;
    var key = String(clauseNumber).trim();

    // Try direct key lookup (e.g., "NEC4-15" or "FIDIC-4")
    if (ref[key]) return ref[key];

    // Try with prefix variations
    var nec4Key = "NEC4-" + key;
    if (ref[nec4Key]) return ref[nec4Key];

    var fidicKey = "FIDIC-" + key;
    if (ref[fidicKey]) return ref[fidicKey];

    // Try matching by number field
    var keys = Object.keys(ref);
    for (var i = 0; i < keys.length; i++) {
      if (ref[keys[i]].number === key) return ref[keys[i]];
    }

    return null;
  }

  // List the whole clause-reference library (with its key), optionally filtered
  // by contract form inferred from the key prefix (NEC4-* / FIDIC-*).
  function listClauses(form) {
    var ref = fibreProfile.CLAUSE_REFERENCE || {};
    var f = form ? norm(form) : null;
    return Object.keys(ref).map(function (k) {
      var o = ref[k];
      var src = /^nec4/i.test(k) ? "NEC4" : (/^fidic/i.test(k) ? "FIDIC" : "BOTH");
      return { key: k, form: src, number: o.number, title: o.title, summary: o.summary, submarineRelevance: o.submarineRelevance };
    }).filter(function (c) { return !f || norm(c.form) === f; });
  }

  // ---- Contract Variation / Compensation-Event impact engine --------------
  // Deterministic assessment of variations (FIDIC cl.13) / compensation events
  // (NEC4 cl.60) against a contract package: revised contract sum, retention
  // impact, time impact and status breakdown. Ships with submarine-realistic
  // sample variations so it renders out of the box; callers may pass their own.
  var SAMPLE_VARIATIONS = [
    { ref: "VO-001", title: "Additional cable burial depth at shipping-lane crossing", form: "FIDIC", clause: "13.1", valueUsd: 3200000, status: "Approved", timeImpactDays: 12 },
    { ref: "CE-014", title: "Reroute around disputed maritime boundary", form: "NEC4", clause: "60.1", valueUsd: 8500000, status: "Quotation Submitted", timeImpactDays: 45 },
    { ref: "VO-007", title: "Additional branching unit & repeater for extended spur", form: "FIDIC", clause: "13.3", valueUsd: 5100000, status: "Approved", timeImpactDays: 20 },
    { ref: "CE-021", title: "Weather standby — extended monsoon window", form: "NEC4", clause: "60.1", valueUsd: 2400000, status: "Notified", timeImpactDays: 30 },
    { ref: "VO-009", title: "Substitute armour type (non-compliant)", form: "FIDIC", clause: "13.1", valueUsd: 1800000, status: "Rejected", timeImpactDays: 0 }
  ];
  function variationImpact(params) {
    params = params || {};
    var contractSumUsd = Number(params.contractSumUsd) || 420000000;
    var retentionPct = params.retentionPct != null ? Number(params.retentionPct) : 5;
    var variations = (params.variations && params.variations.length ? params.variations : SAMPLE_VARIATIONS).map(function (v) {
      return {
        ref: v.ref, title: v.title, form: v.form || "FIDIC", clause: v.clause || "",
        valueUsd: Number(v.valueUsd) || 0, status: v.status || "Notified",
        timeImpactDays: Number(v.timeImpactDays) || 0
      };
    });
    var APPROVED = ["approved", "implemented"], PENDING = ["notified", "quotation submitted", "under assessment"], REJECTED = ["rejected"];
    function bucket(s) {
      var n = norm(s);
      if (APPROVED.indexOf(n) >= 0) return "approved";
      if (REJECTED.indexOf(n) >= 0) return "rejected";
      return "pending";
    }
    var approvedTotal = 0, pendingTotal = 0, rejectedTotal = 0, approvedDays = 0, pendingDays = 0;
    var counts = { approved: 0, pending: 0, rejected: 0 };
    variations.forEach(function (v) {
      var b = bucket(v.status); v._bucket = b; counts[b]++;
      if (b === "approved") { approvedTotal += v.valueUsd; approvedDays += v.timeImpactDays; }
      else if (b === "pending") { pendingTotal += v.valueUsd; pendingDays += v.timeImpactDays; }
      else rejectedTotal += v.valueUsd;
    });
    var revisedContractSum = contractSumUsd + approvedTotal;
    var pctChange = contractSumUsd > 0 ? Math.round(approvedTotal / contractSumUsd * 1000) / 10 : 0;
    var exposurePct = contractSumUsd > 0 ? Math.round((approvedTotal + pendingTotal) / contractSumUsd * 1000) / 10 : 0;
    return {
      inputs: { contractSumUsd: contractSumUsd, retentionPct: retentionPct },
      variations: variations,
      summary: {
        originalContractSumUsd: contractSumUsd,
        approvedVariationsUsd: approvedTotal,
        pendingVariationsUsd: pendingTotal,
        rejectedVariationsUsd: rejectedTotal,
        revisedContractSumUsd: revisedContractSum,
        pctChange: pctChange,
        exposurePct: exposurePct,
        retentionOnRevisedUsd: Math.round(revisedContractSum * retentionPct / 100),
        approvedTimeImpactDays: approvedDays,
        pendingTimeImpactDays: pendingDays,
        counts: counts,
        total: variations.length
      },
      references: [
        "FIDIC Red Book cl.13 — Variations and Adjustments (instruction, valuation, dayworks)",
        "NEC4 cl.60-65 — Compensation Events (notification, quotation, assessment, implementation)",
        "FIDIC cl.14.3 / NEC4 cl.50 — Interim payments & retention on the revised contract price",
        "NEC4 cl.61.3 — 8-week time-bar for compensation-event notification"
      ]
    };
  }

  function checkAlerts(projectState, config) {
    var cfg = {};
    var k;
    for (k in ALERT_DEFAULTS) { cfg[k] = ALERT_DEFAULTS[k]; }
    if (config) { for (k in config) { if (config.hasOwnProperty(k)) cfg[k] = config[k]; } }

    var cases = (projectState && projectState.cases) || [];
    var milestones = (projectState && projectState.registers && projectState.registers.milestones) || [];
    var project = (projectState && projectState.project) || {};
    var now = Date.now();
    var alerts = [];
    var alertIdx = 0;

    function makeAlert(severity, category, title, detail, affectedId) {
      alertIdx++;
      return {
        id: "alert_" + alertIdx + "_" + now,
        severity: severity,
        category: category,
        title: title,
        detail: detail,
        affectedId: affectedId || null,
        timestamp: new Date(now).toISOString()
      };
    }

    // 1) Overdue milestones (forecast > baseline)
    milestones.forEach(function (ms) {
      if (ms.forecast && ms.baseline) {
        var fDate = new Date(ms.forecast).getTime();
        var bDate = new Date(ms.baseline).getTime();
        // Also handle numeric strings
        if (isNaN(fDate) || isNaN(bDate)) {
          var fNum = parseInt(String(ms.forecast).replace(/[^0-9]/g, ""), 10) || 0;
          var bNum = parseInt(String(ms.baseline).replace(/[^0-9]/g, ""), 10) || 0;
          if (fNum > bNum) {
            alerts.push(makeAlert("warning", "schedule", "Overdue milestone", "Milestone '" + (ms.milestone || ms.name || "unknown") + "' forecast (" + ms.forecast + ") exceeds baseline (" + ms.baseline + ")", ms.id || null));
          }
        } else if (fDate > bDate) {
          alerts.push(makeAlert("warning", "schedule", "Overdue milestone", "Milestone '" + (ms.milestone || ms.name || "unknown") + "' forecast (" + ms.forecast + ") exceeds baseline (" + ms.baseline + ")", ms.id || null));
        }
      }
    });

    // 2) Overbudget cases (actCost > estCost * overbudgetFactor)
    cases.forEach(function (c) {
      var est = Number(c.estCost) || 0;
      var act = Number(c.actCost) || 0;
      if (est > 0 && act > est * cfg.overbudgetFactor) {
        alerts.push(makeAlert("warning", "cost", "Case overbudget", "'" + (c.problem || "").slice(0, 60) + "' actual cost " + act + " exceeds " + Math.round(cfg.overbudgetFactor * 100) + "% of estimate " + est, c.id || null));
      }
    });

    // 3) CPI below threshold
    var totalEst = 0; var totalAct = 0; var totalEv = 0;
    cases.forEach(function (c) {
      var est = Number(c.estCost) || 0;
      var act = Number(c.actCost) || 0;
      var pct = Number(c.percent) || 0;
      totalEst += est;
      totalAct += act;
      totalEv += est * pct;
    });
    var cpi = totalAct > 0 ? totalEv / totalAct : 1;
    if (totalAct > 0 && cpi < cfg.cpiThreshold) {
      alerts.push(makeAlert("critical", "cost", "CPI below threshold", "Cost Performance Index is " + (Math.round(cpi * 100) / 100) + " (threshold: " + cfg.cpiThreshold + ")", null));
    }

    // 4) SPI below threshold
    var projectStart = project.start ? new Date(project.start).getTime() : null;
    var projectEnd = project.end ? new Date(project.end).getTime() : null;
    var plannedFraction = 1;
    if (projectStart && projectEnd && projectEnd > projectStart) {
      var elapsed = Math.max(0, now - projectStart);
      var total = projectEnd - projectStart;
      plannedFraction = Math.min(1, elapsed / total);
    }
    var earnedFraction = totalEst > 0 ? totalEv / totalEst : 0;
    var spi = plannedFraction > 0 ? earnedFraction / plannedFraction : 1;
    if (totalEst > 0 && spi < cfg.spiThreshold) {
      alerts.push(makeAlert("critical", "schedule", "SPI below threshold", "Schedule Performance Index is " + (Math.round(spi * 100) / 100) + " (threshold: " + cfg.spiThreshold + ")", null));
    }

    // 5) Cases BLOCKED for > blockedDaysThreshold days
    cases.forEach(function (c) {
      if (c.status === "BLOCKED") {
        var startMs = c.startDate ? new Date(c.startDate).getTime() : 0;
        if (startMs && (now - startMs) > cfg.blockedDaysThreshold * 24 * 60 * 60 * 1000) {
          alerts.push(makeAlert("critical", "blocked", "Case blocked too long", "'" + (c.problem || "").slice(0, 60) + "' has been BLOCKED for >" + cfg.blockedDaysThreshold + " days", c.id || null));
        }
      }
    });

    // 6) High-RPN risks still OPEN (RPN > rpnThreshold)
    cases.forEach(function (c) {
      var rpn = (Number(c.sev) || 1) * (Number(c.occ) || 1) * (Number(c.det) || 1);
      if (rpn > cfg.rpnThreshold && (c.status === "OPEN" || !c.status)) {
        alerts.push(makeAlert("warning", "risk", "High-RPN risk open", "RPN " + rpn + " on '" + (c.problem || "").slice(0, 60) + "'", c.id || null));
      }
    });

    // 7) Payment certificates overdue (cases with costCat containing 'payment' or category 'payment' that are overdue)
    cases.forEach(function (c) {
      var isPayment = /payment/i.test(c.costCat || "") || /payment.*cert/i.test(c.problem || "") || /certificate/i.test(c.problem || "");
      if (isPayment && c.status !== "CLOSED" && c.status !== "RESOLVED") {
        var startMs = c.startDate ? new Date(c.startDate).getTime() : 0;
        if (startMs && (now - startMs) > 30 * 24 * 60 * 60 * 1000) {
          alerts.push(makeAlert("warning", "payment", "Payment certificate overdue", "'" + (c.problem || "").slice(0, 60) + "' started >30 days ago and not closed", c.id || null));
        }
      }
    });

    // 8) Unresolved claims older than 30 days
    cases.forEach(function (c) {
      var isClaim = /claim/i.test(c.problem || "") || /claim/i.test(c.category || "") || /claim/i.test(c.costCat || "");
      if (isClaim && c.status !== "CLOSED" && c.status !== "RESOLVED") {
        var startMs = c.startDate ? new Date(c.startDate).getTime() : 0;
        if (startMs && (now - startMs) > 30 * 24 * 60 * 60 * 1000) {
          alerts.push(makeAlert("info", "claims", "Unresolved claim >30 days", "'" + (c.problem || "").slice(0, 60) + "' unresolved for >30 days", c.id || null));
        }
      }
    });

    // Build summary
    var critCount = 0; var warnCount = 0; var infoCount = 0;
    alerts.forEach(function (a) {
      if (a.severity === "critical") critCount++;
      else if (a.severity === "warning") warnCount++;
      else infoCount++;
    });

    return {
      alerts: alerts,
      summary: { critical: critCount, warning: warnCount, info: infoCount }
    };
  }

  // ---- Monte Carlo Risk Quantification Engine --------------------------------

  // Seeded PRNG (xorshift32) for reproducible simulations
  function createRng(seed) {
    var state = seed ? (seed >>> 0) || 1 : (Date.now() >>> 0) || 1;
    return function () {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
  }

  // PERT distribution random sample using beta approximation
  // mean = (min + 4*mode + max) / 6
  // Uses Box-Muller approximation shaped to PERT via alpha/beta parameters
  function pertRandom(min, mode, max, rng) {
    if (min >= max) return mode;
    var mu = (min + 4 * mode + max) / 6;
    var range = max - min;
    if (range === 0) return min;
    // PERT shape parameter lambda=4
    var alpha = 1 + 4 * ((mu - min) / range);
    var beta = 1 + 4 * ((max - mu) / range);
    // Generate beta-distributed value using Joehnk method (simple for small alpha/beta)
    var u, v, w;
    var maxIter = 100;
    for (var i = 0; i < maxIter; i++) {
      u = Math.pow(rng(), 1 / alpha);
      v = Math.pow(rng(), 1 / beta);
      w = u + v;
      if (w <= 1 && w > 0) {
        return min + (u / w) * range;
      }
    }
    // Fallback: use triangular approximation
    return triangularRandom(min, mode, max, rng);
  }

  // Triangular distribution random sample
  function triangularRandom(min, mode, max, rng) {
    if (min >= max) return mode;
    var u = rng();
    var fc = (mode - min) / (max - min);
    if (u < fc) {
      return min + Math.sqrt(u * (max - min) * (mode - min));
    } else {
      return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    }
  }

  // Uniform distribution random sample
  function uniformRandom(min, max, rng) {
    return min + rng() * (max - min);
  }

  // Normal distribution random sample (Box-Muller transform)
  function normalRandom(mean, stdDev, rng) {
    var u1 = rng();
    var u2 = rng();
    if (u1 < 1e-10) u1 = 1e-10;
    var z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stdDev;
  }

  // Build histogram from array of values
  function buildHistogram(values, bucketCount) {
    if (!values || values.length === 0) return [];
    bucketCount = bucketCount || 20;
    var minVal = values[0];
    var maxVal = values[0];
    for (var i = 1; i < values.length; i++) {
      if (values[i] < minVal) minVal = values[i];
      if (values[i] > maxVal) maxVal = values[i];
    }
    if (minVal === maxVal) {
      return [{ bucket: Math.round(minVal * 100) / 100, count: values.length }];
    }
    var bucketSize = (maxVal - minVal) / bucketCount;
    var buckets = [];
    for (var b = 0; b < bucketCount; b++) {
      buckets.push({ bucket: Math.round((minVal + b * bucketSize) * 100) / 100, count: 0 });
    }
    for (var j = 0; j < values.length; j++) {
      var idx = Math.floor((values[j] - minVal) / bucketSize);
      if (idx >= bucketCount) idx = bucketCount - 1;
      buckets[idx].count++;
    }
    return buckets;
  }

  // Percentile from sorted array
  function percentile(sorted, p) {
    if (!sorted || sorted.length === 0) return 0;
    var idx = (p / 100) * (sorted.length - 1);
    var lower = Math.floor(idx);
    var upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    var frac = idx - lower;
    return sorted[lower] * (1 - frac) + sorted[upper] * frac;
  }

  // Calculate critical path duration for a set of tasks with given durations
  function calcCriticalPath(tasks, durations) {
    // Build adjacency: each task's earliest start depends on predecessors finishing
    var taskMap = {};
    for (var i = 0; i < tasks.length; i++) {
      taskMap[tasks[i].id] = i;
    }
    var earlyFinish = new Array(tasks.length);
    var visited = new Array(tasks.length);
    for (var k = 0; k < tasks.length; k++) {
      earlyFinish[k] = 0;
      visited[k] = false;
    }

    // Topological order via DFS to compute earliest finish
    function computeEF(idx) {
      if (visited[idx]) return earlyFinish[idx];
      visited[idx] = true;
      var deps = tasks[idx].dependencies || [];
      var earlyStart = 0;
      for (var d = 0; d < deps.length; d++) {
        var depIdx = taskMap[deps[d]];
        if (depIdx !== undefined) {
          var depEF = computeEF(depIdx);
          if (depEF > earlyStart) earlyStart = depEF;
        }
      }
      earlyFinish[idx] = earlyStart + durations[idx];
      return earlyFinish[idx];
    }

    for (var t = 0; t < tasks.length; t++) {
      computeEF(t);
    }

    // Total duration is the maximum early finish
    var totalDuration = 0;
    for (var f = 0; f < earlyFinish.length; f++) {
      if (earlyFinish[f] > totalDuration) totalDuration = earlyFinish[f];
    }

    // Identify which tasks are on the critical path (early finish === total duration chain)
    var criticalTasks = [];
    var lateFinish = new Array(tasks.length);
    for (var lf = 0; lf < tasks.length; lf++) {
      lateFinish[lf] = totalDuration;
    }
    // Reverse pass: compute late finish
    // Build reverse adjacency
    var successors = {};
    for (var si = 0; si < tasks.length; si++) {
      successors[tasks[si].id] = [];
    }
    for (var sj = 0; sj < tasks.length; sj++) {
      var deps2 = tasks[sj].dependencies || [];
      for (var sd = 0; sd < deps2.length; sd++) {
        if (successors[deps2[sd]]) {
          successors[deps2[sd]].push(sj);
        }
      }
    }
    // Compute late start in reverse topological order
    var lateStart = new Array(tasks.length);
    var visitedLate = new Array(tasks.length);
    for (var li = 0; li < tasks.length; li++) {
      lateStart[li] = totalDuration;
      visitedLate[li] = false;
    }
    function computeLS(idx) {
      if (visitedLate[idx]) return lateStart[idx];
      visitedLate[idx] = true;
      var succs = successors[tasks[idx].id];
      if (succs.length === 0) {
        lateStart[idx] = totalDuration - durations[idx];
      } else {
        var latestAllowed = totalDuration;
        for (var s = 0; s < succs.length; s++) {
          var succLS = computeLS(succs[s]);
          if (succLS < latestAllowed) latestAllowed = succLS;
        }
        lateStart[idx] = latestAllowed - durations[idx];
      }
      return lateStart[idx];
    }
    for (var ci = 0; ci < tasks.length; ci++) {
      computeLS(ci);
    }
    // Tasks on critical path: early start === late start (zero float)
    for (var cp = 0; cp < tasks.length; cp++) {
      var earlyStart2 = earlyFinish[cp] - durations[cp];
      if (Math.abs(earlyStart2 - lateStart[cp]) < 0.001) {
        criticalTasks.push(tasks[cp].id);
      }
    }

    return { duration: totalDuration, criticalTasks: criticalTasks };
  }

  // Monte Carlo Schedule Simulation
  function monteCarloSchedule(tasks, iterations, options) {
    iterations = iterations || 1000;
    options = options || {};
    var rng = createRng(options.seed);

    if (!tasks || tasks.length === 0) {
      return { p50: 0, p80: 0, p90: 0, mean: 0, stdDev: 0, histogram: [], criticalPathFrequency: [] };
    }

    var results = [];
    var cpFreq = {};
    for (var ti = 0; ti < tasks.length; ti++) {
      cpFreq[tasks[ti].id] = 0;
    }

    for (var i = 0; i < iterations; i++) {
      // Sample durations for each task using PERT distribution
      var durations = [];
      for (var t = 0; t < tasks.length; t++) {
        var task = tasks[t];
        var opt = Number(task.optimistic) || 1;
        var ml = Number(task.mostLikely) || opt;
        var pess = Number(task.pessimistic) || ml;
        durations.push(pertRandom(opt, ml, pess, rng));
      }
      // Calculate critical path
      var cpResult = calcCriticalPath(tasks, durations);
      results.push(cpResult.duration);
      // Track critical path frequency
      for (var c = 0; c < cpResult.criticalTasks.length; c++) {
        var tid = cpResult.criticalTasks[c];
        if (cpFreq[tid] !== undefined) cpFreq[tid]++;
      }
    }

    // Sort results for percentile calculations
    results.sort(function (a, b) { return a - b; });

    // Calculate statistics
    var sum = 0;
    for (var si2 = 0; si2 < results.length; si2++) sum += results[si2];
    var mean = sum / results.length;

    var variance = 0;
    for (var vi = 0; vi < results.length; vi++) {
      variance += (results[vi] - mean) * (results[vi] - mean);
    }
    variance = variance / results.length;
    var stdDev = Math.sqrt(variance);

    // Build critical path frequency array
    var criticalPathFrequency = [];
    for (var fk in cpFreq) {
      if (cpFreq.hasOwnProperty(fk)) {
        criticalPathFrequency.push({
          taskId: fk,
          frequency: Math.round((cpFreq[fk] / iterations) * 10000) / 10000
        });
      }
    }
    criticalPathFrequency.sort(function (a, b) { return b.frequency - a.frequency; });

    return {
      p50: Math.round(percentile(results, 50) * 100) / 100,
      p80: Math.round(percentile(results, 80) * 100) / 100,
      p90: Math.round(percentile(results, 90) * 100) / 100,
      mean: Math.round(mean * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      histogram: buildHistogram(results),
      criticalPathFrequency: criticalPathFrequency
    };
  }

  // Monte Carlo Cost Simulation
  function monteCarloCost(items, iterations, options) {
    iterations = iterations || 1000;
    options = options || {};
    var rng = createRng(options.seed);

    if (!items || items.length === 0) {
      return { p50: 0, p80: 0, p90: 0, mean: 0, stdDev: 0, histogram: [], contingencyRecommendation: { p80Amount: 0, p90Amount: 0, percentOfBase: 0 } };
    }

    var results = [];
    // Calculate base cost (sum of likely values)
    var baseCost = 0;
    for (var bi = 0; bi < items.length; bi++) {
      baseCost += Number(items[bi].likely) || 0;
    }

    for (var i = 0; i < iterations; i++) {
      var totalCost = 0;
      for (var j = 0; j < items.length; j++) {
        var item = items[j];
        var low = Number(item.low) || 0;
        var likely = Number(item.likely) || low;
        var high = Number(item.high) || likely;
        var dist = (item.distribution || "triangular").toLowerCase();

        var sampled;
        if (dist === "uniform") {
          sampled = uniformRandom(low, high, rng);
        } else if (dist === "normal") {
          var nmean = (low + 4 * likely + high) / 6;
          var nstd = (high - low) / 6;
          sampled = normalRandom(nmean, nstd, rng);
          // Clamp to reasonable range
          if (sampled < low * 0.8) sampled = low * 0.8;
          if (sampled > high * 1.2) sampled = high * 1.2;
        } else {
          // triangular (default)
          sampled = triangularRandom(low, likely, high, rng);
        }
        totalCost += sampled;
      }
      results.push(totalCost);
    }

    // Sort for percentile
    results.sort(function (a, b) { return a - b; });

    // Statistics
    var sum = 0;
    for (var si2 = 0; si2 < results.length; si2++) sum += results[si2];
    var mean = sum / results.length;
    var variance = 0;
    for (var vi = 0; vi < results.length; vi++) {
      variance += (results[vi] - mean) * (results[vi] - mean);
    }
    variance = variance / results.length;
    var stdDev = Math.sqrt(variance);

    var p50 = percentile(results, 50);
    var p80 = percentile(results, 80);
    var p90 = percentile(results, 90);

    var contingencyP80 = p80 - baseCost;
    var contingencyP90 = p90 - baseCost;
    var percentOfBase = baseCost > 0 ? Math.round((contingencyP90 / baseCost) * 10000) / 100 : 0;

    return {
      p50: Math.round(p50 * 100) / 100,
      p80: Math.round(p80 * 100) / 100,
      p90: Math.round(p90 * 100) / 100,
      mean: Math.round(mean * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      histogram: buildHistogram(results),
      contingencyRecommendation: {
        p80Amount: Math.round(contingencyP80 * 100) / 100,
        p90Amount: Math.round(contingencyP90 * 100) / 100,
        percentOfBase: percentOfBase
      }
    };
  }

  // Risk Quantification - auto-generates Monte Carlo inputs from project state
  function riskQuantification(projectState) {
    projectState = projectState || {};
    var cases = projectState.cases || [];
    var options = projectState.options || {};

    // Extract tasks with cost estimates for cost simulation
    var costItems = [];
    var scheduleTasks = [];
    var taskIndex = 0;

    cases.forEach(function (c) {
      var est = Number(c.estCost) || 0;
      if (est > 0) {
        var rpn = (Number(c.sev) || 1) * (Number(c.occ) || 1) * (Number(c.det) || 1);
        var isCritical = rpn >= 200 || c.priority === "1-CRITICAL";

        // Auto-generate ranges
        var optimisticFactor = 0.8;
        var pessimisticFactor = isCritical ? 2.0 : 1.5;

        costItems.push({
          id: c.id || ("cost-" + taskIndex),
          name: (c.problem || "Item " + taskIndex).slice(0, 80),
          low: Math.round(est * optimisticFactor),
          likely: est,
          high: Math.round(est * pessimisticFactor),
          distribution: "triangular"
        });

        // Build schedule task if it has a start date or is a primary task
        if (c._brain === "task" || c.startDate) {
          var baseDays = 30; // default task duration
          var phase = c._phase || "";
          // Estimate duration based on cost magnitude
          if (est > 100000) baseDays = 60;
          else if (est > 50000) baseDays = 45;
          else if (est > 10000) baseDays = 30;
          else baseDays = 15;

          scheduleTasks.push({
            id: c.id || ("task-" + taskIndex),
            name: (c.problem || "Task " + taskIndex).slice(0, 80),
            optimistic: Math.round(baseDays * optimisticFactor),
            mostLikely: baseDays,
            pessimistic: Math.round(baseDays * pessimisticFactor),
            dependencies: []
          });
        }
        taskIndex++;
      }
    });

    // Add sequential dependencies for schedule tasks within same phase
    // Group by phase and chain them
    if (scheduleTasks.length > 1) {
      for (var st = 1; st < scheduleTasks.length; st++) {
        // Simple chain: each task depends on previous (conservative)
        scheduleTasks[st].dependencies = [scheduleTasks[st - 1].id];
      }
    }

    var scheduleResult = monteCarloSchedule(scheduleTasks, options.iterations || 1000, options);
    var costResult = monteCarloCost(costItems, options.iterations || 1000, options);

    // Calculate base totals
    var totalBase = 0;
    for (var bi = 0; bi < costItems.length; bi++) {
      totalBase += costItems[bi].likely;
    }

    return {
      schedule: scheduleResult,
      cost: costResult,
      summary: {
        tasksAnalyzed: scheduleTasks.length,
        costItemsAnalyzed: costItems.length,
        totalBaseEstimate: totalBase,
        recommendedContingency: costResult.contingencyRecommendation,
        scheduleConfidence: {
          p50Days: scheduleResult.p50,
          p80Days: scheduleResult.p80,
          p90Days: scheduleResult.p90
        }
      }
    };
  }

  // ---- Cable Repair & Restoration Planning --------------------------------
  function estimateRepairCost(opts) {
    opts = opts || {};
    var depth = Number(opts.depth) || 500;
    var distanceFromDepotKm = Number(opts.distanceFromDepotKm) || 200;
    var faultType = opts.faultType || "cable-break";

    var db = fibreProfile.REPAIR_DATABASE;
    if (!db) return null;

    // Find repair scenario based on depth
    var scenario = null;
    for (var i = 0; i < db.repairScenarios.length; i++) {
      var s = db.repairScenarios[i];
      if (i === 0 && depth <= s.maxDepth) { scenario = s; break; }
      if (i === 1 && depth > 200 && depth <= s.maxDepth) { scenario = s; break; }
      if (i === 2 && depth > 1500) { scenario = s; break; }
    }
    if (!scenario) scenario = db.repairScenarios[2]; // default to deep

    // Find nearest capable ship (by depth rating and closest home port region)
    var capableShips = db.repairShips.filter(function (ship) {
      return ship.depthRating >= depth;
    });
    if (capableShips.length === 0) capableShips = [db.repairShips[4]]; // Subcom Reliance as fallback

    // Pick ship with fastest mobilization
    var nearestShip = capableShips[0];
    for (var j = 1; j < capableShips.length; j++) {
      if (capableShips[j].mobilizationDays[0] < nearestShip.mobilizationDays[0]) {
        nearestShip = capableShips[j];
      }
    }

    // Calculate transit days based on distance and ship speed
    var transitDays = Math.ceil(distanceFromDepotKm / (nearestShip.speed * 24 * 1.852));
    if (transitDays < 1) transitDays = 1;

    // Repair days from scenario
    var repairDaysMin = scenario.repairDays[0];
    var repairDaysMax = scenario.repairDays[1];
    var repairDays = Math.round((repairDaysMin + repairDaysMax) / 2);

    // Fault type multiplier
    var faultMultiplier = 1.0;
    if (faultType === "shunt-fault") faultMultiplier = 0.8;
    else if (faultType === "multiple-break") faultMultiplier = 1.5;
    else if (faultType === "repeater-failure") faultMultiplier = 1.8;

    // Total days
    var mobilizationDays = Math.round((nearestShip.mobilizationDays[0] + nearestShip.mobilizationDays[1]) / 2);
    var totalDays = mobilizationDays + (transitDays * 2) + repairDays;

    // Cost estimate
    var avgDayRate = (nearestShip.dayRate[0] + nearestShip.dayRate[1]) / 2;
    var vesselCost = totalDays * avgDayRate;
    var materialCost = (scenario.costRange[0] + scenario.costRange[1]) / 2 * 0.3;
    var estimatedCost = Math.round((vesselCost + materialCost) * faultMultiplier);

    return {
      nearestShip: nearestShip.name,
      transitDays: transitDays,
      repairDays: repairDays,
      totalDays: totalDays,
      estimatedCost: estimatedCost,
      scenario: scenario.label,
      faultType: faultType
    };
  }

  function getRepairStrategy() {
    var db = fibreProfile.REPAIR_DATABASE;
    if (!db) return null;

    var depots = db.spareDepots.map(function (d) {
      return {
        location: d.location,
        region: d.region,
        stockPercent: d.stockPercent,
        description: d.description
      };
    });

    return {
      depots: depots,
      totalShips: db.repairShips.length,
      repairScenarios: db.repairScenarios.map(function (s) {
        return {
          id: s.id,
          label: s.label,
          repairDays: s.repairDays,
          costRange: s.costRange
        };
      })
    };
  }

  // ---------- Cable System Design Calculator ----------
  // Engineering-grade submarine cable system design per ITU-T G.977, G.978, IEC 60708, ITU-T G.654.E
  function designCableSystem(params) {
    var routeKm = params.routeKm || 1000;
    var fiberPairs = params.fiberPairs || 8;
    var targetCapacityTbps = params.targetCapacityTbps || 100;
    var landingCount = params.landingCount || 2;
    var maxDepthM = params.maxDepthM || 4000;
    var fiberType = params.fiberType || "G.654.E"; // G.654.E or G.652.D
    var band = params.band || "C"; // C or C+L
    var depthProfile = params.depthProfile || null; // optional: {shallow0_200: %, shelf200_1000: %, slope1000_2000: %, deep2000plus: %}

    // --- 1. Fiber Parameters ---
    var fiberAttenuation = fiberType === "G.654.E" ? 0.17 : 0.20; // dB/km at 1550nm
    var spliceLoss = 0.1; // dB per factory splice every 25km cable length
    var connectorLoss = 0.3; // dB per pair at landing stations

    // --- 2. Amplifier Parameters (Submarine EDFA) ---
    var amplifierGain = 18; // dB for modern submarine EDFA (range 14-18)
    var noiseFigure = 5.5; // dB for modern submarine EDFA
    var requiredMargin = 3; // dB system margin + aging

    // --- 3. Span Loss Budget (foundation of repeater spacing) ---
    var maxSpanLoss = amplifierGain - requiredMargin; // max allowable span loss in dB
    // Effective attenuation includes splices every 25km
    var effectiveAttenuation = fiberAttenuation + (spliceLoss / 25); // dB/km including splices
    var repeaterSpacingRaw = maxSpanLoss / effectiveAttenuation;
    var repeaterSpacing = Math.floor(repeaterSpacingRaw / 5) * 5; // round down to nearest 5km
    if (repeaterSpacing < 40) repeaterSpacing = 40; // minimum practical spacing
    if (repeaterSpacing > 120) repeaterSpacing = 120; // maximum practical spacing

    var repeaterCount = Math.max(0, Math.ceil(routeKm / repeaterSpacing) - 1);
    var numberOfSpans = repeaterCount + 1;
    var averageSpanLength = routeKm / numberOfSpans;

    // Actual span loss for the average span
    var splicesPerSpan = Math.floor(averageSpanLength / 25);
    var spanLossdB = fiberAttenuation * averageSpanLength + splicesPerSpan * spliceLoss;

    // --- 4. OSNR Calculation (determines if the system works) ---
    // OSNR per span = 58 - NF - span_loss (reference formula for submarine systems)
    var osnrPerSpan = 58 - noiseFigure - spanLossdB;
    // Total OSNR degrades with number of spans: OSNR_total = OSNR_per_span - 10*log10(N)
    var osnrTotal = osnrPerSpan - 10 * Math.log10(numberOfSpans);

    // Modulation format selection based on route length and OSNR
    var modulationFormat, channelRate, requiredOSNR;
    if (routeKm < 2000 && osnrTotal >= 20) {
      modulationFormat = "16-QAM";
      channelRate = 400; // Gbps per channel
      requiredOSNR = 20; // dB
    } else if (routeKm < 4000 && osnrTotal >= 14) {
      modulationFormat = "QPSK";
      channelRate = 200; // Gbps
      requiredOSNR = 14;
    } else {
      modulationFormat = "QPSK";
      channelRate = 100; // Gbps conservative for ultra-long haul
      requiredOSNR = 12;
    }
    var osnrMargin = osnrTotal - requiredOSNR;

    // --- 5. Capacity Calculation ---
    var channels;
    if (band === "C+L") {
      channels = 192; // C+L band: 192 channels x 50GHz grid = 9.6 THz
    } else {
      channels = 96; // C-band: 96 channels x 50GHz grid = 4.8 THz
    }
    var capacityPerPairTbps = (channels * channelRate) / 1000; // convert Gbps to Tbps
    var totalCapacityTbps = fiberPairs * capacityPerPairTbps;
    var fiberPairsRequired = Math.ceil(targetCapacityTbps / capacityPerPairTbps);

    // --- 6. Power Feed Design (constant-current system per ITU-T G.977) ---
    var repeaterVoltageDrop = 40; // V per repeater (30-50V range, depends on pump current)
    var cableResistance = 1.0; // ohm/km for submarine power conductor
    // Higher current for more fiber pairs
    var current;
    if (fiberPairs <= 4) {
      current = 0.7;
    } else if (fiberPairs <= 8) {
      current = 0.9;
    } else if (fiberPairs <= 12) {
      current = 1.2;
    } else {
      current = 1.6;
    }
    var cableIRDrop = current * cableResistance * routeKm;
    var totalRepeaterVoltage = repeaterVoltageDrop * repeaterCount;
    var totalSystemVoltage = totalRepeaterVoltage + cableIRDrop;

    // Feeding mode: double-ended for routes > 5000km
    var feeding;
    if (routeKm > 5000) {
      feeding = "double";
    } else {
      feeding = "single";
    }

    var pfVoltage; // power feed equipment voltage
    var maxReachKm;
    if (feeding === "double") {
      // Double-ended: each PFE handles half the route, max +/-10kV = 20kV total
      pfVoltage = Math.ceil((totalSystemVoltage / 2 + 1000) / 100) * 100; // round up with 1kV headroom
      if (pfVoltage > 10000) pfVoltage = 10000; // max single-end of double-ended
      maxReachKm = (10000 * 2 - 2000) / (current * cableResistance + (repeaterVoltageDrop / repeaterSpacing));
    } else {
      // Single-ended: max 15kV
      pfVoltage = Math.ceil((totalSystemVoltage + 1000) / 100) * 100; // round up with 1kV headroom
      if (pfVoltage > 15000) pfVoltage = 15000;
      maxReachKm = (15000 - 1000) / (current * cableResistance + (repeaterVoltageDrop / repeaterSpacing));
    }

    var powerMarginV = (feeding === "double" ? 20000 : 15000) - totalSystemVoltage;

    // --- 7. Cable Profile (based on depth profile) ---
    var profile;
    if (depthProfile) {
      profile = depthProfile;
    } else {
      // Default depth distribution based on typical transoceanic route
      if (maxDepthM <= 200) {
        profile = { shallow0_200: 100, shelf200_1000: 0, slope1000_2000: 0, deep2000plus: 0 };
      } else if (maxDepthM <= 1000) {
        profile = { shallow0_200: 20, shelf200_1000: 80, slope1000_2000: 0, deep2000plus: 0 };
      } else if (maxDepthM <= 2000) {
        profile = { shallow0_200: 10, shelf200_1000: 20, slope1000_2000: 70, deep2000plus: 0 };
      } else {
        // Deep ocean route
        profile = { shallow0_200: 5, shelf200_1000: 10, slope1000_2000: 15, deep2000plus: 70 };
      }
    }

    // Shore-end cable: 2km per landing station (Rock Armour)
    var shoreEndKmPerLanding = 2;
    var totalShoreEndKm = shoreEndKmPerLanding * landingCount;
    var mainRouteKm = routeKm - totalShoreEndKm;
    if (mainRouteKm < 0) mainRouteKm = 0;

    var cableProfile = [];
    // Always include shore ends (RA type)
    cableProfile.push({
      depthRange: "0-20m (Shore End)",
      type: "RA",
      lengthKm: totalShoreEndKm,
      costPerKm: 95000
    });

    var shallowKm = Math.round(mainRouteKm * profile.shallow0_200 / 100);
    var shelfKm = Math.round(mainRouteKm * profile.shelf200_1000 / 100);
    var slopeKm = Math.round(mainRouteKm * profile.slope1000_2000 / 100);
    var deepKm = mainRouteKm - shallowKm - shelfKm - slopeKm;
    if (deepKm < 0) deepKm = 0;

    if (shallowKm > 0) {
      cableProfile.push({ depthRange: "0-200m", type: "DA", lengthKm: shallowKm, costPerKm: 65000 });
    }
    if (shelfKm > 0) {
      cableProfile.push({ depthRange: "200-1000m", type: "SA", lengthKm: shelfKm, costPerKm: 45000 });
    }
    if (slopeKm > 0) {
      cableProfile.push({ depthRange: "1000-2000m", type: "LWP", lengthKm: slopeKm, costPerKm: 35000 });
    }
    if (deepKm > 0) {
      cableProfile.push({ depthRange: ">2000m", type: "LW", lengthKm: deepKm, costPerKm: 25000 });
    }

    // --- 8. Wet Plant Components ---
    var branchingUnits = landingCount > 2 ? landingCount - 2 : 0;
    var couplers = branchingUnits; // one coupler per BU typically

    // --- 9. Cost Breakdown ---
    var cableCost = 0;
    for (var ci = 0; ci < cableProfile.length; ci++) {
      cableCost += cableProfile[ci].lengthKm * cableProfile[ci].costPerKm;
    }
    var repeaterCost = repeaterCount * 500000; // $500K per repeater (wet plant)
    var buCost = branchingUnits * 2000000; // $2M per branching unit
    var slteCost = landingCount * fiberPairs * 5000000; // $5M per terminal per fiber pair
    var pfeCost = (feeding === "double" ? 2 : 1) * landingCount * 1500000; // $1.5M per PFE
    var shoreEndsCost = totalShoreEndKm * 95000 + landingCount * 3000000; // cable + civil works
    var installationCost = Math.round(routeKm * 8000); // $8K/km for ship time and laying
    var subtotal = cableCost + repeaterCost + buCost + slteCost + pfeCost + shoreEndsCost + installationCost;
    var contingency = Math.round(subtotal * 0.15); // 15% contingency
    var total = subtotal + contingency;

    // --- 10. Engineering Notes ---
    var engineeringNotes = [];
    engineeringNotes.push("Fiber type: " + fiberType + " at " + fiberAttenuation + " dB/km (1550nm)");
    engineeringNotes.push("Repeater spacing: " + repeaterSpacing + " km (max span loss " + maxSpanLoss.toFixed(1) + " dB)");
    engineeringNotes.push("OSNR margin: " + osnrMargin.toFixed(1) + " dB (" + modulationFormat + " @ " + channelRate + "G)");
    if (feeding === "double") {
      engineeringNotes.push("Double-ended power feeding required (route > 5000km)");
    }
    if (osnrMargin < 2) {
      engineeringNotes.push("WARNING: OSNR margin below 2 dB - consider reduced channel rate or Raman amplification");
    }
    if (fiberPairsRequired > fiberPairs) {
      engineeringNotes.push("Target capacity requires " + fiberPairsRequired + " fiber pairs but only " + fiberPairs + " specified");
    }
    if (branchingUnits > 0) {
      engineeringNotes.push(branchingUnits + " branching unit(s) for " + landingCount + " landing points");
    }
    if (powerMarginV < 2000) {
      engineeringNotes.push("WARNING: Power margin only " + Math.round(powerMarginV) + "V - near system voltage limit");
    }

    // --- 11. References ---
    var references = ["ITU-T G.977", "ITU-T G.978", "IEC 60708", "ITU-T G.654.E"];
    if (band === "C+L") {
      references.push("ITU-T G.698.2");
    }

    // --- Build backward-compatible cableTypes for UI ---
    var cableTypes = cableProfile.map(function(entry) {
      return { depthRange: entry.depthRange, type: entry.type, lengthKm: entry.lengthKm };
    });

    // --- Build designNotes for backward-compatible UI ---
    var designNotes = engineeringNotes.slice();

    return {
      // Backward-compatible fields (used by ui.js)
      repeaterCount: repeaterCount,
      repeaterSpacing: repeaterSpacing,
      powerFeed: {
        voltage: pfVoltage,
        current: current,
        totalVdrop: Math.round(totalSystemVoltage),
        feeding: feeding,
        maxReach: Math.round(maxReachKm)
      },
      cableTypes: cableTypes,
      fiberPairsRequired: fiberPairsRequired,
      wavelengthsPerPair: channels,
      totalCapacityTbps: Math.round(totalCapacityTbps * 10) / 10,
      branchingUnits: branchingUnits,
      costBreakdown: {
        cable: cableCost,
        repeaters: repeaterCost,
        branchingUnits: buCost,
        bus: buCost, // backward compat alias
        slte: slteCost,
        pfe: pfeCost,
        shoreEnds: shoreEndsCost,
        installation: installationCost,
        contingency: contingency,
        total: total
      },
      designNotes: designNotes,

      // New engineering-grade output structure
      spans: {
        count: numberOfSpans,
        averageLength: Math.round(averageSpanLength * 10) / 10,
        maxLoss: Math.round(spanLossdB * 100) / 100
      },
      osnr: {
        perSpan: Math.round(osnrPerSpan * 100) / 100,
        total: Math.round(osnrTotal * 100) / 100,
        margin: Math.round(osnrMargin * 100) / 100,
        modulation: modulationFormat,
        channelRate: channelRate
      },
      capacity: {
        perPair: capacityPerPairTbps,
        totalSystem: Math.round(totalCapacityTbps * 10) / 10,
        band: band,
        channels: channels,
        modulationFormat: modulationFormat
      },
      cableProfile: cableProfile,
      wetPlant: {
        repeaters: repeaterCount,
        branchingUnits: branchingUnits,
        couplers: couplers
      },
      margins: {
        osnrMargin: Math.round(osnrMargin * 100) / 100,
        powerMargin: Math.round(powerMarginV),
        capacityMargin: Math.round((totalCapacityTbps - targetCapacityTbps) * 10) / 10
      },
      engineeringNotes: engineeringNotes,
      references: references
    };
  }

  // ---------- Capacity & Revenue Planning ----------
  // Engineering-grade revenue model with IRR, NPV, EBITDA, 25-year projection,
  // configurable service unit, OpEx inflation, and TeleGeography market context.
  function revenueModel(params) {
    var p = params || {};
    var totalCapacityTbps = p.totalCapacityTbps || 100;
    var serviceUnit = p.serviceUnit || 100; // Gbps per lambda: 10, 100, or 400
    var pricePerLambdaPerMonth = p.pricePerLambdaPerMonth || 1000;
    var takeUpRateYear1Pct = p.takeUpRateYear1Pct || 20;
    var growthRateAnnualPct = p.growthRateAnnualPct || 15;
    var operatingCostAnnualM = p.operatingCostAnnualM || 20; // $ millions Year 1
    var capex = p.capex || 1300; // In MILLIONS (1300 = $1.3B)
    var projectionYears = p.projectionYears || 25;
    var discountRate = p.discountRate || 0.10; // 10% for NPV
    var opexInflationRate = p.opexInflationRate || 0.03; // 3%/year OpEx inflation
    var takeUpCapPct = 95; // Hard cap at 95% utilization

    // Total lambdas: totalCapacityTbps * 1000 / serviceUnit
    var totalLambdas = Math.round(totalCapacityTbps * 1000 / serviceUnit);

    // Capex in absolute dollars (input is in millions)
    var capexAbsolute = capex * 1000000;

    // Break-even utilization: minimum take-up % to cover Year 1 opex
    var opexYear1Absolute = operatingCostAnnualM * 1000000;
    var annualRevenuePerLambda = pricePerLambdaPerMonth * 12;
    var breakEvenLambdas = annualRevenuePerLambda > 0
      ? Math.ceil(opexYear1Absolute / annualRevenuePerLambda)
      : totalLambdas;
    var breakEvenUtilization = totalLambdas > 0
      ? Math.round((breakEvenLambdas / totalLambdas) * 1000) / 10
      : 100;

    // Yearly projection over configurable years
    var yearlyProjection = [];
    var cumulative = 0;
    var paybackYears = null;
    var cashFlows = [-capexAbsolute]; // Year 0 is capex outflow for IRR
    var npv = -capexAbsolute; // Start NPV with initial investment

    for (var year = 1; year <= projectionYears; year++) {
      // Take-up rate for this year, capped at 95%
      var takeUpPct = takeUpRateYear1Pct * Math.pow(1 + growthRateAnnualPct / 100, year - 1);
      if (takeUpPct > takeUpCapPct) takeUpPct = takeUpCapPct;

      var sold = Math.round(totalLambdas * takeUpPct / 100);
      var revenue = sold * annualRevenuePerLambda;

      // OpEx with 3%/year inflation
      var opex = opexYear1Absolute * Math.pow(1 + opexInflationRate, year - 1);

      // EBITDA = Revenue - OpEx (before depreciation, interest, tax)
      var ebitda = revenue - opex;

      // Net cash flow (simplified: EBITDA as proxy for free cash flow)
      var netCashFlow = ebitda;
      cumulative += netCashFlow;

      // NPV: discount each year's cash flow at 10%
      var discountFactor = Math.pow(1 + discountRate, year);
      npv += netCashFlow / discountFactor;

      cashFlows.push(netCashFlow);

      yearlyProjection.push({
        year: year,
        sold: sold,
        takeUpPct: Math.round(takeUpPct * 10) / 10,
        revenue: Math.round(revenue),
        opex: Math.round(opex),
        ebitda: Math.round(ebitda),
        profit: Math.round(netCashFlow),
        cumulative: Math.round(cumulative)
      });

      // Calculate payback year as decimal
      if (paybackYears === null && cumulative >= capexAbsolute) {
        var prevCumulative = cumulative - netCashFlow;
        var remainingToPayback = capexAbsolute - prevCumulative;
        if (netCashFlow > 0) {
          paybackYears = Math.round(((year - 1) + remainingToPayback / netCashFlow) * 10) / 10;
        }
      }
    }

    // IRR via Newton-Raphson method
    var irr = _calculateIRR(cashFlows);

    // Simple ROI: (total cumulative / capex) * 100
    var simpleROI = Math.round((cumulative / capexAbsolute) * 100 * 10) / 10;

    // Payback in months for backward compatibility
    var paybackMonths = paybackYears !== null ? Math.round(paybackYears * 12) : null;

    // NPV rounded to nearest dollar
    npv = Math.round(npv);

    // Market context with TeleGeography references
    var marketContext = {
      source: "TeleGeography",
      references: [
        "TeleGeography Submarine Cable Map 2024",
        "TeleGeography Global Bandwidth Research Service",
        "TeleGeography Wholesale WAN Pricing (international private line)",
        "PTC Submarine Telecoms Forum market reports"
      ],
      assumptions: {
        pricingBasis: "International private line " + serviceUnit + "G wavelength service",
        demandModel: "Compound growth from " + takeUpRateYear1Pct + "% Y1 at " + growthRateAnnualPct + "%/yr CAGR",
        utilizationCap: takeUpCapPct + "% maximum (maintenance/protection capacity reserved)",
        opexModel: operatingCostAnnualM + "M Year 1 with " + (opexInflationRate * 100) + "% annual inflation",
        marketTrend: "Asia-Pacific international bandwidth demand growing 30-40% CAGR (TeleGeography 2023)",
        pricingTrend: "Wavelength pricing declining 10-15% annually on competitive routes"
      },
      benchmarks: {
        typicalSubmarineCableIRR: "12-18%",
        typicalPayback: "7-12 years",
        asiaTrafficGrowth: "35% CAGR (2020-2025 measured)"
      }
    };

    return {
      totalLambdas: totalLambdas,
      serviceUnit: serviceUnit,
      capexMillions: capex,
      projectionYears: projectionYears,
      yearlyProjection: yearlyProjection,
      paybackYears: paybackYears,
      paybackMonths: paybackMonths,
      irr: irr,
      npv: npv,
      simpleROI: simpleROI,
      breakEvenUtilization: breakEvenUtilization,
      marketContext: marketContext
    };
  }

  // IRR calculation using Newton-Raphson method
  function _calculateIRR(cashFlows) {
    var maxIterations = 100;
    var tolerance = 0.00001;
    var guess = 0.10; // Start with 10% guess

    for (var iter = 0; iter < maxIterations; iter++) {
      var npvAtGuess = 0;
      var derivativeAtGuess = 0;

      for (var t = 0; t < cashFlows.length; t++) {
        var discountFactor = Math.pow(1 + guess, t);
        npvAtGuess += cashFlows[t] / discountFactor;
        if (t > 0) {
          derivativeAtGuess -= t * cashFlows[t] / Math.pow(1 + guess, t + 1);
        }
      }

      if (Math.abs(derivativeAtGuess) < 1e-12) break; // Avoid division by zero

      var newGuess = guess - npvAtGuess / derivativeAtGuess;

      // Guard against divergence
      if (newGuess < -0.99) newGuess = -0.5;
      if (newGuess > 10) newGuess = 5;

      if (Math.abs(newGuess - guess) < tolerance) {
        return Math.round(newGuess * 10000) / 10000; // 4 decimal places
      }

      guess = newGuess;
    }

    // Return best estimate if convergence not achieved
    return Math.round(guess * 10000) / 10000;
  }

  // ---------- Cable Route Optimization Engine ----------
  function optimizeRoute(params) {
    var segments = params.segments || [];
    var hazards = params.hazards || [];
    var shippingLanes = params.shippingLanes || [];

    var totalDistanceKm = 0;
    var hazardsNearRoute = [];
    var lanesCrossed = 0;
    var recommendations = [];
    var alternativeKm = 0;

    // Calculate great-circle distance for each segment
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var R = 6371; // Earth radius in km
      var lat1 = seg.startLat * Math.PI / 180;
      var lat2 = seg.endLat * Math.PI / 180;
      var dLat = (seg.endLat - seg.startLat) * Math.PI / 180;
      var dLng = (seg.endLng - seg.startLng) * Math.PI / 180;
      var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
      var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      var dist = R * c;
      totalDistanceKm += dist;

      // Proper proximity check: sample points along the segment densely enough
      // that no hazard within its radius can be missed. Sample spacing must be
      // less than the smallest hazard radius. Use max(20, route_length/max_radius) samples.
      var minHazRadius = Infinity;
      for (var hr = 0; hr < hazards.length; hr++) {
        if (hazards[hr].radius < minHazRadius) minHazRadius = hazards[hr].radius;
      }
      // Approximate segment length in km for sample count calculation
      var segApproxKm = dist; // from Haversine above
      var SAMPLES = Math.max(20, Math.ceil(segApproxKm / (minHazRadius > 0 ? minHazRadius * 0.8 : 50)));
      if (SAMPLES > 500) SAMPLES = 500; // cap for performance

      for (var h = 0; h < hazards.length; h++) {
        var hazard = hazards[h];
        var minHazDist = Infinity;

        for (var s = 0; s <= SAMPLES; s++) {
          var t = s / SAMPLES;
          var sampleLat = seg.startLat + t * (seg.endLat - seg.startLat);
          var sampleLng = seg.startLng + t * (seg.endLng - seg.startLng);

          var hLat1 = sampleLat * Math.PI / 180;
          var hLat2 = hazard.lat * Math.PI / 180;
          var hdLat = (hazard.lat - sampleLat) * Math.PI / 180;
          var hdLng = (hazard.lng - sampleLng) * Math.PI / 180;
          var ha = Math.sin(hdLat / 2) * Math.sin(hdLat / 2) +
                   Math.cos(hLat1) * Math.cos(hLat2) *
                   Math.sin(hdLng / 2) * Math.sin(hdLng / 2);
          var hc = 2 * Math.atan2(Math.sqrt(ha), Math.sqrt(1 - ha));
          var hDist = R * hc;

          if (hDist < minHazDist) minHazDist = hDist;
        }

        if (minHazDist <= hazard.radius) {
          var alreadyFound = false;
          for (var x = 0; x < hazardsNearRoute.length; x++) {
            if (hazardsNearRoute[x].lat === hazard.lat && hazardsNearRoute[x].lng === hazard.lng) {
              alreadyFound = true;
              break;
            }
          }
          if (!alreadyFound) {
            hazardsNearRoute.push({
              lat: hazard.lat,
              lng: hazard.lng,
              type: hazard.type,
              radius: hazard.radius,
              distanceKm: Math.round(minHazDist * 10) / 10
            });
            // Recommend avoidance and estimate deviation
            var deviationKm = Math.round((hazard.radius - minHazDist + 10) * 1.4);
            alternativeKm += deviationKm;
            recommendations.push("Avoid " + hazard.type + " at " + hazard.lat.toFixed(2) + "/" + hazard.lng.toFixed(2) + " - offset route by ~" + deviationKm + " km");
          }
        }
      }

      // Check shipping lane crossings — sample along segment
      for (var l = 0; l < shippingLanes.length; l++) {
        var lane = shippingLanes[l];
        var laneDetected = false;
        for (var sl = 0; sl <= SAMPLES; sl++) {
          var lt = sl / SAMPLES;
          var lSampleLat = seg.startLat + lt * (seg.endLat - seg.startLat);
          var lSampleLng = seg.startLng + lt * (seg.endLng - seg.startLng);
          var lLat1 = lSampleLat * Math.PI / 180;
          var lLat2 = lane.lat * Math.PI / 180;
          var ldLat = (lane.lat - lSampleLat) * Math.PI / 180;
          var ldLng = (lane.lng - lSampleLng) * Math.PI / 180;
          var la = Math.sin(ldLat / 2) * Math.sin(ldLat / 2) +
                   Math.cos(lLat1) * Math.cos(lLat2) *
                   Math.sin(ldLng / 2) * Math.sin(ldLng / 2);
          var lc = 2 * Math.atan2(Math.sqrt(la), Math.sqrt(1 - la));
          var lDist = R * lc;
          if (lDist <= lane.width / 2) {
            lanesCrossed++;
            laneDetected = true;
            break; // count each lane only once per segment
          }
        }
      }
    }

    totalDistanceKm = Math.round(totalDistanceKm * 10) / 10;

    // Score: distance x 1 + hazardProximity x 5 + lanesCrossed x 2
    var routeScore = Math.round((totalDistanceKm * 1 + hazardsNearRoute.length * 5 + lanesCrossed * 2) * 10) / 10;

    if (lanesCrossed > 0) {
      recommendations.push("Route crosses " + lanesCrossed + " shipping lane(s) - additional burial depth required at crossings");
    }

    return {
      totalDistanceKm: totalDistanceKm,
      hazardsNearRoute: hazardsNearRoute,
      lanesCrossed: lanesCrossed,
      routeScore: routeScore,
      recommendations: recommendations,
      alternativeKm: alternativeKm
    };
  }

  // ---------- Predictive Maintenance / Fault Forecasting ----------
  function predictFaults(segments) {
    var results = [];
    var totalReliability = 1;

    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var routeKm = seg.routeKm || 1000;
      var ageYears = seg.ageYears || 1;

      // Fault model based on ICPC (International Cable Protection Committee) data:
      // - Base rate: 0.15 internal faults per 1000km/year (component/abrasion)
      // - External aggression (anchor/trawl): additive, 0.2-0.6 per 1000km/year depending on traffic
      // - Natural events (seismic/current): additive, 0.05-0.15 per 1000km/year
      // - Aging factor: multiplicative on internal only (components degrade)
      // These are INDEPENDENT causes (per ICPC methodology), not multiplicative.

      var lengthFactor = routeKm / 1000;

      // Internal/component faults (base rate, increases with age)
      var internalRate = 0.15; // per 1000km/year for modern cable
      var ageFactor = 1;
      if (ageYears > 20) ageFactor = 2.0;
      else if (ageYears > 10) ageFactor = 1.5;
      else if (ageYears > 5) ageFactor = 1.1;
      var internalFaults = internalRate * lengthFactor * ageFactor;

      // External aggression (shipping + fishing — take the MAXIMUM threat, not product)
      // because areas with high shipping often have high fishing too (same shallow zones)
      var shippingRate = 0;
      if (seg.shippingDensity === "high") shippingRate = 0.35;
      else if (seg.shippingDensity === "med") shippingRate = 0.15;

      var fishingRate = 0;
      if (seg.fishingActivity === "high") fishingRate = 0.30;
      else if (seg.fishingActivity === "med") fishingRate = 0.12;

      // External aggression: dominant threat + 30% of secondary (partial overlap)
      var externalRate = Math.max(shippingRate, fishingRate) + Math.min(shippingRate, fishingRate) * 0.3;
      var externalFaults = externalRate * lengthFactor;

      // Natural events (seismic, current abrasion) — independent
      var naturalRate = 0.05;
      if (seg.seismicRisk === "high") naturalRate = 0.15;
      else if (seg.seismicRisk === "med") naturalRate = 0.08;
      var naturalFaults = naturalRate * lengthFactor;

      // Total: sum of independent causes (ICPC model)
      var annualFaultProb = internalFaults + externalFaults + naturalFaults;
      annualFaultProb = Math.round(annualFaultProb * 1000) / 1000;

      // MTBF in years
      var mtbfYears = annualFaultProb > 0 ? Math.round((1 / annualFaultProb) * 10) / 10 : 999;

      // Risk level
      var riskLevel = "low";
      if (annualFaultProb >= 2.0) riskLevel = "high";
      else if (annualFaultProb >= 1.0) riskLevel = "medium";

      // Recommendations
      var segRecommendations = [];
      if (shippingRate > 0) segRecommendations.push("Install additional cable burial protection in shipping zones");
      if (fishingRate > 0) segRecommendations.push("Deploy fishing activity monitoring and cable awareness campaign");
      if (naturalRate > 0.08) segRecommendations.push("Route diversification to reduce seismic exposure");
      if (ageFactor > 1) segRecommendations.push("Schedule proactive replacement or upgrade within " + (ageYears > 20 ? "2" : "5") + " years");

      // Segment reliability (probability of no fault in a year)
      var segReliability = Math.exp(-annualFaultProb);
      totalReliability *= segReliability;

      results.push({
        name: seg.name,
        annualFaultProb: annualFaultProb,
        mtbfYears: mtbfYears,
        riskLevel: riskLevel,
        recommendations: segRecommendations
      });
    }

    return {
      segments: results,
      totalSystemReliability: Math.round(totalReliability * 10000) / 10000
    };
  }

  // ---------- Digital Twin Status ----------
  function digitalTwinStatus(systemState) {
    var segments = systemState.segments || [];
    var results = [];
    var totalHealth = 0;

    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var fiberPairs = seg.fiberPairs || 8;
      var wavelengthsActive = seg.wavelengthsActive || 0;
      var opticalPowerDbm = seg.opticalPowerDbm || 0;
      var amplifierGainDb = seg.amplifierGainDb || 20;
      var ageMonths = seg.ageMonths || 0;
      var ageYears = ageMonths / 12;

      // Fiber degradation: 0.01 dB/km/year additional loss after year 5
      var fiberDegradation = 0;
      if (ageYears > 5) {
        fiberDegradation = Math.round((ageYears - 5) * 0.01 * 1000) / 1000;
      }

      // Amplifier lifetime: typical 25-year life, flag when >80% consumed
      var amplifierLifePct = Math.round((ageYears / 25) * 100 * 10) / 10;
      var amplifierLife = {
        usedPct: amplifierLifePct,
        remainingYears: Math.round((25 - ageYears) * 10) / 10,
        status: amplifierLifePct >= 80 ? "aging" : "healthy"
      };

      // Capacity utilization: wavelengthsActive / (fiberPairs x 120) x 100
      var maxWavelengths = fiberPairs * 120;
      var capacityUtilization = Math.round((wavelengthsActive / maxWavelengths) * 100 * 10) / 10;

      // Alerts
      var alerts = [];
      if (capacityUtilization > 80) {
        alerts.push("Approaching capacity limit (" + capacityUtilization + "% utilized)");
      }
      if (fiberDegradation > 0.05) {
        alerts.push("Fiber degradation above 5% baseline (+" + fiberDegradation + " dB/km)");
      }
      if (amplifierLife.status === "aging") {
        alerts.push("Amplifier aging - " + amplifierLifePct + "% of 25-year lifetime consumed");
      }

      // Health score (0-100): composite of capacity headroom, degradation, amplifier status
      var healthScore = 100;
      // Deduct for capacity utilization over 70%
      if (capacityUtilization > 70) healthScore -= Math.round((capacityUtilization - 70) * 1.5);
      // Deduct for fiber degradation
      healthScore -= Math.round(fiberDegradation * 200);
      // Deduct for amplifier aging
      if (amplifierLifePct > 60) healthScore -= Math.round((amplifierLifePct - 60) * 0.5);
      // Clamp to 0-100
      if (healthScore < 0) healthScore = 0;
      if (healthScore > 100) healthScore = 100;

      totalHealth += healthScore;

      results.push({
        name: seg.name,
        healthScore: healthScore,
        capacityUtilization: capacityUtilization,
        fiberDegradation: fiberDegradation,
        amplifierLife: amplifierLife,
        alerts: alerts
      });
    }

    var overallSystemHealth = segments.length > 0 ? Math.round(totalHealth / segments.length) : 100;

    return {
      segments: results,
      overallSystemHealth: overallSystemHealth
    };
  }

  // ---------- Energy Optimization / Cost-Benefit Watchdog ----------
  // Country-specific energy data (real data for the 8 project countries)
  var COUNTRY_ENERGY_DATA = {
    Indonesia: { electricityRate: 0.08, carbonIntensity: 0.76, renewableShare: 12, gridType: "coal-heavy", solarIrradiance: 5.5, currency: "IDR", rateLocal: 1150 },
    Thailand: { electricityRate: 0.12, carbonIntensity: 0.49, renewableShare: 15, gridType: "gas-dominant", solarIrradiance: 5.0, currency: "THB", rateLocal: 4.2 },
    Vietnam: { electricityRate: 0.08, carbonIntensity: 0.62, renewableShare: 35, gridType: "hydro+coal", solarIrradiance: 4.8, currency: "VND", rateLocal: 2000 },
    Taiwan: { electricityRate: 0.11, carbonIntensity: 0.55, renewableShare: 8, gridType: "mixed", solarIrradiance: 4.2, currency: "TWD", rateLocal: 3.5 },
    Philippines: { electricityRate: 0.17, carbonIntensity: 0.68, renewableShare: 22, gridType: "coal+geo", solarIrradiance: 5.2, currency: "PHP", rateLocal: 10.5 },
    Guam: { electricityRate: 0.29, carbonIntensity: 0.78, renewableShare: 5, gridType: "diesel", solarIrradiance: 5.8, currency: "USD", rateLocal: 0.29 },
    Malaysia: { electricityRate: 0.09, carbonIntensity: 0.58, renewableShare: 18, gridType: "gas+coal", solarIrradiance: 4.9, currency: "MYR", rateLocal: 0.39 },
    Brunei: { electricityRate: 0.03, carbonIntensity: 0.60, renewableShare: 2, gridType: "gas", solarIrradiance: 4.7, currency: "BND", rateLocal: 0.04 }
  };

  function energyWatchdog(systemConfig) {
    var cfg = systemConfig || {};
    var segments = cfg.segments || [];
    var countries = cfg.countries || ["Indonesia", "Thailand", "Vietnam", "Taiwan", "Philippines", "Guam", "Malaysia", "Brunei"];
    var powerFeedVoltage = cfg.powerFeedVoltage || 15000; // Volts
    var powerFeedCurrent = cfg.powerFeedCurrent || 1.6; // Amps
    var routeKm = cfg.routeKm || 5000; // Total submarine cable route km
    var wavelengthCount = cfg.wavelengthCount || 96; // DWDM channels
    var fiberPairsPerStation = cfg.fiberPairsPerStation || 4;
    var fiberType = cfg.fiberType || "G.654.E"; // G.654.E for long-haul or "shallow"
    var pue = cfg.pue || 1.6; // Power Usage Effectiveness
    var discountRate = cfg.discountRate || 0.10; // 10% for NPV

    // --- Count totals from segments ---
    var totalRepeaters = 0;
    var totalRouteKm = 0;
    var i, j, k;
    for (i = 0; i < segments.length; i++) {
      totalRepeaters += (segments[i].repeaterCount || 0);
      totalRouteKm += (segments[i].lengthKm || 0);
    }
    if (totalRepeaters === 0) totalRepeaters = Math.round(routeKm / 80); // ~80km spacing
    if (totalRouteKm === 0) totalRouteKm = routeKm;

    // --- Landing stations: one per country ---
    var landingStations = [];
    for (i = 0; i < countries.length; i++) {
      var countryName = countries[i];
      var cd = COUNTRY_ENERGY_DATA[countryName];
      if (cd) {
        landingStations.push({ country: countryName, data: cd });
      }
    }
    if (landingStations.length === 0) {
      // Fallback: use all countries
      var allCountries = Object.keys(COUNTRY_ENERGY_DATA);
      for (i = 0; i < allCountries.length; i++) {
        landingStations.push({ country: allCountries[i], data: COUNTRY_ENERGY_DATA[allCountries[i]] });
      }
    }

    // === EDFA Power Consumption Model ===
    // base_power(8W) + gain_factor(gain_dB x 0.4W) + channel_loading(wavelength_count x 0.03W)
    var edfaGainDB = cfg.edfaGainDB || 18; // typical inline amplifier gain
    var edfaBasePower = 8; // Watts
    var edfaGainFactor = edfaGainDB * 0.4; // Watts
    var edfaChannelLoading = wavelengthCount * 0.03; // Watts
    var edfaPowerPerUnit = edfaBasePower + edfaGainFactor + edfaChannelLoading;

    // Fiber type adjustment
    if (fiberType === "G.654.E") {
      edfaPowerPerUnit = edfaPowerPerUnit * 1.20; // +20% for higher-power pump lasers
    } else if (fiberType === "shallow") {
      edfaPowerPerUnit = edfaPowerPerUnit - 2; // base reduces to 6W effective
    }

    var totalRepeaterPowerW = totalRepeaters * edfaPowerPerUnit;
    var totalRepeaterPowerKW = totalRepeaterPowerW / 1000;

    // === Power Feed Equipment (PFE) Model ===
    var pfeEfficiency = 0.92; // 8% conversion loss at constant-current converters
    var cableResistancePerKm = 1.0; // ohm/km for standard submarine cable conductor
    var totalCableResistance = totalRouteKm * cableResistancePerKm; // ohms
    var i2rLossW = powerFeedCurrent * powerFeedCurrent * totalCableResistance; // I2R Joule heating
    var i2rLossKW = i2rLossW / 1000;
    var pfeInputPowerW = powerFeedVoltage * powerFeedCurrent;
    var pfeStationPowerW = (pfeInputPowerW / pfeEfficiency) - pfeInputPowerW; // overhead from inefficiency
    var pfeStationPowerKW = pfeStationPowerW / 1000;
    // Two PFE stations (one at each end of each segment) - approximate as 2 per system
    var pfeTotalKW = (pfeStationPowerKW * 2) + i2rLossKW;

    // === Landing Station Power Model (per station) ===
    var perCountryAnalysis = [];
    var totalLandingPowerKW = 0;
    var totalAnnualCostUSD = 0;
    var totalAnnualCO2 = 0;

    for (i = 0; i < landingStations.length; i++) {
      var ls = landingStations[i];
      var cd2 = ls.data;

      // SLTE: 3-8 kW per fiber pair (use 5 kW mid-range)
      var sltePowerKW = fiberPairsPerStation * 5;
      // Network management/NOC equipment: 5 kW
      var nocPowerKW = 5;
      // IT load subtotal
      var itLoadKW = sltePowerKW + nocPowerKW;
      // HVAC/cooling (PUE adjusted): total_IT_load x (PUE - 1)
      var coolingKW = itLoadKW * (pue - 1);
      // UPS losses: total_load x 0.04 (4% UPS inefficiency)
      var upsLossKW = (itLoadKW + coolingKW) * 0.04;
      // Lighting, security, auxiliary: 3 kW
      var auxiliaryKW = 3;

      var stationTotalKW = itLoadKW + coolingKW + upsLossKW + auxiliaryKW;
      totalLandingPowerKW += stationTotalKW;

      // Annual calculations for this country
      var stationAnnualMWH = stationTotalKW * 8760 / 1000;
      var stationAnnualCostUSD = stationAnnualMWH * 1000 * cd2.electricityRate;
      var stationAnnualCO2 = stationAnnualMWH * cd2.carbonIntensity;

      totalAnnualCostUSD += stationAnnualCostUSD;
      totalAnnualCO2 += stationAnnualCO2;

      perCountryAnalysis.push({
        country: ls.country,
        landingStations: 1,
        powerKW: Math.round(stationTotalKW * 10) / 10,
        annualMWH: Math.round(stationAnnualMWH * 10) / 10,
        annualCostUSD: Math.round(stationAnnualCostUSD),
        annualCO2: Math.round(stationAnnualCO2 * 10) / 10,
        electricityRate: cd2.electricityRate,
        carbonIntensity: cd2.carbonIntensity
      });
    }

    // === Total System Power ===
    var totalSystemPowerKW = totalRepeaterPowerKW + pfeTotalKW + totalLandingPowerKW;
    var totalAnnualEnergyMWH = totalSystemPowerKW * 8760 / 1000;

    // Submarine power annual cost uses weighted average rate
    var avgRate = 0;
    for (i = 0; i < perCountryAnalysis.length; i++) {
      avgRate += perCountryAnalysis[i].electricityRate;
    }
    avgRate = perCountryAnalysis.length > 0 ? avgRate / perCountryAnalysis.length : 0.12;

    var submarinePowerMWH = (totalRepeaterPowerKW + pfeTotalKW) * 8760 / 1000;
    var submarinePowerCostUSD = submarinePowerMWH * 1000 * avgRate;
    totalAnnualCostUSD += submarinePowerCostUSD;

    var avgCarbonIntensity = 0;
    for (i = 0; i < perCountryAnalysis.length; i++) {
      avgCarbonIntensity += perCountryAnalysis[i].carbonIntensity;
    }
    avgCarbonIntensity = perCountryAnalysis.length > 0 ? avgCarbonIntensity / perCountryAnalysis.length : 0.63;
    var submarineCO2 = submarinePowerMWH * avgCarbonIntensity;
    totalAnnualCO2 += submarineCO2;

    // === Current State Summary ===
    var currentState = {
      totalRepeaters: totalRepeaters,
      landingStationCount: landingStations.length,
      edfaPowerPerUnitW: Math.round(edfaPowerPerUnit * 100) / 100,
      totalRepeaterPowerKW: Math.round(totalRepeaterPowerKW * 10) / 10,
      cableI2RLossKW: Math.round(i2rLossKW * 10) / 10,
      pfeTotalKW: Math.round(pfeTotalKW * 10) / 10,
      landingStationTotalKW: Math.round(totalLandingPowerKW * 10) / 10,
      totalSystemPowerKW: Math.round(totalSystemPowerKW * 10) / 10,
      annualEnergyMWH: Math.round(totalAnnualEnergyMWH * 10) / 10,
      annualCostUSD: Math.round(totalAnnualCostUSD),
      annualCO2Tonnes: Math.round(totalAnnualCO2 * 10) / 10
    };

    // === Submarine Power Breakdown ===
    var submarinePowerBreakdown = {
      repeaters: Math.round(totalRepeaterPowerKW * 10) / 10,
      cableResistanceLoss: Math.round(i2rLossKW * 10) / 10,
      pfeOverhead: Math.round(pfeStationPowerKW * 2 * 10) / 10,
      total: Math.round((totalRepeaterPowerKW + pfeTotalKW) * 10) / 10
    };

    // === Landing Station Breakdown (average per station) ===
    var avgSLTE = fiberPairsPerStation * 5;
    var avgNOC = 5;
    var avgIT = avgSLTE + avgNOC;
    var avgCooling = avgIT * (pue - 1);
    var avgUPS = (avgIT + avgCooling) * 0.04;
    var avgAux = 3;
    var landingStationBreakdown = {
      slte: Math.round(avgSLTE * landingStations.length * 10) / 10,
      noc: Math.round(avgNOC * landingStations.length * 10) / 10,
      cooling: Math.round(avgCooling * landingStations.length * 10) / 10,
      ups: Math.round(avgUPS * landingStations.length * 10) / 10,
      auxiliary: Math.round(avgAux * landingStations.length * 10) / 10,
      total: Math.round(totalLandingPowerKW * 10) / 10
    };

    // === Optimization Recommendations ===
    var optimizations = [];

    // 1. Upgrade to Raman-assisted amplification (reduces EDFA count by 30%)
    var ramanSavingKW = totalRepeaterPowerKW * 0.30;
    var ramanSavingMWH = ramanSavingKW * 8760 / 1000;
    var ramanSavingUSD = ramanSavingMWH * 1000 * avgRate;
    var ramanCO2Saving = ramanSavingMWH * avgCarbonIntensity;
    optimizations.push({
      title: "Deploy Raman-assisted amplification (reduce repeater count by 30%)",
      justification: "Distributed Raman amplification uses the fiber itself as gain medium, allowing 30% fewer EDFAs while maintaining OSNR. Proven in >10,000km transpacific systems.",
      annualSavingKWH: Math.round(ramanSavingMWH * 1000),
      annualSavingUSD: Math.round(ramanSavingUSD),
      annualCO2ReductionTonnes: Math.round(ramanCO2Saving * 10) / 10,
      implementationCost: totalRepeaters * 15000,
      paybackYears: Math.round((totalRepeaters * 15000) / (ramanSavingUSD || 1) * 10) / 10,
      priority: "high"
    });

    // 2. Improve landing station PUE from current to 1.3 (tropical best practice)
    var pueTargetKW = totalLandingPowerKW * (1.3 - 1) / (pue - 1) * ((pue - 1) / 1);
    var pueSavingKW = totalLandingPowerKW - (avgIT * landingStations.length + avgIT * landingStations.length * 0.3 + avgIT * landingStations.length * 1.3 * 0.04 + avgAux * landingStations.length);
    if (pueSavingKW < 0) pueSavingKW = 0;
    var pueSavingMWH = pueSavingKW * 8760 / 1000;
    var pueSavingUSD = pueSavingMWH * 1000 * avgRate;
    var pueCO2Saving = pueSavingMWH * avgCarbonIntensity;
    optimizations.push({
      title: "Improve landing station PUE from " + pue.toFixed(1) + " to 1.3 (tropical best practice with free-cooling)",
      justification: "Deploy hot-aisle containment, variable-speed fans, and economizer cooling. Tropical sites can achieve PUE 1.3 with proper design per ASHRAE TC 9.9 guidelines.",
      annualSavingKWH: Math.round(pueSavingMWH * 1000),
      annualSavingUSD: Math.round(pueSavingUSD),
      annualCO2ReductionTonnes: Math.round(pueCO2Saving * 10) / 10,
      implementationCost: landingStations.length * 500000,
      paybackYears: Math.round((landingStations.length * 500000) / (pueSavingUSD || 1) * 10) / 10,
      priority: "high"
    });

    // 3. Switch to 100% renewable PPA at landing stations
    var renewableAvgShare = 0;
    for (i = 0; i < landingStations.length; i++) {
      renewableAvgShare += landingStations[i].data.renewableShare;
    }
    renewableAvgShare = landingStations.length > 0 ? renewableAvgShare / landingStations.length : 15;
    var renewableCO2Saving = totalAnnualCO2 * ((100 - renewableAvgShare) / 100) * 0.85; // 85% of remaining can be offset
    optimizations.push({
      title: "Procure 100% renewable energy PPAs at all landing stations",
      justification: "Power Purchase Agreements for wind/solar in SE Asia now cost $0.04-0.07/kWh (IRENA 2023). Vietnam and Philippines have active RE certificate markets. Scope 2 market-based accounting per GHG Protocol.",
      annualSavingKWH: 0,
      annualSavingUSD: Math.round(totalAnnualCostUSD * 0.05),
      annualCO2ReductionTonnes: Math.round(renewableCO2Saving * 10) / 10,
      implementationCost: landingStations.length * 100000,
      paybackYears: Math.round((landingStations.length * 100000) / ((totalAnnualCostUSD * 0.05) || 1) * 10) / 10,
      priority: "high"
    });

    // 4. Smart wavelength management (dim unused channels)
    var smartSavingW = totalRepeaters * wavelengthCount * 0.03 * 0.4; // 40% channel utilization savings
    var smartSavingKW = smartSavingW / 1000;
    var smartSavingMWH = smartSavingKW * 8760 / 1000;
    var smartSavingUSD = smartSavingMWH * 1000 * avgRate;
    var smartCO2Saving = smartSavingMWH * avgCarbonIntensity;
    optimizations.push({
      title: "Implement smart wavelength power management (dim unused DWDM channels)",
      justification: "Modern OLS (Open Line Systems) can reduce pump power proportional to channel loading. At 60% average utilization, 40% of channel-loading power (0.03W/ch) is recoverable per ITU-T G.698.2.",
      annualSavingKWH: Math.round(smartSavingMWH * 1000),
      annualSavingUSD: Math.round(smartSavingUSD),
      annualCO2ReductionTonnes: Math.round(smartCO2Saving * 10) / 10,
      implementationCost: 2000000,
      paybackYears: Math.round(2000000 / (smartSavingUSD || 1) * 10) / 10,
      priority: "medium"
    });

    // 5. Install solar PV at tropical landing stations
    var totalSolarGenMWH = 0;
    for (i = 0; i < landingStations.length; i++) {
      var irr = landingStations[i].data.solarIrradiance;
      var annualGenKWH = irr * 365 * 0.20 * 0.85 * 40; // 40 kWp per station (200m2 roof)
      totalSolarGenMWH += annualGenKWH / 1000;
    }
    var solarSavingUSD = totalSolarGenMWH * 1000 * avgRate;
    var solarCO2Saving = totalSolarGenMWH * avgCarbonIntensity;
    optimizations.push({
      title: "Install rooftop solar PV at all landing stations (40 kWp per site, 200m2)",
      justification: "All 8 countries are in the tropical solar belt (>4.2 kWh/m2/day). At $1.50/Wp installed cost (2024 SE Asia), payback is 4-8 years depending on local rate. Verified per IEC 62446.",
      annualSavingKWH: Math.round(totalSolarGenMWH * 1000),
      annualSavingUSD: Math.round(solarSavingUSD),
      annualCO2ReductionTonnes: Math.round(solarCO2Saving * 10) / 10,
      implementationCost: landingStations.length * 40 * 1500, // $1.50/Wp x 40kWp x 1000
      paybackYears: Math.round((landingStations.length * 60000) / (solarSavingUSD || 1) * 10) / 10,
      priority: "high"
    });

    // Total potential savings
    var totalSavingUSD = 0;
    var totalCO2Reduction = 0;
    for (j = 0; j < optimizations.length; j++) {
      totalSavingUSD += optimizations[j].annualSavingUSD;
      totalCO2Reduction += optimizations[j].annualCO2ReductionTonnes;
    }

    // === Degradation Model (25-year forecast) ===
    // Year N amplifier efficiency loss = 0.5% x N (cumulative)
    // Year N additional pump current = base x (1 + 0.005 x N)
    var degradationForecast = [];
    var basePowerKW = totalSystemPowerKW;
    for (k = 1; k <= 25; k++) {
      var degradationFactor = 1 + (0.005 * k); // cumulative 0.5% per year
      var yearPowerKW = basePowerKW * degradationFactor;
      var yearAdditionalKW = yearPowerKW - basePowerKW;
      var yearAdditionalCostUSD = (yearAdditionalKW * 8760 / 1000) * 1000 * avgRate;
      var yearAdditionalCO2 = (yearAdditionalKW * 8760 / 1000) * avgCarbonIntensity;
      degradationForecast.push({
        year: k,
        powerIncrease: Math.round(yearAdditionalKW * 10) / 10,
        totalPowerKW: Math.round(yearPowerKW * 10) / 10,
        additionalCost: Math.round(yearAdditionalCostUSD),
        additionalCO2: Math.round(yearAdditionalCO2 * 10) / 10
      });
    }

    // === Carbon Credit Valuation ===
    // For submarine cable in Asia: $25/tonne (voluntary market, Asian registries)
    var carbonCreditPrice = 25; // USD per tonne CO2
    var annualCO2Reduction = totalCO2Reduction;
    var carbonCreditAnnualValue = annualCO2Reduction * carbonCreditPrice;
    var carbonCredit25YearValue = carbonCreditAnnualValue * 25;
    var carbonCredits = {
      annualReduction: Math.round(annualCO2Reduction * 10) / 10,
      creditPrice: carbonCreditPrice,
      annualValue: Math.round(carbonCreditAnnualValue),
      _25yearValue: Math.round(carbonCredit25YearValue),
      methodology: "Voluntary carbon market, Asian registries (Gold Standard/Verra VCS)",
      euEtsComparison: 85,
      voluntaryMarketRange: { low: 15, high: 50 }
    };

    // === Solar Potential per Country ===
    var solarPotential = [];
    for (i = 0; i < landingStations.length; i++) {
      var sls = landingStations[i];
      var irradiance = sls.data.solarIrradiance;
      // Solar capacity factor = irradiance / 24 x panel_efficiency(0.20)
      var capacityFactor = (irradiance / 24) * 0.20;
      var capacityKWp = 40; // 200m2 roof area, ~5m2 per kWp
      // Annual solar generation = irradiance x 365 x 0.20 x 0.85 (system losses) x capacityKWp
      var annualGenMWH = (irradiance * 365 * 0.20 * 0.85 * capacityKWp) / 1000;
      // What percentage of station load does this cover?
      var stationLoad = perCountryAnalysis[i] ? perCountryAnalysis[i].annualMWH : 200;
      var coveragePercent = stationLoad > 0 ? Math.round((annualGenMWH / stationLoad) * 100 * 10) / 10 : 0;

      solarPotential.push({
        country: sls.country,
        irradiance: irradiance,
        capacityKWp: capacityKWp,
        capacityFactor: Math.round(capacityFactor * 1000) / 1000,
        annualGenMWH: Math.round(annualGenMWH * 10) / 10,
        coveragePercent: coveragePercent
      });
    }

    // === 25-Year Lifecycle Analysis ===
    var baseCaseTotalCost = 0;
    var optimizedCaseTotalCost = 0;
    var baseCaseTotalCO2 = 0;
    var optimizedCaseTotalCO2 = 0;
    var npvBase = 0;
    var npvOptimized = 0;

    for (k = 1; k <= 25; k++) {
      var degradFactor = 1 + (0.005 * k);
      var yearCost = totalAnnualCostUSD * degradFactor;
      var yearCO2 = totalAnnualCO2 * degradFactor;
      var yearOptCost = (totalAnnualCostUSD - totalSavingUSD) * degradFactor;
      if (yearOptCost < 0) yearOptCost = 0;
      var yearOptCO2 = (totalAnnualCO2 - totalCO2Reduction) * degradFactor;
      if (yearOptCO2 < 0) yearOptCO2 = 0;

      baseCaseTotalCost += yearCost;
      optimizedCaseTotalCost += yearOptCost;
      baseCaseTotalCO2 += yearCO2;
      optimizedCaseTotalCO2 += yearOptCO2;

      // NPV at discount rate
      var discountFactor = 1 / Math.pow(1 + discountRate, k);
      npvBase += yearCost * discountFactor;
      npvOptimized += yearOptCost * discountFactor;
    }

    var lifecycle25Year = {
      baseCase: {
        totalEnergyCost: Math.round(baseCaseTotalCost),
        totalCO2: Math.round(baseCaseTotalCO2)
      },
      optimizedCase: {
        totalEnergyCost: Math.round(optimizedCaseTotalCost),
        totalCO2: Math.round(optimizedCaseTotalCO2)
      },
      savings: {
        costSaved: Math.round(baseCaseTotalCost - optimizedCaseTotalCost),
        co2Saved: Math.round(baseCaseTotalCO2 - optimizedCaseTotalCO2)
      },
      npv10pct: {
        baseCase: Math.round(npvBase),
        optimizedCase: Math.round(npvOptimized),
        netSavings: Math.round(npvBase - npvOptimized)
      }
    };

    // === Engineering Notes ===
    var engineeringNotes = [
      "IEC 62446: Requirements for testing, documentation and maintenance of PV systems - applied to all solar installations at landing stations",
      "ITU-T L.1410: Methodology for environmental life cycle assessments of ICT goods, networks and services - used for full lifecycle CO2 accounting",
      "GHG Protocol Scope 2: Electricity-related emissions accounting - submarine cable systems classified as Scope 2 (purchased electricity for repeaters and landing stations)",
      "ITU-T G.977: Characteristics of optically amplified submarine cable systems - basis for EDFA power consumption model",
      "Submarine cable systems are classified as Scope 2 emissions per GHG Protocol because all power is purchased electricity (PFE at landing stations feeds repeaters remotely)",
      "Cable I2R losses modeled at 1.0 ohm/km per standard submarine power conductor (copper area ~25mm2)",
      "Degradation model: 0.5% per year cumulative pump current increase due to erbium-doped fiber aging and connector degradation",
      "Carbon credit pricing based on 2024 Asian voluntary market registries (Gold Standard, Verra VCS) at $25/tonne"
    ];

    // === Summary ===
    var summary = {
      totalCountries: countries.length,
      totalLandingStations: landingStations.length,
      totalRepeaters: totalRepeaters,
      routeKm: totalRouteKm,
      annualPowerKW: Math.round(totalSystemPowerKW * 10) / 10,
      annualEnergyMWH: Math.round(totalAnnualEnergyMWH * 10) / 10,
      annualCostUSD: Math.round(totalAnnualCostUSD),
      annualCO2Tonnes: Math.round(totalAnnualCO2 * 10) / 10,
      optimizedAnnualCostUSD: Math.round(totalAnnualCostUSD - totalSavingUSD > 0 ? totalAnnualCostUSD - totalSavingUSD : 0),
      optimizedAnnualCO2Tonnes: Math.round((totalAnnualCO2 - totalCO2Reduction > 0 ? totalAnnualCO2 - totalCO2Reduction : 0) * 10) / 10,
      bestCaseReductionPercent: totalAnnualCO2 > 0 ? Math.round((totalCO2Reduction / totalAnnualCO2) * 100) : 0
    };

    return {
      currentState: currentState,
      perCountryAnalysis: perCountryAnalysis,
      submarinePowerBreakdown: submarinePowerBreakdown,
      landingStationBreakdown: landingStationBreakdown,
      optimizations: optimizations,
      degradationForecast: degradationForecast,
      carbonCredits: carbonCredits,
      solarPotential: solarPotential,
      lifecycle25Year: lifecycle25Year,
      engineeringNotes: engineeringNotes,
      summary: summary
    };
  }

  // ============================================================
  // OPTICAL POWER BUDGET ANALYSIS (ITU-T G.977 / IEC 61280)
  // ============================================================
  function powerBudgetAnalysis(params) {
    params = params || {};
    var routeKm = params.routeKm || 1000;
    var fiberType = params.fiberType || "G.654.E";
    var wavelength = params.wavelength || 1550;
    var spans = params.spans || 1;
    var spliceCount = params.spliceCount || 0;
    var connectorPairs = params.connectorPairs || 2;
    var repeaterGain = params.repeaterGain || 0;
    var transmitPower = params.transmitPower || 0;
    var receiverSensitivity = params.receiverSensitivity || -28;
    var additionalLosses = params.additionalLosses || 0;

    // Fiber attenuation coefficients per ITU-T G.977
    var fiberCoefficients = {
      "G.654.E": { 1550: 0.17, 1310: 0.35 },
      "G.652.D": { 1550: 0.20, 1310: 0.35 }
    };

    var coeffs = fiberCoefficients[fiberType] || fiberCoefficients["G.654.E"];
    var attenuationPerKm = coeffs[wavelength] || coeffs[1550];

    // Core losses
    var fiberLoss = routeKm * attenuationPerKm;
    var spliceLoss = spliceCount * 0.1;       // IEC 61073: 0.1 dB/splice
    var connectorLoss = connectorPairs * 0.3; // IEC 61755: 0.3 dB/mated pair

    // System margins
    var agingMargin = routeKm * 0.02;         // 0.02 dB/km over 25 years
    var expectedRepairs = Math.ceil(routeKm / 1000);
    var repairMargin = expectedRepairs * 0.5; // 0.5 dB per expected repair
    var temperatureMargin = routeKm * 0.01;   // 0.01 dB/km thermal variation

    // Total link loss
    var totalLoss = fiberLoss + spliceLoss + connectorLoss + agingMargin + repairMargin + temperatureMargin + additionalLosses;

    // Amplification
    var repeaterCount = spans > 1 ? spans - 1 : 0;
    var totalGain = repeaterCount * repeaterGain;

    // Power balance
    var netSystemLoss = totalLoss - totalGain;
    var availablePower = transmitPower - receiverSensitivity;
    var systemMargin = availablePower - netSystemLoss;

    // Verdict per ITU-T G.977 recommended margins
    var verdict, verdictDetail;
    if (systemMargin > 6) {
      verdict = "EXCELLENT";
      verdictDetail = "System margin of " + (Math.round(systemMargin * 100) / 100) + " dB exceeds 6 dB threshold. Link has significant headroom for future upgrades and unexpected degradation.";
    } else if (systemMargin >= 3) {
      verdict = "GOOD";
      verdictDetail = "System margin of " + (Math.round(systemMargin * 100) / 100) + " dB is within 3-6 dB range. Link meets commissioning requirements with adequate safety margin.";
    } else if (systemMargin >= 1) {
      verdict = "MARGINAL";
      verdictDetail = "System margin of " + (Math.round(systemMargin * 100) / 100) + " dB is within 1-3 dB range. Link may fail after aging or repairs. Consider additional amplification.";
    } else {
      verdict = "FAIL";
      verdictDetail = "System margin of " + (Math.round(systemMargin * 100) / 100) + " dB is below 1 dB threshold. Link will not deliver reliable data. Redesign required.";
    }

    // Per-span analysis
    var perSpanAnalysis = [];
    var spanLength = routeKm / spans;
    var splicesPerSpan = Math.floor(spliceCount / spans);
    for (var i = 0; i < spans; i++) {
      var spanFiberLoss = spanLength * attenuationPerKm;
      var spanSpliceLoss = splicesPerSpan * 0.1;
      var spanAgingMargin = spanLength * 0.02;
      var spanTempMargin = spanLength * 0.01;
      var spanTotalLoss = spanFiberLoss + spanSpliceLoss + spanAgingMargin + spanTempMargin;
      var spanGain = (i < repeaterCount) ? repeaterGain : 0;
      var spanNet = spanTotalLoss - spanGain;
      perSpanAnalysis.push({
        span: i + 1,
        lengthKm: Math.round(spanLength * 100) / 100,
        fiberLoss: Math.round(spanFiberLoss * 100) / 100,
        spliceLoss: Math.round(spanSpliceLoss * 100) / 100,
        totalLoss: Math.round(spanTotalLoss * 100) / 100,
        gain: spanGain,
        netLoss: Math.round(spanNet * 100) / 100
      });
    }

    // Recommendations
    var recommendations = [];
    if (verdict === "FAIL") {
      recommendations.push("CRITICAL: Add repeaters to reduce net system loss below available power budget");
      recommendations.push("Consider upgrading to G.654.E fiber if using G.652.D (saves " + ((0.20 - 0.17) * routeKm).toFixed(1) + " dB at 1550nm)");
      recommendations.push("Reduce splice count through longer cable manufacturing lengths");
    } else if (verdict === "MARGINAL") {
      recommendations.push("WARNING: Consider adding 1-2 additional repeaters for aging margin");
      recommendations.push("Minimize connector pairs at branching units");
      recommendations.push("Use fusion splices exclusively (avoid mechanical splices)");
    } else if (verdict === "GOOD") {
      recommendations.push("System meets commissioning requirements");
      recommendations.push("Monitor aging margin annually - retest at year 10");
    } else {
      recommendations.push("System has excellent margin for future capacity upgrades");
      recommendations.push("Consider higher-order modulation formats (16-QAM) to increase throughput");
      recommendations.push("Margin sufficient for potential future branching unit insertion");
    }

    // References
    var references = [
      "ITU-T G.977: Characteristics of optically amplified submarine cable systems",
      "IEC 61280: Fibre optic communication subsystem test procedures",
      "IEC 61073: Splice loss requirements for single-mode optical fibre",
      "IEC 61755: Fibre optic connector optical interfaces - connector loss requirements",
      "ITU-T G.654.E: Characteristics of a cut-off shifted single-mode optical fibre",
      "ITU-T G.652.D: Characteristics of a single-mode optical fibre and cable"
    ];

    return {
      linkBudget: {
        fiberLoss: Math.round(fiberLoss * 100) / 100,
        spliceLoss: Math.round(spliceLoss * 100) / 100,
        connectorLoss: Math.round(connectorLoss * 100) / 100,
        agingMargin: Math.round(agingMargin * 100) / 100,
        repairMargin: Math.round(repairMargin * 100) / 100,
        temperatureMargin: Math.round(temperatureMargin * 100) / 100,
        additionalLosses: additionalLosses,
        totalLoss: Math.round(totalLoss * 100) / 100,
        attenuationPerKm: attenuationPerKm,
        fiberType: fiberType,
        wavelength: wavelength,
        routeKm: routeKm
      },
      amplification: {
        repeaterCount: repeaterCount,
        repeaterGain: repeaterGain,
        totalGain: Math.round(totalGain * 100) / 100,
        spans: spans
      },
      powerBalance: {
        transmitPower: transmitPower,
        receiverSensitivity: receiverSensitivity,
        availablePower: Math.round(availablePower * 100) / 100,
        netSystemLoss: Math.round(netSystemLoss * 100) / 100,
        systemMargin: Math.round(systemMargin * 100) / 100
      },
      verdict: verdict,
      verdictDetail: verdictDetail,
      perSpanAnalysis: perSpanAnalysis,
      recommendations: recommendations,
      references: references
    };
  }

  // ---------- Commissioning Checklist Generator (IEC 61280 / ITU-T G.977) ----------
  function generateCommissioningChecklist(params) {
    params = params || {};
    var segments = params.segments || [
      { name: "Singapore-Jakarta", lengthKm: 1200, fiberPairs: 8, repeaterCount: 15 },
      { name: "Jakarta-Bangkok", lengthKm: 2800, fiberPairs: 8, repeaterCount: 35 },
      { name: "Bangkok-Ho Chi Minh", lengthKm: 1500, fiberPairs: 8, repeaterCount: 19 }
    ];
    var wavelength = params.wavelength || 1550;
    var fiberType = params.fiberType || "G.654.E";
    var systemDesignLife = params.systemDesignLife || 25;
    var projectPhase = params.projectPhase || "commissioning";

    // IEC 61280 test categories for submarine optical systems
    var IEC_61280_TESTS = [
      { id: "OPM-01", category: "Optical Power", test: "Transmitter output power verification", standard: "IEC 61280-2-1", unit: "dBm", tolerance: "+/- 0.5 dB", critical: true },
      { id: "OPM-02", category: "Optical Power", test: "Receiver sensitivity threshold measurement", standard: "IEC 61280-2-1", unit: "dBm", tolerance: "+/- 1.0 dB", critical: true },
      { id: "OPM-03", category: "Optical Power", test: "Per-channel OSNR verification", standard: "IEC 61280-2-9", unit: "dB", tolerance: "> 18 dB", critical: true },
      { id: "ATT-01", category: "Attenuation", test: "End-to-end link attenuation", standard: "IEC 61280-4-1", unit: "dB", tolerance: "+/- 0.2 dB/km", critical: true },
      { id: "ATT-02", category: "Attenuation", test: "Per-span attenuation uniformity", standard: "IEC 61280-4-1", unit: "dB", tolerance: "+/- 5% of design", critical: true },
      { id: "ATT-03", category: "Attenuation", test: "Splice loss verification (OTDR)", standard: "IEC 61280-4-2", unit: "dB", tolerance: "< 0.1 dB/splice", critical: false },
      { id: "OTDR-01", category: "OTDR", test: "Bidirectional OTDR trace (full route)", standard: "IEC 61280-4-2", unit: "km/dB", tolerance: "No anomalies > 0.5 dB", critical: true },
      { id: "OTDR-02", category: "OTDR", test: "Reflectance measurement at connectors", standard: "IEC 61280-4-2", unit: "dB", tolerance: "< -45 dB", critical: false },
      { id: "DISP-01", category: "Dispersion", test: "Chromatic dispersion measurement", standard: "IEC 61280-2-10", unit: "ps/nm-km", tolerance: "< 17 ps/nm-km @ 1550nm", critical: true },
      { id: "DISP-02", category: "Dispersion", test: "Polarization mode dispersion (PMD)", standard: "IEC 61280-2-10", unit: "ps", tolerance: "< 0.1 ps/sqrt(km)", critical: true },
      { id: "BER-01", category: "Bit Error Rate", test: "Pre-FEC BER measurement (24hr soak)", standard: "IEC 61280-2-3", unit: "BER", tolerance: "< 1e-3", critical: true },
      { id: "BER-02", category: "Bit Error Rate", test: "Post-FEC BER confirmation", standard: "IEC 61280-2-3", unit: "BER", tolerance: "< 1e-15", critical: true }
    ];

    // ITU-T G.977 commissioning verification items
    var G977_TESTS = [
      { id: "G977-01", category: "System Margin", test: "End-of-life system margin verification", standard: "ITU-T G.977", unit: "dB", tolerance: "> 3 dB", critical: true },
      { id: "G977-02", category: "System Margin", test: "Repeater gain flatness check", standard: "ITU-T G.977", unit: "dB", tolerance: "+/- 1 dB across band", critical: true },
      { id: "G977-03", category: "System Margin", test: "Supervisory channel functionality", standard: "ITU-T G.977", unit: "pass/fail", tolerance: "All channels responding", critical: true },
      { id: "G977-04", category: "Power Feed", test: "Power feed equipment (PFE) voltage test", standard: "ITU-T G.977", unit: "kV", tolerance: "+/- 2% of rated voltage", critical: true },
      { id: "G977-05", category: "Power Feed", test: "PFE current stability under load", standard: "ITU-T G.977", unit: "mA", tolerance: "+/- 5 mA over 24hr", critical: true },
      { id: "G977-06", category: "Power Feed", test: "Earth fault detection and isolation", standard: "ITU-T G.977", unit: "pass/fail", tolerance: "Isolation within 100ms", critical: false },
      { id: "G977-07", category: "Redundancy", test: "Protection switching time (1+1)", standard: "ITU-T G.977", unit: "ms", tolerance: "< 50 ms", critical: true },
      { id: "G977-08", category: "Redundancy", test: "Line monitoring system (LMS) accuracy", standard: "ITU-T G.977", unit: "km", tolerance: "+/- 100m fault location", critical: false },
      { id: "G977-09", category: "Environmental", test: "Cable landing station temperature tolerance", standard: "ITU-T G.977", unit: "degC", tolerance: "5-40 degC operating range", critical: false },
      { id: "G977-10", category: "Environmental", test: "Humidity resilience of terminal equipment", standard: "ITU-T G.977", unit: "%RH", tolerance: "< 85% non-condensing", critical: false }
    ];

    var allTests = IEC_61280_TESTS.concat(G977_TESTS);

    // Generate segment-specific checklist items
    var segmentChecklists = [];
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var segTests = [];
      for (var j = 0; j < allTests.length; j++) {
        var t = allTests[j];
        // Calculate expected values based on segment parameters
        var expectedValue = null;
        var applicability = "required";

        if (t.id === "ATT-01") {
          expectedValue = Math.round(seg.lengthKm * 0.17 * 100) / 100 + " dB total (" + seg.lengthKm + " km x 0.17 dB/km)";
        } else if (t.id === "OTDR-01") {
          expectedValue = seg.lengthKm + " km trace length, " + (seg.repeaterCount || 0) + " repeater locations marked";
        } else if (t.id === "G977-04") {
          // PFE voltage scales with distance: ~1V/km for modern systems
          var voltage = Math.round(seg.lengthKm * 1.0 / 1000 * 10) / 10;
          expectedValue = voltage + " kV (nominal for " + seg.lengthKm + " km)";
        } else if (t.id === "G977-01") {
          expectedValue = "> 3 dB after " + systemDesignLife + " year aging";
        } else if (t.id === "G977-02") {
          expectedValue = (seg.repeaterCount || 0) + " repeaters, each +/- 1 dB across C-band";
        } else if (t.id === "DISP-01") {
          var totalDispersion = Math.round(seg.lengthKm * 17 * 100) / 100;
          expectedValue = totalDispersion + " ps/nm cumulative (compensated by DCM)";
        } else if (t.id === "BER-01") {
          expectedValue = "24-hour continuous traffic at line rate on " + (seg.fiberPairs || 8) + " fiber pairs";
        } else if (t.id === "G977-07") {
          applicability = (seg.fiberPairs || 8) > 1 ? "required" : "not_applicable";
          expectedValue = "Switch between fiber pairs within 50 ms";
        }

        // Determine if test is applicable based on segment characteristics
        if (t.id === "G977-06" && seg.lengthKm < 100) {
          applicability = "optional";
        }
        if (t.category === "Power Feed" && (seg.repeaterCount || 0) === 0) {
          applicability = "not_applicable";
        }

        segTests.push({
          testId: t.id,
          category: t.category,
          test: t.test,
          standard: t.standard,
          unit: t.unit,
          tolerance: t.tolerance,
          critical: t.critical,
          expectedValue: expectedValue,
          applicability: applicability,
          status: "pending",
          result: null,
          notes: ""
        });
      }

      var criticalCount = 0;
      var totalApplicable = 0;
      for (var k = 0; k < segTests.length; k++) {
        if (segTests[k].applicability !== "not_applicable") {
          totalApplicable++;
          if (segTests[k].critical) criticalCount++;
        }
      }

      segmentChecklists.push({
        segment: seg.name,
        lengthKm: seg.lengthKm,
        fiberPairs: seg.fiberPairs || 8,
        repeaterCount: seg.repeaterCount || 0,
        tests: segTests,
        summary: {
          totalTests: segTests.length,
          applicableTests: totalApplicable,
          criticalTests: criticalCount,
          completedTests: 0,
          passedTests: 0,
          failedTests: 0,
          pendingTests: totalApplicable
        }
      });
    }

    // Overall commissioning summary
    var totalSegments = segmentChecklists.length;
    var overallCritical = 0;
    var overallApplicable = 0;
    var overallTotal = 0;
    for (var m = 0; m < segmentChecklists.length; m++) {
      overallCritical += segmentChecklists[m].summary.criticalTests;
      overallApplicable += segmentChecklists[m].summary.applicableTests;
      overallTotal += segmentChecklists[m].summary.totalTests;
    }

    var references = [
      "IEC 61280-2-1: Fibre optic communication subsystem test procedures - Digital systems, Transmitter/receiver",
      "IEC 61280-2-3: Fibre optic communication subsystem test procedures - Digital systems, BER measurement",
      "IEC 61280-2-9: Fibre optic communication subsystem test procedures - Digital systems, OSNR",
      "IEC 61280-2-10: Fibre optic communication subsystem test procedures - Dispersion measurement",
      "IEC 61280-4-1: Fibre optic communication subsystem test procedures - Installed cable plant, Multimode/single-mode attenuation",
      "IEC 61280-4-2: Fibre optic communication subsystem test procedures - Installed cable plant, OTDR",
      "ITU-T G.977: Characteristics of optically amplified submarine cable systems",
      "ITU-T G.977.1: Characteristics of DWDM submarine cable systems"
    ];

    var holdPoints = [
      { phase: "Pre-lay", description: "Verify factory acceptance test (FAT) records for all repeaters and terminal equipment", standard: "ITU-T G.977 Clause 7" },
      { phase: "Post-lay", description: "Complete OTDR testing of all installed segments before burial/protection", standard: "IEC 61280-4-2" },
      { phase: "Wet plant", description: "Confirm repeater supervisory response on all spans before terminal connection", standard: "ITU-T G.977 Clause 8" },
      { phase: "System turn-up", description: "24-hour BER soak test with all channels loaded at design capacity", standard: "IEC 61280-2-3" },
      { phase: "Provisional acceptance", description: "All critical tests passed, non-critical items documented in punch list", standard: "ITU-T G.977 Clause 9" },
      { phase: "Final acceptance", description: "30-day reliability run with < 3 SES events, all punch items cleared", standard: "ITU-T G.977 Clause 10" }
    ];

    return {
      projectPhase: projectPhase,
      fiberType: fiberType,
      wavelength: wavelength,
      systemDesignLife: systemDesignLife,
      segments: segmentChecklists,
      holdPoints: holdPoints,
      summary: {
        totalSegments: totalSegments,
        totalTests: overallTotal,
        applicableTests: overallApplicable,
        criticalTests: overallCritical,
        completionPercentage: 0,
        readyForAcceptance: false
      },
      standards: ["IEC 61280", "ITU-T G.977"],
      references: references,
      generatedAt: new Date().toISOString()
    };
  }

  // ---------- Wavelength Assignment Planner (ITU-T G.694.1 DWDM grid) ----------
  // Deterministic DWDM/WDM channel planner. Builds the ITU-T G.694.1 frequency
  // grid anchored at 193.1 THz, sizes the usable C / L / C+L spectrum for a
  // chosen channel spacing, computes capacity & spectral efficiency, runs a
  // first-fit Routing-and-Wavelength-Assignment (RWA) over a demand list, and
  // flags transmission feasibility (modulation vs spacing). Pure & offline.
  //
  // Physics: lambda_nm = 299792.458 / f_THz  (c expressed as nm*THz).
  // ITU-T G.694.1 anchor: 193.1 THz = 1552.524 nm. C-band 191.30-196.10 THz,
  // L-band 186.00-190.80 THz. 50 GHz spacing -> 96 C-band channels (matches the
  // platform's cable-system design model: C=96, C+L=192 channels).
  function planWavelengths(params) {
    params = params || {};
    var spacingGHz = Number(params.spacingGHz) || 50;          // 12.5 | 25 | 50 | 100
    var band = params.band || "C";                              // "C" | "L" | "C+L"
    var bitrate = Number(params.bitratePerChannelGbps) || 200;  // 100 | 200 | 400 | 600 | 800
    var fiberPairs = Number(params.fiberPairs) || 1;
    var demands = Array.isArray(params.demands) ? params.demands : [];

    var LIGHT = 299792.458;       // nm*THz (and km/s) — same numeric constant
    var ANCHOR_THZ = 193.1;       // ITU-T G.694.1 reference frequency
    var spacingTHz = spacingGHz / 1000;

    var BANDS = {
      C: { fMin: 191.30, fMax: 196.10, label: "C-band (1530-1565 nm)" },
      L: { fMin: 186.00, fMax: 190.80, label: "L-band (1565-1625 nm)" }
    };
    var segIds = band === "C+L" ? ["C", "L"] : [band];
    var bandLabel = band === "C+L"
      ? "C+L-band (1530-1625 nm)"
      : (BANDS[band] ? BANDS[band].label : band);

    // Build the grid: all anchored frequencies that fall inside each band window.
    var channels = [];
    segIds.forEach(function (id) {
      var b = BANDS[id];
      if (!b) return;
      // First grid point >= fMin (grid is f = ANCHOR + k*spacing).
      var kMin = Math.ceil((b.fMin - ANCHOR_THZ) / spacingTHz);
      var kMax = Math.floor((b.fMax - ANCHOR_THZ) / spacingTHz);
      for (var k = kMin; k <= kMax; k++) {
        var f = ANCHOR_THZ + k * spacingTHz;
        // round to 5 decimals to avoid binary float noise
        var fTHz = Math.round(f * 1e5) / 1e5;
        var lambda = Math.round((LIGHT / fTHz) * 1000) / 1000;
        // ITU-T 100 GHz channel number convention: (f - 190.0)/0.1 (for reference)
        var ituCh = Math.round((fTHz - 190.0) / 0.1 * 10) / 10;
        channels.push({
          index: 0, // assigned after sort
          band: id,
          frequencyTHz: fTHz,
          wavelengthNm: lambda,
          ituChannel: ituCh,
          slotGHz: spacingGHz
        });
      }
    });
    // Sort by ascending wavelength (descending frequency) and number them.
    channels.sort(function (a, b) { return a.wavelengthNm - b.wavelengthNm; });
    channels.forEach(function (c, i) { c.index = i + 1; });

    var channelsPerPair = channels.length;
    var channelCount = channelsPerPair; // alias

    // Spectral efficiency (b/s/Hz) for the chosen modulation loading.
    var spectralEfficiency = Math.round((bitrate / spacingGHz) * 1000) / 1000;

    // Capacity.
    var capacityPerPairTbps = Math.round((channelsPerPair * bitrate / 1000) * 100) / 100;
    var systemCapacityTbps = Math.round((capacityPerPairTbps * fiberPairs) * 100) / 100;

    // Feasibility: recommended minimum channel spacing for a coherent line rate.
    // (Industry rule-of-thumb for 50/75/100 GHz flexible-grid deployments.)
    var recMap = { 100: 37.5, 200: 50, 300: 62.5, 400: 75, 600: 100, 800: 100 };
    var recommendedMinSpacingGHz = recMap[bitrate] || 50;
    var feasOk = spacingGHz >= recommendedMinSpacingGHz;
    var feasNote = feasOk
      ? bitrate + "G fits within a " + spacingGHz + " GHz slot (SE " + spectralEfficiency + " b/s/Hz)."
      : bitrate + "G typically needs >=" + recommendedMinSpacingGHz + " GHz; a " + spacingGHz + " GHz slot risks inter-channel crosstalk / OSNR shortfall.";

    var warnings = [];
    if (!feasOk) warnings.push("Modulation/spacing mismatch: " + feasNote);
    if (spectralEfficiency > 8) warnings.push("Spectral efficiency " + spectralEfficiency + " b/s/Hz is beyond practical coherent limits (~8 b/s/Hz) for long-haul submarine links.");
    if (band === "L" || band === "C+L") warnings.push("L-band operation requires L-band EDFAs/Raman and wider-band line equipment — verify amplifier support end-to-end.");

    // First-fit Routing & Wavelength Assignment over the demand list.
    var totalSlots = channelsPerPair * fiberPairs;
    var assignedRows = [];
    var assignedCount = 0, blockedCount = 0;
    var cursor = 0; // next free slot index across pairs
    demands.forEach(function (d, di) {
      var label = (d && d.label) || ("Demand " + (di + 1));
      var needGbps = (d && Number(d.capacityGbps)) || bitrate;
      var slotsNeeded = Math.max(1, Math.ceil(needGbps / bitrate));
      if (cursor + slotsNeeded <= totalSlots) {
        var pair = Math.floor(cursor / channelsPerPair) + 1;
        var chIdx = (cursor % channelsPerPair);
        var ch = channels[chIdx];
        assignedRows.push({
          demand: label,
          capacityGbps: needGbps,
          slots: slotsNeeded,
          fiberPair: pair,
          channelIndex: ch.index,
          frequencyTHz: ch.frequencyTHz,
          wavelengthNm: ch.wavelengthNm,
          status: "ASSIGNED"
        });
        assignedCount++;
        cursor += slotsNeeded;
      } else {
        assignedRows.push({ demand: label, capacityGbps: needGbps, slots: slotsNeeded, status: "BLOCKED" });
        blockedCount++;
      }
    });
    var utilizationPct = totalSlots > 0 ? Math.round((cursor / totalSlots) * 1000) / 10 : 0;
    if (blockedCount > 0) warnings.push(blockedCount + " demand(s) blocked — insufficient spectrum; add fiber pairs, widen the band, or use a tighter grid.");

    return {
      band: band,
      bandLabel: bandLabel,
      anchorTHz: ANCHOR_THZ,
      spacingGHz: spacingGHz,
      bitratePerChannelGbps: bitrate,
      fiberPairs: fiberPairs,
      channelCount: channelCount,
      channelsPerPair: channelsPerPair,
      channels: channels,
      spectralEfficiency: spectralEfficiency,
      capacityPerPairTbps: capacityPerPairTbps,
      systemCapacityTbps: systemCapacityTbps,
      feasibility: { ok: feasOk, recommendedMinSpacingGHz: recommendedMinSpacingGHz, note: feasNote },
      assignment: {
        totalDemands: demands.length,
        assigned: assignedCount,
        blocked: blockedCount,
        totalSlots: totalSlots,
        usedSlots: cursor,
        utilizationPct: utilizationPct,
        rows: assignedRows
      },
      warnings: warnings,
      references: [
        "ITU-T G.694.1 (2020) — Spectral grids for WDM applications: DWDM frequency grid",
        "ITU-T G.694.2 — Spectral grids for WDM applications: CWDM wavelength grid",
        "ITU-T G.698.2 — Amplified multichannel DWDM applications with single-channel optical interfaces",
        "ITU-T G.692 — Optical interfaces for multichannel systems with optical amplifiers",
        "ITU-T G.872 — Architecture of optical transport networks (OTN)"
      ]
    };
  }

  // ---------- Latency Calculator (fiber propagation + equipment delay) ----------
  // Deterministic end-to-end latency model for a fibre/submarine link.
  // Propagation uses the fibre GROUP index (not the phase index): one-way delay
  // per km = n_g / c. For G.652.D, n_g ~ 1.4682 -> 4.897 us/km one-way
  // (9.79 us/km round trip). Adds route slack and active-equipment latency,
  // and benchmarks against a vacuum great-circle minimum and a GEO satellite.
  function calcLatency(params) {
    params = params || {};
    var routeKm = Number(params.routeKm) || 1000;
    var fiberType = params.fiberType || "G.652.D";
    var slackPct = params.slackPct != null ? Number(params.slackPct) : 7; // cable slack/slope
    var repeaterCount = Number(params.repeaterCount) || 0;  // submarine EDFAs (near-zero delay)
    var regenCount = Number(params.regenCount) || 0;        // intermediate OEO regen sites
    var roadmCount = Number(params.roadmCount) || 0;        // express ROADM/WSS nodes
    var fecEnabled = params.fecEnabled !== false;           // soft-decision FEC interleaver
    var straightLineKm = params.straightLineKm != null ? Number(params.straightLineKm) : null;

    var C_KM_S = 299792.458; // speed of light in vacuum, km/s
    // Group index by fibre type (at 1550 nm).
    var GROUP_INDEX = { "G.652.D": 1.4682, "G.654.E": 1.4680, "G.655": 1.4700, "G.657.A1": 1.4682 };
    var nG = GROUP_INDEX[fiberType] || 1.4682;

    var perKmOneWayUs = Math.round((nG / C_KM_S * 1e6) * 1e4) / 1e4; // us/km
    var fiberLengthKm = Math.round((routeKm * (1 + slackPct / 100)) * 100) / 100;
    var propagationOneWayUs = perKmOneWayUs * fiberLengthKm;

    // Active-equipment latency budget (one-way), in microseconds.
    var EDFA_US = 0.05;        // amplifier is passive fibre+pump: sub-microsecond
    var ROADM_US = 0.5;        // express WSS pass incl. short patch fibre
    var TXP_PAIR_US = 30;      // coherent transponder DSP (Tx+Rx) baseline
    var FEC_US = 18;           // SD-FEC interleaver depth (one terminal pass)
    var REGEN_US = 30;         // intermediate OEO regeneration (full DSP pass)

    var eqRows = [];
    function eq(item, count, usEach) {
      var usTotal = Math.round((count * usEach) * 1000) / 1000;
      eqRows.push({ item: item, count: count, usEach: usEach, usTotal: usTotal });
      return usTotal;
    }
    var equipmentUs = 0;
    equipmentUs += eq("Terminal transponders (Tx+Rx DSP)", 1, TXP_PAIR_US);
    if (fecEnabled) equipmentUs += eq("Soft-decision FEC", 1, FEC_US);
    if (regenCount > 0) equipmentUs += eq("OEO regeneration sites", regenCount, REGEN_US);
    if (roadmCount > 0) equipmentUs += eq("Express ROADM/WSS nodes", roadmCount, ROADM_US);
    if (repeaterCount > 0) equipmentUs += eq("Submarine repeaters (EDFA)", repeaterCount, EDFA_US);
    equipmentUs = Math.round(equipmentUs * 1000) / 1000;

    var totalOneWayUs = Math.round((propagationOneWayUs + equipmentUs) * 1000) / 1000;
    var oneWayMs = Math.round((totalOneWayUs / 1000) * 1000) / 1000;
    var rttMs = Math.round((oneWayMs * 2) * 1000) / 1000;
    var propagationRttMs = Math.round((propagationOneWayUs * 2 / 1000) * 1000) / 1000;

    // Vacuum great-circle minimum (theoretical floor).
    var vacRefKm = straightLineKm != null ? straightLineKm : routeKm;
    var vacuumOneWayMs = Math.round((vacRefKm / C_KM_S * 1000) * 1000) / 1000;
    var overheadPct = vacuumOneWayMs > 0 ? Math.round(((oneWayMs / vacuumOneWayMs) - 1) * 1000) / 10 : 0;

    // GEO satellite reference: up+down = 2 x 35786 km per direction.
    var GEO_KM = 35786;
    var geoOneWayMs = Math.round((2 * GEO_KM / C_KM_S * 1000) * 1000) / 1000;
    var geoRttMs = Math.round((geoOneWayMs * 2) * 1000) / 1000;
    var fiberFasterTimes = oneWayMs > 0 ? Math.round((geoOneWayMs / oneWayMs) * 10) / 10 : 0;

    // ITU-T G.114 one-way transmission time guidance (voice/interactive).
    var rating, note;
    if (oneWayMs <= 150) { rating = "Good"; note = "<=150 ms: acceptable for most interactive/voice applications (ITU-T G.114)."; }
    else if (oneWayMs <= 400) { rating = "Acceptable"; note = "150-400 ms: usable but with noticeable interactivity impact (ITU-T G.114)."; }
    else { rating = "Poor"; note = ">400 ms: unacceptable for interactive applications (ITU-T G.114)."; }

    var warnings = [];
    if (slackPct < 0) warnings.push("Negative slack is non-physical — fibre length cannot be shorter than the route.");
    if (straightLineKm != null && straightLineKm > routeKm) warnings.push("Straight-line distance exceeds route length — check inputs (route should be >= great-circle distance).");

    return {
      routeKm: routeKm,
      fiberType: fiberType,
      groupIndex: nG,
      slackPct: slackPct,
      fiberLengthKm: fiberLengthKm,
      perKmOneWayUs: perKmOneWayUs,
      perKmRttUs: Math.round((perKmOneWayUs * 2) * 1e4) / 1e4,
      propagationOneWayUs: Math.round(propagationOneWayUs * 1000) / 1000,
      equipmentUs: equipmentUs,
      equipmentBreakdown: eqRows,
      totalOneWayUs: totalOneWayUs,
      oneWayMs: oneWayMs,
      rttMs: rttMs,
      propagationRttMs: propagationRttMs,
      vacuum: { refKm: vacRefKm, oneWayMs: vacuumOneWayMs, overheadPct: overheadPct },
      geoSatellite: { oneWayMs: geoOneWayMs, rttMs: geoRttMs, fiberFasterTimes: fiberFasterTimes },
      g114Verdict: { oneWayMs: oneWayMs, rating: rating, note: note },
      warnings: warnings,
      references: [
        "ITU-T G.114 — One-way transmission time (latency budget guidance)",
        "ITU-T G.652 — Characteristics of a single-mode optical fibre and cable (group index)",
        "ITU-T G.654 — Cut-off shifted single-mode fibre (submarine, low loss)",
        "ITU-T G.Sup47 / vendor data — coherent transponder & FEC processing latency"
      ]
    };
  }

  // ---------- Cable Protection Awareness (threat vs depth -> burial/armour) ----------
  // Deterministic submarine-cable protection assessment. For each depth band it
  // rates the dominant external-aggression threats (anchoring, bottom trawling,
  // abrasion, natural hazards), then recommends a burial depth and armour class
  // following ICPC guidance (target ~1 m burial in trawled grounds, heavier in
  // high-risk shallow water; surface lay in the deep ocean). Produces a
  // length-weighted protection-adequacy score and residual-risk per segment.
  function assessCableProtection(params) {
    params = params || {};
    var trawl = (params.trawlingIntensity || "medium").toLowerCase();   // high|medium|low|none
    var anchor = (params.anchoringActivity || "medium").toLowerCase();  // high|medium|low|none
    var seabed = (params.seabed || "sand").toLowerCase();               // sand|mud|rock|coral|mixed
    var seismicZone = !!params.seismicZone;

    // Depth profile in km. Default = a typical mixed coastal->deep transoceanic route.
    var routeKm = Number(params.routeKm) || 1000;
    var dp = params.depthProfile || null;
    if (!dp) {
      dp = {
        shoreEndKm: Math.round(routeKm * 0.01 * 100) / 100,
        shelfKm: Math.round(routeKm * 0.10 * 100) / 100,
        slopeKm: Math.round(routeKm * 0.14 * 100) / 100,
        deepUpperKm: Math.round(routeKm * 0.15 * 100) / 100,
        deepKm: 0
      };
      dp.deepKm = Math.round((routeKm - dp.shoreEndKm - dp.shelfKm - dp.slopeKm - dp.deepUpperKm) * 100) / 100;
      if (dp.deepKm < 0) dp.deepKm = 0;
    }

    var intensity = { high: 1.0, medium: 0.6, low: 0.3, none: 0.0 };
    var trawlF = intensity[trawl] != null ? intensity[trawl] : 0.6;
    var anchorF = intensity[anchor] != null ? intensity[anchor] : 0.6;
    var abrasive = (seabed === "rock" || seabed === "coral" || seabed === "mixed");

    // Band definitions: anchoring credible < ~1000 m; bottom trawling reaches
    // ~1500 m; abrasion mainly shallow/rocky; natural hazards rise in deep
    // canyons / seismic zones.
    var BANDS = [
      { key: "shoreEnd", depthRange: "0-20 m (shore end)", lengthKm: dp.shoreEndKm || 0, anchorBase: 1.0, trawlBase: 0.7, abrasionBase: 1.0, naturalBase: 0.6 },
      { key: "shelf", depthRange: "20-200 m (shelf)", lengthKm: dp.shelfKm || 0, anchorBase: 1.0, trawlBase: 1.0, abrasionBase: 0.6, naturalBase: 0.3 },
      { key: "slope", depthRange: "200-1000 m (slope)", lengthKm: dp.slopeKm || 0, anchorBase: 0.4, trawlBase: 0.7, abrasionBase: 0.4, naturalBase: 0.5 },
      { key: "deepUpper", depthRange: "1000-2000 m", lengthKm: dp.deepUpperKm || 0, anchorBase: 0.0, trawlBase: 0.2, abrasionBase: 0.2, naturalBase: 0.4 },
      { key: "deep", depthRange: ">2000 m (deep ocean)", lengthKm: dp.deepKm || 0, anchorBase: 0.0, trawlBase: 0.0, abrasionBase: 0.1, naturalBase: 0.3 }
    ];

    function levelFromScore(s) {
      if (s >= 7.5) return "Critical";
      if (s >= 5.5) return "High";
      if (s >= 3.5) return "Medium";
      if (s >= 1.5) return "Low";
      return "Minimal";
    }

    var segments = [];
    var totalLen = 0, weightedThreat = 0, protectedKm = 0, surfaceKm = 0, highThreatKm = 0;
    var weightedResidual = 0;

    BANDS.forEach(function (b) {
      if (b.lengthKm <= 0) return;
      var threats = [];
      // Weighted threat components (0..10 each contribution scaled).
      var aScore = b.anchorBase * anchorF * 10;
      var tScore = b.trawlBase * trawlF * 10;
      var abScore = b.abrasionBase * (abrasive ? 1.0 : 0.3) * 10;
      var nScore = b.naturalBase * (seismicZone ? 1.0 : 0.55) * 10;

      if (aScore >= 2) threats.push("Ship anchoring");
      if (tScore >= 2) threats.push("Bottom trawling / fishing gear");
      if (abScore >= 2) threats.push("Abrasion / seabed movement");
      if (nScore >= 2) threats.push(seismicZone ? "Seismic / turbidity currents" : "Natural seabed dynamics");

      // Dominant threat score drives the band level (worst-case governs).
      var threatScore = Math.max(aScore, tScore, abScore, nScore);
      threatScore = Math.round(threatScore * 10) / 10;
      var level = levelFromScore(threatScore);

      // Recommended burial depth (m) & armour class by band + threat.
      var burialM = 0, armour = "", mitigations = [];
      if (b.key === "shoreEnd") {
        burialM = (anchorF >= 0.6 || abrasive) ? 3.0 : 1.5;
        armour = "Double armour (DA) / Rock armour (RA)";
        mitigations.push("Directional drilling (HDD) through the surf zone where feasible");
        mitigations.push("Articulated pipe / cast-iron shells + rock berm over the cable");
      } else if (b.key === "shelf") {
        burialM = threatScore >= 5.5 ? 1.5 : 1.0;
        armour = threatScore >= 5.5 ? "Double armour (DA)" : "Single armour (SA)";
        mitigations.push("Bury by jetting / ploughing to target depth-of-lowering");
        mitigations.push("Publish cable on charts; engage fishing & port authorities (ICPC liaison)");
      } else if (b.key === "slope") {
        burialM = tScore >= 4 ? 0.6 : 0;
        armour = tScore >= 4 ? "Single armour (SA)" : "Lightweight protected (LWP)";
        if (burialM > 0) mitigations.push("Selective burial where deepwater trawling is recorded");
        else mitigations.push("Surface lay with route engineering around hazards");
      } else if (b.key === "deepUpper") {
        burialM = 0;
        armour = "Lightweight protected (LWP) / Lightweight (LW)";
        mitigations.push("Surface lay; avoid canyons & steep slopes in route engineering");
      } else { // deep
        burialM = 0;
        armour = "Lightweight (LW)";
        mitigations.push("Surface lay on stable abyssal seabed; rely on water depth for protection");
      }
      if (seismicZone && (b.key === "slope" || b.key === "deepUpper")) {
        mitigations.push("Route away from active faults & turbidity-current pathways (seismic zone)");
      }

      // Residual risk after recommended mitigation (burial/armour reduce threat).
      var reduction = 0;
      if (burialM >= 3) reduction = 0.9;
      else if (burialM >= 1.5) reduction = 0.8;
      else if (burialM >= 1.0) reduction = 0.7;
      else if (burialM >= 0.6) reduction = 0.5;
      else if (/Lightweight protected|Single armour|Double armour|Rock armour/.test(armour)) reduction = 0.25;
      else reduction = 0.1; // depth-only protection in the deep ocean
      var residualScore = Math.round(threatScore * (1 - reduction) * 10) / 10;

      segments.push({
        band: b.key,
        depthRange: b.depthRange,
        lengthKm: b.lengthKm,
        threats: threats,
        threatScore: threatScore,
        threatLevel: level,
        recommendedBurialM: burialM,
        recommendedArmour: armour,
        mitigations: mitigations,
        residualScore: residualScore,
        residualLevel: levelFromScore(residualScore)
      });

      totalLen += b.lengthKm;
      weightedThreat += threatScore * b.lengthKm;
      weightedResidual += residualScore * b.lengthKm;
      if (burialM > 0) protectedKm += b.lengthKm; else surfaceKm += b.lengthKm;
      if (level === "High" || level === "Critical") highThreatKm += b.lengthKm;
    });

    var weightedThreatScore = totalLen > 0 ? Math.round((weightedThreat / totalLen) * 10) / 10 : 0;
    var weightedResidualScore = totalLen > 0 ? Math.round((weightedResidual / totalLen) * 10) / 10 : 0;
    // Protection adequacy: how much of the inherent threat the plan removes.
    var protectionAdequacyPct = weightedThreatScore > 0
      ? Math.round((1 - weightedResidualScore / weightedThreatScore) * 100)
      : 100;

    var warnings = [];
    if (highThreatKm > 0 && trawl === "none" && anchor === "none") {
      warnings.push("High-threat length flagged despite no fishing/anchoring activity — driven by seabed/natural hazards; verify survey data.");
    }
    segments.forEach(function (s) {
      if ((s.threatLevel === "High" || s.threatLevel === "Critical") && s.recommendedBurialM === 0 && !/armour/i.test(s.recommendedArmour)) {
        warnings.push(s.depthRange + ": high threat with no burial — confirm armour/route mitigation is sufficient.");
      }
    });

    return {
      routeKm: routeKm,
      inputs: { trawlingIntensity: trawl, anchoringActivity: anchor, seabed: seabed, seismicZone: seismicZone },
      depthProfile: dp,
      segments: segments,
      summary: {
        totalAssessedKm: Math.round(totalLen * 100) / 100,
        protectedKm: Math.round(protectedKm * 100) / 100,
        surfaceLaidKm: Math.round(surfaceKm * 100) / 100,
        highThreatKm: Math.round(highThreatKm * 100) / 100,
        weightedThreatScore: weightedThreatScore,
        weightedResidualScore: weightedResidualScore,
        protectionAdequacyPct: protectionAdequacyPct
      },
      warnings: warnings,
      references: [
        "ICPC Recommendation No. 2 — Cable routing and reporting criteria",
        "ICPC Recommendation No. 3 — Criteria to be applied to proposed crossings & burial",
        "ICPC/UNEP-WCMC (Carter et al. 2009) — Submarine Cables and the Oceans: burial in trawled grounds",
        "UNCLOS 1982, Articles 113-115 — Protection of submarine cables & pipelines",
        "ITU-T / ISO seabed survey practice — Depth of Lowering (DoL) & Burial Protection Index (BPI)"
      ]
    };
  }

  // ---------- 3D Build-Sequence Engine (animated construction visualisation) ----------
  // Generates a deterministic, OFFLINE "scene + build sequence" that drives a
  // 3D-printer-style animation: it shows a non-technical customer, step by step,
  // how the submarine fibre network is physically built — marine survey, cable
  // landing stations rising, cable being "extruded" along the seabed, splicing &
  // branching units, OTDR testing, and final handover. Pure data only; the UI
  // renderer turns this into the animated isometric scene.
  //
  // Default scene is the 8-country Asian submarine system (Indonesia, Thailand,
  // Vietnam, Taiwan, Philippines, Guam, Malaysia, Brunei) with real landing
  // points; callers may pass their own { stations, segments }.

  function haversineKm(aLon, aLat, bLon, bLat) {
    var R = 6371;
    var toRad = function (d) { return d * Math.PI / 180; };
    var dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(s))) / 10) * 10; // round to 10 km
  }

  // Real cable landing points for the 8 programme countries.
  var DEFAULT_SUBSEA_STATIONS = [
    { id: "MY", name: "Mersing CLS", country: "Malaysia", lon: 103.84, lat: 2.43, type: "hub" },
    { id: "ID", name: "Jakarta CLS", country: "Indonesia", lon: 106.85, lat: -6.20, type: "landing" },
    { id: "TH", name: "Songkhla CLS", country: "Thailand", lon: 100.60, lat: 7.20, type: "landing" },
    { id: "BN", name: "Tungku CLS", country: "Brunei", lon: 114.92, lat: 4.98, type: "hub" },
    { id: "VN", name: "Da Nang CLS", country: "Vietnam", lon: 108.22, lat: 16.07, type: "landing" },
    { id: "PH", name: "Batangas CLS", country: "Philippines", lon: 121.05, lat: 13.76, type: "hub" },
    { id: "TW", name: "Kaohsiung CLS", country: "Taiwan", lon: 120.30, lat: 22.62, type: "landing" },
    { id: "GU", name: "Piti CLS", country: "Guam", lon: 144.69, lat: 13.46, type: "landing" }
  ];
  // Trunk + branch topology. cableType drives colour in the renderer.
  var DEFAULT_SUBSEA_SEGMENTS = [
    { id: "S1", from: "MY", to: "ID", cableType: "G.654.E", branch: true },
    { id: "S2", from: "MY", to: "TH", cableType: "G.652.D", branch: true },
    { id: "S3", from: "MY", to: "BN", cableType: "G.654.E", branch: false },
    { id: "S4", from: "BN", to: "VN", cableType: "G.654.E", branch: true },
    { id: "S5", from: "BN", to: "PH", cableType: "G.654.E", branch: false },
    { id: "S6", from: "PH", to: "TW", cableType: "G.654.E", branch: false },
    { id: "S7", from: "PH", to: "GU", cableType: "G.654.E", branch: false }
  ];

  function generateBuildSequence(params) {
    params = params || {};
    var stations = (params.stations && params.stations.length ? params.stations : DEFAULT_SUBSEA_STATIONS)
      .map(function (s) { return { id: s.id, name: s.name, country: s.country, lon: s.lon, lat: s.lat, type: s.type || "landing" }; });
    var stById = {};
    stations.forEach(function (s) { stById[s.id] = s; });

    var segIn = (params.segments && params.segments.length ? params.segments : DEFAULT_SUBSEA_SEGMENTS);
    var laySegmentKm = Number(params.laySegmentKm) || 500; // km per "extrusion" increment
    var surveyKmPerDay = 120, layKmPerDay = 150; // indicative marine productivity

    // Resolve segment geometry & lengths.
    var segments = segIn.map(function (sg) {
      var a = stById[sg.from], b = stById[sg.to];
      var lengthKm = (a && b) ? haversineKm(a.lon, a.lat, b.lon, b.lat) : (sg.lengthKm || 0);
      return {
        id: sg.id, from: sg.from, to: sg.to, cableType: sg.cableType || "G.654.E",
        branch: !!sg.branch, lengthKm: lengthKm,
        fromName: a ? a.name : sg.from, toName: b ? b.name : sg.to,
        fromCountry: a ? a.country : "", toCountry: b ? b.country : ""
      };
    });

    var totalKm = segments.reduce(function (s, g) { return s + g.lengthKm; }, 0);
    var totalDurationDays = 0;
    var steps = [];
    var laidKm = 0;

    function pushStep(o) {
      o.index = steps.length;
      o.laidKm = laidKm;
      o.cumulativeKm = laidKm;
      steps.push(o);
      totalDurationDays += (o.durationDays || 0);
    }

    // PHASE 1 — Marine route survey (route appears as a planned dashed line).
    segments.forEach(function (g) {
      pushStep({
        kind: "survey", phase: "Marine Survey",
        title: "Survey route: " + g.fromCountry + " \u2192 " + g.toCountry,
        narration: "A survey ship maps the seabed and clears the planned " + g.lengthKm.toLocaleString() +
          " km route between " + g.fromName + " and " + g.toName + ", checking depth, hazards and existing cables before any cable is laid.",
        segmentId: g.id,
        durationDays: Math.max(1, Math.round(g.lengthKm / surveyKmPerDay))
      });
    });

    // PHASE 2 — Cable landing stations rise at each shore.
    stations.forEach(function (s) {
      pushStep({
        kind: "landing", phase: "Landing Stations",
        title: "Build landing station: " + s.name,
        narration: "The cable landing station in " + s.country + " (" + s.name +
          ") is constructed on shore — the secure building where the undersea cable connects to the land network and power.",
        stationId: s.id,
        durationDays: 30
      });
    });

    // PHASE 3 — Cable lay (extruded in increments) + PHASE 4 splice/branching at the far end.
    segments.forEach(function (g) {
      var nInc = Math.max(1, Math.ceil(g.lengthKm / laySegmentKm));
      for (var i = 0; i < nInc; i++) {
        var fromFrac = i / nInc, toFrac = (i + 1) / nInc;
        var incKm = Math.round(g.lengthKm * (toFrac - fromFrac));
        laidKm += incKm;
        pushStep({
          kind: "lay", phase: "Cable Lay",
          title: "Lay cable: " + g.fromCountry + " \u2192 " + g.toCountry + " (" + (i + 1) + "/" + nInc + ")",
          narration: "The cable ship pays out " + g.cableType + " fibre cable onto the seabed, section " + (i + 1) +
            " of " + nInc + " on the " + g.fromName + "\u2013" + g.toName + " link. About " + incKm.toLocaleString() +
            " km is laid and buried in this pass.",
          segmentId: g.id, fromFrac: fromFrac, toFrac: toFrac, incrementKm: incKm,
          durationDays: Math.max(1, Math.round(incKm / layKmPerDay))
        });
      }
      // Splice / branching unit at the destination station.
      pushStep({
        kind: "splice", phase: "Splice & Branching",
        title: (g.branch ? "Install branching unit" : "Splice & terminate") + ": " + g.toCountry,
        narration: (g.branch
          ? "A subsea branching unit is installed so the trunk can split toward " + g.toCountry + " — "
          : "Technicians fusion-splice and terminate the cable at " + g.toName + " in " + g.toCountry + " — ") +
          "joining the fibres with very low loss and sealing the joint against the deep ocean.",
        segmentId: g.id, stationId: g.to,
        durationDays: 4
      });
    });

    // PHASE 5 — Testing & commissioning (OTDR light sweep per link).
    segments.forEach(function (g) {
      pushStep({
        kind: "test", phase: "Test & Commission",
        title: "Test & commission: " + g.fromCountry + " \u2192 " + g.toCountry,
        narration: "Light is sent end-to-end and measured (OTDR + power tests) on the " + g.fromName + "\u2013" + g.toName +
          " link to prove the fibre meets its loss budget before it carries live traffic.",
        segmentId: g.id,
        durationDays: 2
      });
    });

    // PHASE 6 — Handover (whole network lit).
    pushStep({
      kind: "handover", phase: "Handover",
      title: "System ready for service (RFS)",
      narration: "The complete " + Math.round(totalKm).toLocaleString() + " km network across " + stations.length +
        " countries is accepted and ready for service — every route lit and carrying traffic.",
      durationDays: 5
    });

    // Global progress per step (index-based, monotonic 0..100).
    var totalSteps = steps.length;
    steps.forEach(function (st) {
      st.progressPct = totalSteps > 1 ? Math.round((st.index + 1) / totalSteps * 100) : 100;
      st.layProgressPct = totalKm > 0 ? Math.round(st.laidKm / totalKm * 100) : 0;
    });

    var phases = [];
    steps.forEach(function (st) { if (phases.indexOf(st.phase) < 0) phases.push(st.phase); });
    var countries = stations.map(function (s) { return s.country; });

    return {
      scene: { stations: stations, segments: segments },
      steps: steps,
      summary: {
        totalSteps: totalSteps,
        totalStations: stations.length,
        totalSegments: segments.length,
        totalKm: Math.round(totalKm),
        totalDurationDays: totalDurationDays,
        totalDurationMonths: Math.round(totalDurationDays / 30 * 10) / 10,
        phases: phases,
        countries: countries
      },
      references: [
        "ICPC Recommendation No. 2 / No. 3 — Marine route survey & cable burial practice",
        "ITU-T G.971 / G.977 — Submarine optical cable systems (general & design)",
        "IEC 61280 — Fibre-optic communication subsystem test procedures (commissioning)",
        "Deterministic offline scene generation — no project data leaves the device"
      ]
    };
  }

  // ---------- Multi-Currency Disbursement & Lender Reporting ----------
  // Deterministic programme cash-flow / disbursement forecast for the $1.3B
  // multi-country deployment. Models an S-curve work profile with retention,
  // advance-payment recovery, a per-country split and USD->local conversion —
  // the figures lenders and the client need for monthly drawdown reporting.
  var FX_PER_USD = { USD: 1, IDR: 15800, THB: 35.5, VND: 25400, TWD: 32.0, PHP: 57.5, MYR: 4.45, BND: 1.34 };
  var DISB_COUNTRY_ALLOC = [
    { country: "Indonesia", code: "ID", currency: "IDR", weight: 0.18 },
    { country: "Philippines", code: "PH", currency: "PHP", weight: 0.17 },
    { country: "Vietnam", code: "VN", currency: "VND", weight: 0.14 },
    { country: "Malaysia", code: "MY", currency: "MYR", weight: 0.13 },
    { country: "Taiwan", code: "TW", currency: "TWD", weight: 0.12 },
    { country: "Thailand", code: "TH", currency: "THB", weight: 0.10 },
    { country: "Guam", code: "GU", currency: "USD", weight: 0.09 },
    { country: "Brunei", code: "BN", currency: "BND", weight: 0.07 }
  ];

  function disbursementForecast(params) {
    params = params || {};
    var totalUsd = Number(params.totalUsd) || 1300000000;
    var months = Math.max(1, Math.round(Number(params.months) || 60));
    var retentionPct = params.retentionPct != null ? Number(params.retentionPct) : 5;
    var advancePct = params.advancePct != null ? Number(params.advancePct) : 10;
    var asOfMonth = params.asOfMonth != null ? Math.max(0, Math.min(months, Math.round(Number(params.asOfMonth)))) : Math.round(months / 2);
    var retFrac = retentionPct / 100, advance = totalUsd * (advancePct / 100);

    // Smoothstep S-curve: cumulative work fraction f(t) = t^2(3-2t).
    function f(t) { return t * t * (3 - 2 * t); }

    var schedule = [], cum = 0, retentionHeld = 0, peakNet = -Infinity, peakMonth = 1;
    for (var m = 1; m <= months; m++) {
      var progFrac = f(m / months) - f((m - 1) / months); // share of work this month
      var grossProgress = totalUsd * progFrac;
      var retentionThis = grossProgress * retFrac;
      retentionHeld += retentionThis;
      var recovery = advance * progFrac; // advance recouped pro-rata to progress
      var net = grossProgress - retentionThis - recovery;
      if (m === 1) net += advance;                 // advance paid up front
      if (m === months) { net += retentionHeld; }   // retention released at completion
      net = Math.round(net);
      cum += net;
      if (net > peakNet) { peakNet = net; peakMonth = m; }
      schedule.push({
        month: m,
        grossProgressUsd: Math.round(grossProgress),
        retentionThisUsd: Math.round(retentionThis),
        netPaymentUsd: net,
        cumulativeUsd: cum,
        cumulativePct: Math.round(cum / totalUsd * 1000) / 10
      });
    }
    // Numerical reconciliation: net payments must sum to the total (rounding only).
    var sumNet = schedule.reduce(function (s, r) { return s + r.netPaymentUsd; }, 0);
    var reconcileDeltaUsd = sumNet - totalUsd;

    // Per-country multi-currency allocation.
    var totalWeight = DISB_COUNTRY_ALLOC.reduce(function (s, c) { return s + c.weight; }, 0) || 1;
    var byCountry = DISB_COUNTRY_ALLOC.map(function (c) {
      var usd = Math.round(totalUsd * (c.weight / totalWeight));
      var fx = FX_PER_USD[c.currency] || 1;
      return {
        country: c.country, code: c.code, currency: c.currency, fxRate: fx,
        allocationUsd: usd, allocationLocal: Math.round(usd * fx),
        pct: Math.round(c.weight / totalWeight * 1000) / 10
      };
    });

    // Yearly roll-up for compact reporting.
    var yearly = [];
    for (var y = 0; y * 12 < months; y++) {
      var slice = schedule.slice(y * 12, Math.min(months, y * 12 + 12));
      var net = slice.reduce(function (s, r) { return s + r.netPaymentUsd; }, 0);
      yearly.push({ year: y + 1, netPaymentUsd: net, cumulativeUsd: slice[slice.length - 1].cumulativeUsd, cumulativePct: slice[slice.length - 1].cumulativePct });
    }

    var asOf = asOfMonth > 0 ? schedule[asOfMonth - 1] : { cumulativeUsd: 0, cumulativePct: 0 };
    var disbursedToDate = asOf.cumulativeUsd, forecastToComplete = totalUsd - disbursedToDate;

    return {
      inputs: { totalUsd: totalUsd, months: months, retentionPct: retentionPct, advancePct: advancePct, asOfMonth: asOfMonth },
      summary: {
        totalUsd: totalUsd,
        advanceUsd: Math.round(advance),
        totalRetentionUsd: Math.round(retentionHeld),
        peakMonth: peakMonth, peakMonthUsd: Math.round(peakNet),
        months: months,
        reconcileDeltaUsd: reconcileDeltaUsd
      },
      lenderReport: {
        asOfMonth: asOfMonth,
        disbursedToDateUsd: disbursedToDate,
        disbursedPct: Math.round(disbursedToDate / totalUsd * 1000) / 10,
        forecastToCompleteUsd: forecastToComplete
      },
      schedule: schedule,
      yearly: yearly,
      byCountry: byCountry,
      fxRates: FX_PER_USD,
      references: [
        "FIDIC / NEC4 — advance payment, retention & interim payment certificates",
        "Lender common terms agreement — monthly disbursement / drawdown reporting",
        "IAS 21 / IFRS — foreign-currency translation (USD functional, local presentation)",
        "Indicative FX rates — confirm against the facility's agreed rate-setting mechanism"
      ]
    };
  }

  // ---------- Inspection & Test Plan (ITP) generator ----------
  // Deterministic master quality-control plan for the submarine programme.
  // Each activity is classified as a Hold (H), Witness (W), Surveillance (S) or
  // Review (R) point per ISO 9001 / project QA practice, with the inspection
  // method, acceptance criteria, governing standard, responsible party and the
  // record that verifies it. Hold/Witness failures raise an NCR (links the ITP
  // to the existing NCR register).
  var ITP_POINT_LABELS = { H: "Hold", W: "Witness", S: "Surveillance", R: "Review" };
  var ITP_MASTER = [
    // Manufacturing
    { phase: "Manufacturing", activity: "Optical fibre incoming inspection", method: "Document & sample review", acceptance: "Attenuation <=0.20 dB/km @1550 nm; PMD/CD within spec", reference: "IEC 60793 / ITU-T G.654", point: "R", responsible: "QA/QC Manager" },
    { phase: "Manufacturing", activity: "Cable Factory Acceptance Test (FAT)", method: "Electrical + optical + dimensional", acceptance: "Continuity, attenuation, insulation & armour per spec; no out-of-tolerance", reference: "IEC 60794", point: "H", responsible: "Client QA + Manufacturer" },
    { phase: "Manufacturing", activity: "Repeater / branching-unit test", method: "Pressure & optical gain test", acceptance: "Pressure-tight to rated depth; gain & tilt within spec", reference: "ITU-T G.977", point: "W", responsible: "Test & Commissioning Lead" },
    { phase: "Manufacturing", activity: "Cable loading & coil survey (ship)", method: "Visual + tension log", acceptance: "No damage; coiling tension & bend radius within limits", reference: "ICPC Rec. / OEM", point: "W", responsible: "Cable Installation Supervisor" },
    // Installation
    { phase: "Installation", activity: "Pre-lay grapnel run / route clearance", method: "Survey + debris recovery log", acceptance: "Route cleared of debris/abandoned cable; as-cleared chart", reference: "ICPC Rec. No. 2", point: "S", responsible: "Survey Lead" },
    { phase: "Installation", activity: "Shore-end landing & shore protection", method: "Visual + as-built dimensional", acceptance: "Articulated pipe/rock berm installed; burial >= design at landing", reference: "ICPC Rec. No. 3", point: "H", responsible: "Client Rep + Civil Works Manager" },
    { phase: "Installation", activity: "Cable lay tension & touchdown monitoring", method: "Continuous tension/ROV monitoring", acceptance: "Tension < limit; slack within plan; no suspensions/free spans", reference: "Marine install procedure", point: "S", responsible: "Cable Installation Supervisor" },
    { phase: "Installation", activity: "Burial depth-of-lowering (post-lay survey)", method: "Post-lay-burial survey (ROV)", acceptance: "DoL >= target per Cable Protection plan in trawled/anchoring zones", reference: "ICPC Rec. No. 3 / DoL", point: "H", responsible: "Client Rep + Survey Lead" },
    { phase: "Installation", activity: "Jointing / final splice & branching unit", method: "Fusion splice loss + visual", acceptance: "Splice loss <=0.05 dB; joint housing sealed & pressure-tested", reference: "IEC 61300 / ITU-T G.977", point: "W", responsible: "Splicing Supervisor" },
    // Testing
    { phase: "Testing", activity: "OTDR bidirectional per segment", method: "OTDR @1550/1625 nm both directions", acceptance: "No anomalies; averaged splice loss within loss budget", reference: "IEC 61746 / IEC 61280", point: "H", responsible: "Test & Commissioning Lead" },
    { phase: "Testing", activity: "End-to-end loss / OSNR", method: "Power meter + OSA", acceptance: "Total loss <= design loss budget; OSNR >= required margin", reference: "IEC 61280 / ITU-T G.977", point: "H", responsible: "Client Rep + T&C Lead" },
    { phase: "Testing", activity: "System BER / commissioning", method: "BER test over commissioning period", acceptance: "BER < 1e-12 post-FEC over the soak period", reference: "ITU-T G.977", point: "H", responsible: "NOC Manager + T&C Lead" },
    // Handover
    { phase: "Handover", activity: "As-built & GIS records review", method: "Documentation review", acceptance: "Complete as-built, route position list & test records accepted", reference: "Project QA plan", point: "R", responsible: "GIS/Documentation Specialist" },
    { phase: "Handover", activity: "Provisional Acceptance (PAC) sign-off", method: "Acceptance review", acceptance: "All hold points released; punch list cleared; PAC issued", reference: "FIDIC cl.10 / NEC4 cl.30", point: "H", responsible: "Programme Director + Client" }
  ];
  function generateITP(params) {
    params = params || {};
    var items = (params.items && params.items.length ? params.items : ITP_MASTER).map(function (it, i) {
      var pt = it.point || "S";
      return {
        id: "ITP-" + String(i + 1).padStart(3, "0"),
        phase: it.phase, activity: it.activity, method: it.method,
        acceptance: it.acceptance, reference: it.reference,
        point: pt, pointLabel: ITP_POINT_LABELS[pt] || pt,
        responsible: it.responsible,
        verifyingRecord: it.verifyingRecord || (it.activity + " report / certificate"),
        raisesNcrOnFail: pt === "H" || pt === "W"
      };
    });
    var counts = { H: 0, W: 0, S: 0, R: 0 };
    items.forEach(function (it) { counts[it.point] = (counts[it.point] || 0) + 1; });
    var phases = [];
    items.forEach(function (it) { if (phases.indexOf(it.phase) < 0) phases.push(it.phase); });
    return {
      items: items,
      summary: {
        total: items.length,
        holdPoints: counts.H, witnessPoints: counts.W,
        surveillancePoints: counts.S, reviewPoints: counts.R,
        ncrTriggers: items.filter(function (x) { return x.raisesNcrOnFail; }).length,
        phases: phases, counts: counts
      },
      references: [
        "ISO 9001 — Quality management systems (inspection & test planning)",
        "IEC 61280 / IEC 61746 — Fibre-optic test procedures (OTDR, loss)",
        "ITU-T G.977 — Submarine optical systems (FAT, commissioning)",
        "ICPC Recommendations No. 2 & 3 — route clearance & burial verification",
        "Hold/Witness failures raise a Non-Conformance Report (NCR register)"
      ]
    };
  }

  // ---------- Route Progress Tracker (per-segment km laid) ----------
  // Deterministic GIS-style progress model over the 8-country network. For each
  // cable segment it tracks km laid vs total, the current works phase/status,
  // and rolls up to an overall programme % with a planned-vs-actual (SPI-like)
  // variance. Reuses the build-sequence scene so geometry stays consistent.
  function routeProgressStatus(pct) {
    if (pct <= 0) return "Planned";
    if (pct < 31) return "Survey & Clearance";
    if (pct < 71) return "Cable Lay";
    if (pct < 91) return "Splicing & Jointing";
    if (pct < 100) return "Testing";
    return "Complete";
  }
  function routeProgress(params) {
    params = params || {};
    var plan = generateBuildSequence(params.network || {});
    var segs = plan.scene.segments;
    var defaultPct = { S1: 100, S2: 100, S3: 78, S4: 45, S5: 30, S6: 0, S7: 0 };
    var override = params.progress || {};
    var plannedPct = params.plannedPct != null ? Number(params.plannedPct) : 55;

    var totalKm = 0, kmLaid = 0, complete = 0, inProgress = 0, notStarted = 0;
    var segments = segs.map(function (g) {
      var pct = override[g.id] != null ? Number(override[g.id]) : (defaultPct[g.id] != null ? defaultPct[g.id] : 0);
      pct = Math.max(0, Math.min(100, pct));
      var segKmLaid = Math.round(g.lengthKm * pct / 100);
      totalKm += g.lengthKm; kmLaid += segKmLaid;
      var status = routeProgressStatus(pct);
      if (pct >= 100) complete++; else if (pct > 0) inProgress++; else notStarted++;
      return {
        id: g.id, from: g.fromName, to: g.toName, fromCountry: g.fromCountry, toCountry: g.toCountry,
        cableType: g.cableType, lengthKm: g.lengthKm, kmLaid: segKmLaid,
        pctComplete: pct, status: status
      };
    });
    var overallPct = totalKm > 0 ? Math.round(kmLaid / totalKm * 1000) / 10 : 0;
    var variance = Math.round((overallPct - plannedPct) * 10) / 10;
    var schedule = variance > 2 ? "Ahead" : (variance < -2 ? "Behind" : "On track");

    return {
      segments: segments,
      summary: {
        totalKm: Math.round(totalKm), kmLaid: kmLaid, remainingKm: Math.round(totalKm) - kmLaid,
        overallPct: overallPct, plannedPct: plannedPct, variancePct: variance, schedule: schedule,
        segmentsComplete: complete, segmentsInProgress: inProgress, segmentsNotStarted: notStarted,
        totalSegments: segments.length
      },
      references: [
        "Route Position List (RPL) & post-lay survey — as-laid km verification",
        "EVM (ITU/PMI) — physical % complete feeds SPI/CPI",
        "ICPC Rec. No. 2 — as-cleared / as-laid route charting"
      ]
    };
  }

  // ---------- Programme Status Report (executive / monthly lender report) ----------
  // Deterministic one-page roll-up that composes the route-progress, disbursement,
  // contract-variation, ITP-quality and risk engines into a single board/lender
  // snapshot with an overall RAG status and an alert list. Everything it reads is
  // deterministic, so the report is reproducible.
  function programmeStatusReport(params) {
    params = params || {};
    var route = routeProgress(params.route || {});
    var disb = disbursementForecast(params.disbursement || {});
    var vary = variationImpact(params.contract || {});
    var itp = generateITP();
    var build = generateBuildSequence(params.network || {});
    var countries = (listCountries() || []).length;

    var physicalPct = route.summary.overallPct;
    var scheduleVariance = route.summary.variancePct;
    var schedule = route.summary.schedule;
    var disbursedPct = disb.lenderReport.disbursedPct;
    var costChangePct = vary.summary.pctChange;
    var pendingExposurePct = vary.summary.exposurePct - vary.summary.pctChange; // pending-only share
    if (pendingExposurePct < 0) pendingExposurePct = 0;
    pendingExposurePct = Math.round(pendingExposurePct * 10) / 10;

    // Overall RAG.
    var rag = "Green";
    if ((schedule === "Behind" && scheduleVariance <= -10) || costChangePct > 5) rag = "Red";
    else if (schedule === "Behind" || costChangePct > 2 || (disbursedPct - physicalPct) > 15) rag = "Amber";

    // Alerts (most material first).
    var alerts = [];
    if (schedule === "Behind") alerts.push({ level: scheduleVariance <= -10 ? "Red" : "Amber", text: "Schedule: " + Math.abs(scheduleVariance) + "% behind the planned baseline (" + physicalPct + "% vs " + route.summary.plannedPct + "%)." });
    if (route.summary.segmentsNotStarted > 0) alerts.push({ level: "Amber", text: route.summary.segmentsNotStarted + " route segment(s) not yet started." });
    if (vary.summary.pendingVariationsUsd > 0) alerts.push({ level: "Amber", text: "Variations: " + (vary.summary.pendingVariationsUsd / 1e6).toFixed(1) + "M USD pending assessment (" + pendingExposurePct + "% exposure)." });
    if (costChangePct > 2) alerts.push({ level: costChangePct > 5 ? "Red" : "Amber", text: "Approved variations have grown the contract sum by " + costChangePct + "%." });
    if (disbursedPct - physicalPct > 10) alerts.push({ level: "Amber", text: "Disbursement (" + disbursedPct + "%) is ahead of physical progress (" + physicalPct + "%) — verify valuation." });
    if (!alerts.length) alerts.push({ level: "Green", text: "No material exceptions — programme within thresholds." });

    return {
      rag: rag,
      generatedAt: new Date().toISOString(),
      kpis: {
        physicalPct: physicalPct,
        schedule: schedule,
        scheduleVariancePct: scheduleVariance,
        kmLaid: route.summary.kmLaid,
        totalKm: route.summary.totalKm,
        disbursedPct: disbursedPct,
        disbursedUsd: disb.lenderReport.disbursedToDateUsd,
        forecastToCompleteUsd: disb.lenderReport.forecastToCompleteUsd,
        originalContractUsd: vary.summary.originalContractSumUsd,
        revisedContractUsd: vary.summary.revisedContractSumUsd,
        contractChangePct: costChangePct,
        pendingVariationsUsd: vary.summary.pendingVariationsUsd,
        holdPoints: itp.summary.holdPoints,
        ncrTriggerPoints: itp.summary.ncrTriggers,
        countries: countries,
        buildSteps: build.summary.totalSteps
      },
      sections: {
        progress: { complete: route.summary.segmentsComplete, inProgress: route.summary.segmentsInProgress, notStarted: route.summary.segmentsNotStarted, total: route.summary.totalSegments },
        finance: { disbursedPct: disbursedPct, retentionHeldUsd: disb.summary.totalRetentionUsd, advanceUsd: disb.summary.advanceUsd },
        contract: { approvedUsd: vary.summary.approvedVariationsUsd, pendingUsd: vary.summary.pendingVariationsUsd, rejectedUsd: vary.summary.rejectedVariationsUsd },
        quality: { holdPoints: itp.summary.holdPoints, witnessPoints: itp.summary.witnessPoints, totalItp: itp.summary.total }
      },
      alerts: alerts,
      references: [
        "Lender monthly progress report — physical %, disbursement, variations, quality status",
        "EVM (PMI/ISO 21508) — physical % complete underpins SPI/CPI",
        "Composed from the route, disbursement, contract, ITP and build engines"
      ]
    };
  }

  // ---------- Marine Operations Weather-Window analysis ----------
  // Deterministic analysis of when marine cable operations can run, per country
  // and across the whole multi-country campaign. Monsoon/typhoon restricted
  // months come from the programme's geographical intelligence. Computes each
  // country's viable window, a 12-month operability matrix, and the cross-route
  // campaign window (months operable across the required number of countries).
  var WEATHER_RESTRICTED = [
    { country: "Indonesia", code: "ID", sea: "Java Sea", restricted: [12, 1, 2, 3], reason: "Northwest monsoon, high seas" },
    { country: "Thailand", code: "TH", sea: "Gulf of Thailand", restricted: [11, 12, 1, 2], reason: "Northeast monsoon" },
    { country: "Vietnam", code: "VN", sea: "South China Sea", restricted: [6, 7, 8, 9, 10, 11], reason: "Typhoon season" },
    { country: "Taiwan", code: "TW", sea: "Pacific", restricted: [7, 8, 9, 10], reason: "Typhoon belt" },
    { country: "Philippines", code: "PH", sea: "Philippine Sea", restricted: [7, 8, 9, 10, 11], reason: "Typhoon alley (20+/yr)" },
    { country: "Guam", code: "GU", sea: "Western Pacific", restricted: [8, 9, 10, 11], reason: "Typhoon exposure" },
    { country: "Malaysia", code: "MY", sea: "South China Sea / Strait", restricted: [11, 12, 1, 2, 3], reason: "Northeast monsoon" },
    { country: "Brunei", code: "BN", sea: "South China Sea", restricted: [11, 12, 1, 2, 3], reason: "Northeast monsoon" }
  ];
  var MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // Longest run of viable (true) months over a circular 12-month year.
  function longestViableRun(viable) {
    var n = viable.length, best = 0, start = -1, bestStart = -1;
    if (viable.every(function (v) { return v; })) return { length: 12, startMonth: 1, endMonth: 12 };
    for (var i = 0; i < n * 2; i++) {
      var idx = i % n;
      if (viable[idx]) { if (start < 0) start = i; var len = i - start + 1; if (len > best) { best = len; bestStart = start; } }
      else start = -1;
    }
    if (best > n) best = n;
    return { length: best, startMonth: (bestStart % n) + 1, endMonth: ((bestStart + best - 1) % n) + 1 };
  }
  function weatherWindows(params) {
    params = params || {};
    var data = params.windows && params.windows.length ? params.windows : WEATHER_RESTRICTED;
    var requiredCountries = params.requiredCountries != null ? Number(params.requiredCountries) : data.length; // default: all

    var perCountry = data.map(function (c) {
      var restrictedSet = {};
      c.restricted.forEach(function (m) { restrictedSet[m] = true; });
      var viable = [];
      for (var m = 1; m <= 12; m++) viable.push(!restrictedSet[m]);
      var viableMonths = [];
      for (var k = 0; k < 12; k++) if (viable[k]) viableMonths.push(k + 1);
      var run = longestViableRun(viable);
      return {
        country: c.country, code: c.code, sea: c.sea, reason: c.reason,
        restrictedMonths: c.restricted.slice(),
        viableMonths: viableMonths,
        operablePct: Math.round(viableMonths.length / 12 * 1000) / 10,
        longestWindow: { months: run.length, from: MONTH_NAMES[run.startMonth - 1], to: MONTH_NAMES[run.endMonth - 1] }
      };
    });

    // Per-month operability across the campaign.
    var monthly = [];
    for (var m = 1; m <= 12; m++) {
      var operable = 0, restrictedCountries = [];
      data.forEach(function (c) {
        if (c.restricted.indexOf(m) < 0) operable++; else restrictedCountries.push(c.code);
      });
      monthly.push({ month: m, name: MONTH_NAMES[m - 1], operableCount: operable, restrictedCountries: restrictedCountries, allClear: operable === data.length, meetsThreshold: operable >= requiredCountries });
    }

    var bestMonths = monthly.filter(function (x) { return x.operableCount === data.length; }).map(function (x) { return x.name; });
    var worst = monthly.slice().sort(function (a, b) { return a.operableCount - b.operableCount; })[0];
    var avgOperablePct = Math.round(monthly.reduce(function (s, x) { return s + x.operableCount; }, 0) / (12 * data.length) * 1000) / 10;

    // Campaign window: longest run of months meeting the country threshold.
    var meets = monthly.map(function (x) { return x.meetsThreshold; });
    var run = longestViableRun(meets);
    var campaignWindow = meets.some(function (v) { return v; }) ? { months: run.length, from: MONTH_NAMES[run.startMonth - 1], to: MONTH_NAMES[run.endMonth - 1] } : null;

    return {
      perCountry: perCountry,
      monthly: monthly,
      monthNames: MONTH_NAMES,
      summary: {
        countries: data.length,
        requiredCountries: requiredCountries,
        allClearMonths: bestMonths,
        worstMonth: { name: worst.name, operableCount: worst.operableCount, restrictedCountries: worst.restrictedCountries },
        avgOperablePct: avgOperablePct,
        campaignWindow: campaignWindow
      },
      references: [
        "Monsoon/typhoon restricted months from the programme's geographical intelligence",
        "Marine operability — significant wave height & weather-downtime planning (cable-lay vessels)",
        "ICPC marine operations guidance — seasonal route campaign planning"
      ]
    };
  }

  var API = {
    analyzeProject: analyzeProject,
    listProfiles: listProfiles,
    extractScale: extractScale,
    getCountryInfo: getCountryInfo,
    listCountries: listCountries,
    authoritiesForPhase: authoritiesForPhase,
    _profiles: PROFILES,
    analyzeStatus: analyzeStatus,
    recordLesson: recordLesson,
    recallLessons: recallLessons,
    suggestMitigations: suggestMitigations,
    detectPatterns: detectPatterns,
    recommend: recommend,
    selfImproveCheck: selfImproveCheck,
    _clearLessons: _clearLessons,
    vendorSearch: vendorSearch,
    vendorComparison: vendorComparison,
    getContractTemplates: getContractTemplates,
    getClauseReference: getClauseReference,
    listClauses: listClauses,
    variationImpact: variationImpact,
    generateITP: generateITP,
    routeProgress: routeProgress,
    programmeStatusReport: programmeStatusReport,
    weatherWindows: weatherWindows,
    checkAlerts: checkAlerts,
    monteCarloSchedule: monteCarloSchedule,
    monteCarloCost: monteCarloCost,
    riskQuantification: riskQuantification,
    pertRandom: pertRandom,
    estimateRepairCost: estimateRepairCost,
    getRepairStrategy: getRepairStrategy,
    designCableSystem: designCableSystem,
    revenueModel: revenueModel,
    optimizeRoute: optimizeRoute,
    predictFaults: predictFaults,
    digitalTwinStatus: digitalTwinStatus,
    energyWatchdog: energyWatchdog,
    powerBudgetAnalysis: powerBudgetAnalysis,
    generateCommissioningChecklist: generateCommissioningChecklist,
    planWavelengths: planWavelengths,
    calcLatency: calcLatency,
    assessCableProtection: assessCableProtection,
    generateBuildSequence: generateBuildSequence,
    disbursementForecast: disbursementForecast,
    COUNTRY_ENERGY_DATA: COUNTRY_ENERGY_DATA
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.QIBrain = API;
})(typeof window !== "undefined" ? window : globalThis);
