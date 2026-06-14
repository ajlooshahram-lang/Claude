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

    // ---- Vendor Directory ---------------------------------------------------
    vendors: [
      // TURNKEY SYSTEMS
      { id: "v-subcom", company: "SubCom", hq: "United States", category: "turnkey-systems", capabilities: ["turnkey submarine cable systems", "cable manufacturing", "installation", "maintenance", "network design"], products: ["submarine fibre optic cables", "repeaters", "SLTE", "branching units", "power feed equipment"], notableProjects: ["Amitie", "Bifrost", "Jupiter", "Dunant", "CAP-1"], website: "https://www.subcom.com", priceRange: "premium", leadTime: "18-36 months", strengths: ["Largest market share in submarine cable", "Own cable ships", "End-to-end capability", "Deep-water expertise"], considerations: ["Premium pricing", "Long lead times for major systems", "US-based ITAR considerations"] },
      { id: "v-asn", company: "Alcatel Submarine Networks (ASN/Nokia)", hq: "France", category: "turnkey-systems", capabilities: ["turnkey submarine cable systems", "cable manufacturing", "marine operations", "network upgrades", "wet plant and dry plant"], products: ["submarine cables", "optical repeaters", "ROADM branching units", "1620 DWDM SLTE", "power feed equipment"], notableProjects: ["SEA-ME-WE 6", "2Africa", "Dunant", "EllaLink", "PEACE Cable"], website: "https://www.asn.com", priceRange: "premium", leadTime: "18-36 months", strengths: ["Strong global presence", "Nokia integration for SLTE", "Proven in ultra-long-haul", "Large installation fleet"], considerations: ["Complex procurement via Nokia", "Premium pricing tier", "Long project cycles"] },
      { id: "v-nec", company: "NEC Corporation", hq: "Japan", category: "turnkey-systems", capabilities: ["turnkey submarine cable systems", "cable manufacturing", "marine installation", "system upgrades", "network monitoring"], products: ["submarine cables", "optical amplifiers", "SLTE", "undersea branching units", "cable monitoring systems"], notableProjects: ["Asia Direct Cable", "JUPITER", "SJC2", "MIST Cable", "Hawaiki"], website: "https://www.nec.com/en/global/solutions/nsp/submarine/", priceRange: "premium", leadTime: "18-36 months", strengths: ["Strong Asia-Pacific presence", "Advanced amplifier technology", "Proven reliability", "Comprehensive maintenance services"], considerations: ["Primarily focused on Pacific routes", "Premium pricing", "Lead times extend for custom designs"] },
      { id: "v-hmn", company: "HMN Tech", hq: "China", category: "turnkey-systems", capabilities: ["turnkey submarine cable systems", "cable manufacturing", "marine installation", "system integration", "network planning"], products: ["submarine fibre cables", "repeaters", "SLTE equipment", "branching units", "shore-end solutions"], notableProjects: ["PEACE Cable", "Pakistan-East Africa Cable", "SeaMeWe-5 segments", "SAIL Cable"], website: "https://www.hmntech.com", priceRange: "competitive", leadTime: "12-30 months", strengths: ["Competitive pricing", "Growing submarine portfolio", "Fast manufacturing capacity", "Strong government backing"], considerations: ["Geopolitical restrictions in some markets", "Limited cable ship fleet", "Newer entrant to deep-water systems"] },

      // CABLE MANUFACTURERS
      { id: "v-prysmian", company: "Prysmian Group", hq: "Italy", category: "cable-manufacturers", capabilities: ["submarine cable manufacturing", "terrestrial fibre cable", "power cables", "cable installation", "offshore wind cables"], products: ["submarine telecom cables", "OPGW", "ADSS", "loose-tube cables", "ribbon cables", "micro-cables"], notableProjects: ["Western Link HVDC", "Viking Link", "Numerous submarine telecom systems", "Pan-European backbone"], website: "https://www.prysmiangroup.com", priceRange: "premium", leadTime: "8-18 months", strengths: ["Worlds largest cable manufacturer", "Vertically integrated", "Global manufacturing footprint", "R&D leadership"], considerations: ["Premium pricing", "Long lead for submarine cable", "Large minimum order quantities"] },
      { id: "v-nexans", company: "Nexans", hq: "France", category: "cable-manufacturers", capabilities: ["submarine cable manufacturing", "terrestrial fibre cable", "power cables", "installation services", "cable accessories"], products: ["submarine power cables", "optical fibre cables", "OPGW", "loose-tube cables", "blown fibre"], notableProjects: ["NordLink", "North Sea Link", "Multiple FTTH rollouts in Europe"], website: "https://www.nexans.com", priceRange: "premium", leadTime: "8-16 months", strengths: ["Strong submarine power cable expertise", "European manufacturing base", "Innovation in cable design", "Sustainability focus"], considerations: ["Telecom submarine is secondary focus", "Premium pricing", "Capacity constraints in peak demand"] },
      { id: "v-nkt", company: "NKT", hq: "Denmark", category: "cable-manufacturers", capabilities: ["high-voltage submarine cables", "power cable systems", "cable installation", "offshore cable solutions"], products: ["submarine power cables", "land power cables", "cable accessories", "offshore wind array cables"], notableProjects: ["Viking Link", "Kriegers Flak", "BorWin", "COBRAcable"], website: "https://www.nkt.com", priceRange: "premium", leadTime: "12-24 months", strengths: ["HV submarine cable leader", "Own cable vessel", "Danish engineering quality", "Strong in offshore wind"], considerations: ["Focused on power not telecom", "Very long lead times", "Limited fibre-only offerings"] },
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

  var API = {
    analyzeProject: analyzeProject,
    listProfiles: listProfiles,
    extractScale: extractScale,
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
    vendorComparison: vendorComparison
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.QIBrain = API;
})(typeof window !== "undefined" ? window : globalThis);
