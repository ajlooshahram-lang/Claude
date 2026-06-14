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

  var PROFILES = [fibreProfile, genericProfile];

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
  function analyzeProject(text, opts) {
    opts = opts || {};
    var picked = pickProfile(text, opts.profile);
    var profile = picked.profile;
    var scale = extractScale(text);

    var phases = profile.buildPhases(scale);
    var cases = [];
    phases.forEach(function (ph) {
      (ph.tasks || []).forEach(function (t) {
        cases.push(mkCase(Object.assign({}, t, { owner: t.owner || ph.owner, _phase: ph.name, _brain: "task" })));
      });
    });
    var risks = (profile.buildRisks(text, scale) || []).map(function (r) { return mkCase(Object.assign({}, r, { leanMethod: r.leanMethod || "FMEA", _brain: "risk" })); });
    var milestones = buildMilestones(phases, scale);
    var procurement = profile.buildProcurement(scale);
    var budget = aggregateBudget(cases.concat(risks), procurement);

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
      coverage: { profile: profile.id, confidence: Math.round(confidence * 100) / 100, matched: picked.matched, warnings: warnings },
    };
  }

  function listProfiles() { return PROFILES.map(function (p) { return { id: p.id, label: p.label }; }); }

  var API = { analyzeProject: analyzeProject, listProfiles: listProfiles, extractScale: extractScale, _profiles: PROFILES };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.QIBrain = API;
})(typeof window !== "undefined" ? window : globalThis);
