/* QI Platform — Country Intelligence (Submarine Telecom Project).
 *
 * Static, bundled, OFFLINE reference data for the 8 STP countries/territories.
 * Exposes window.QICountryData with:
 *   - COUNTRIES : object keyed by lower-case country key
 *   - list()    : array of all country records (stable order)
 *   - detect(text[, opts]) : which countries a project description concerns
 *   - riskCases(countries)        : FMEA-scored country risks (case-shaped)
 *   - permitTaskCases(countries)  : permitting-phase tasks naming the real authority
 *   - procurementItems(countries) : country permit/survey procurement lines
 *   - summarize(countries)        : compact per-country intel for previews
 *
 * Design rules (mirror brain.js):
 *   - 100% local & deterministic. No network, no randomness. Pure functions.
 *   - Built as a no-build global IIFE (loaded via <script src>). Also exports
 *     via module.exports so brain.js can use it under Node for headless tests.
 *   - Data is REAL: regulatory authorities, marine/environmental bodies and the
 *     dominant geopolitical & geographical hazards are factual as of 2025.
 */
(function (root) {
  "use strict";

  // ---- the 8 STP countries/territories ------------------------------------
  // authority   : telecom regulator that issues licences / cable-landing rights
  // environmental: marine/coastal/EIA permitting body relevant to subsea works
  // geopolitical : territorial, political & cross-border landing-rights factors
  // geographical : natural hazards along the survey / cable route
  // risks        : curated, FMEA-scored (sev/occ/det) country risks
  // phaseRelevance: which generated project phase each item surfaces in
  var DATA = [
    {
      key: "indonesia",
      name: "Indonesia",
      authority: {
        name: "Kementerian Komunikasi dan Digital (Ministry of Communication and Digital Affairs)",
        abbrev: "Komdigi",
        role: "Telecom licensing & cable-landing approvals; subsea infrastructure handled by the Directorate General of Digital Infrastructure (DJID).",
        url: "https://www.komdigi.go.id"
      },
      environmental: {
        body: "Kementerian Kelautan dan Perikanan (Ministry of Marine Affairs & Fisheries) for marine-space permits, with AMDAL environmental impact assessment",
        abbrev: "KKP / AMDAL",
        role: "Marine spatial-use permit for the cable corridor plus AMDAL EIA clearance."
      },
      geopolitical: [
        "Multi-island, multi-province permitting adds parallel approval tracks across the archipelago.",
        "Cabotage rules restrict foreign-flag survey/lay vessels in Indonesian waters.",
        "Data-sovereignty and local-content (TKDN) requirements affect landing-party structuring."
      ],
      geographical: [
        "Sunda megathrust: frequent large earthquakes and tsunami exposure for landing sites.",
        "Active volcanism along the Pacific Ring of Fire (Krakatoa/Sunda Strait corridor).",
        "Deep Java/Sunda Trench bathymetry complicates deep-water cable lay.",
        "Coral Triangle reef ecosystems require protected-area avoidance and route slack."
      ],
      risks: [
        { problem: "RISK: Indonesia cable-landing permit delay via Komdigi / DJID", category: "Delivery / Schedule", sev: 8, occ: 6, det: 4, priority: "2-HIGH", rootCause: "Multi-province + central approvals on the critical path", phase: "Permitting & Right-of-Way" },
        { problem: "RISK: Seismic / tsunami damage to Indonesian landing infrastructure (Sunda megathrust)", category: "Quality / Defects", sev: 9, occ: 4, det: 6, priority: "2-HIGH", rootCause: "Landing sites on a high-seismicity subduction margin", phase: "Survey & Design" },
        { problem: "RISK: Cabotage rules limit foreign survey/lay vessels in Indonesian waters", category: "Delivery / Schedule", sev: 6, occ: 6, det: 3, priority: "2-HIGH", rootCause: "Indonesian-flag vessel requirement", phase: "Cable Installation" }
      ]
    },
    {
      key: "thailand",
      name: "Thailand",
      authority: {
        name: "National Broadcasting and Telecommunications Commission",
        abbrev: "NBTC",
        role: "Telecom licensing and cable-landing/landing-station authorisation.",
        url: "https://www.nbtc.go.th"
      },
      environmental: {
        body: "Office of Natural Resources and Environmental Policy and Planning (EIA) with the Marine Department for coastal works",
        abbrev: "ONEP",
        role: "Environmental impact assessment plus coastal/foreshore works approval."
      },
      geopolitical: [
        "Landing at Songkhla sits near the sensitive deep-south provinces — added security coordination.",
        "Periodic political transitions can slow ministerial sign-offs.",
        "Cross-border interconnect alignment with Malaysia on the southern route."
      ],
      geographical: [
        "Southwest & northeast monsoons create seasonal weather windows for marine works.",
        "Shallow Gulf of Thailand shelf with heavy fishing-trawler anchor activity.",
        "Andaman-side 2004 tsunami history informs landing-site resilience design."
      ],
      risks: [
        { problem: "RISK: Thailand landing licence / NBTC approval slips schedule", category: "Delivery / Schedule", sev: 7, occ: 5, det: 4, priority: "2-HIGH", rootCause: "Sequential NBTC + environmental sign-off", phase: "Permitting & Right-of-Way" },
        { problem: "RISK: Trawler anchor damage on the shallow Gulf of Thailand shelf", category: "Quality / Defects", sev: 7, occ: 6, det: 5, priority: "2-HIGH", rootCause: "Dense fishing activity over the cable corridor", phase: "Cable Installation" }
      ]
    },
    {
      key: "vietnam",
      name: "Vietnam",
      authority: {
        name: "Ministry of Science and Technology (absorbed the former Ministry of Information & Communications on 18 Feb 2025)",
        abbrev: "MOST (ex-MIC)",
        role: "Telecom licensing & submarine-cable landing via the Authority of Telecommunications.",
        url: "https://english.mst.gov.vn"
      },
      environmental: {
        body: "Vietnam Administration of Seas and Islands (marine-area use) with provincial EIA approval",
        abbrev: "VASI",
        role: "Sea-area use assignment for the cable corridor plus environmental impact assessment."
      },
      geopolitical: [
        "East Sea / South China Sea disputes constrain routing and slow at-sea repairs near contested waters.",
        "History of repeated international-cable faults with long repair-permit lead times.",
        "State-owned operator landscape shapes landing-party and capacity arrangements."
      ],
      geographical: [
        "Typhoon-exposed central coast (Da Nang/Quy Nhon landing region).",
        "Frequent fishing-trawler anchor cuts on the shallow continental shelf.",
        "Monsoon season narrows marine-survey and lay windows."
      ],
      risks: [
        { problem: "RISK: Vietnam repair/landing permit delay in/near disputed waters", category: "Delivery / Schedule", sev: 8, occ: 6, det: 5, priority: "1-CRITICAL", rootCause: "Geopolitical sensitivity of East Sea routing", phase: "Permitting & Right-of-Way" },
        { problem: "RISK: Typhoon season disruption to Vietnam central-coast marine works", category: "Delivery / Schedule", sev: 7, occ: 7, det: 3, priority: "2-HIGH", rootCause: "Seasonal Pacific typhoon track", phase: "Survey & Design" }
      ]
    },
    {
      key: "taiwan",
      name: "Taiwan",
      authority: {
        name: "National Communications Commission",
        abbrev: "NCC",
        role: "Telecom licensing and submarine cable-landing authorisation.",
        url: "https://www.ncc.gov.tw"
      },
      environmental: {
        body: "Ministry of Environment (EIA) with the Ocean Affairs Council for marine matters",
        abbrev: "MOENV / OAC",
        role: "Environmental impact assessment plus marine-area coordination."
      },
      geopolitical: [
        "Taiwan Strait cross-strait tensions raise security scrutiny of subsea cables.",
        "Documented cable damage near outlying islands drives resilience/route diversity needs.",
        "Heightened sensitivity over foreign participation in critical infrastructure."
      ],
      geographical: [
        "Pacific Ring of Fire: frequent strong earthquakes (e.g. the 2006 Hengchun quake severed multiple regional cables).",
        "Typhoon belt with intense seasonal storms.",
        "Steep Luzon Strait / Manila Trench bathymetry and submarine-landslide / turbidity-current risk."
      ],
      risks: [
        { problem: "RISK: Taiwan Strait geopolitical tension disrupts cable works / repair access", category: "Delivery / Schedule", sev: 8, occ: 5, det: 5, priority: "1-CRITICAL", rootCause: "Cross-strait security environment", phase: "Permitting & Right-of-Way" },
        { problem: "RISK: Earthquake / submarine-landslide cable break in the Luzon Strait", category: "Quality / Defects", sev: 9, occ: 5, det: 6, priority: "1-CRITICAL", rootCause: "High seismicity and steep trench bathymetry", phase: "Survey & Design" }
      ]
    },
    {
      key: "philippines",
      name: "Philippines",
      authority: {
        name: "National Telecommunications Commission",
        abbrev: "NTC",
        role: "Telecom licensing and cable-landing licence issuance.",
        url: "https://ntc.gov.ph"
      },
      environmental: {
        body: "DENR Environmental Management Bureau (Environmental Compliance Certificate) with LGU foreshore lease",
        abbrev: "DENR-EMB",
        role: "ECC under the Environmental Impact Statement system plus foreshore/coastal lease."
      },
      geopolitical: [
        "West Philippine Sea / South China Sea disputes affect routing and at-sea operations.",
        "Local-government-unit (LGU) permits add a layer to landing-site approvals.",
        "Public Service Act (2022) liberalised foreign participation in telecoms."
      ],
      geographical: [
        "Typhoon belt: roughly 20 tropical cyclones per year cross the approaches.",
        "Pacific Ring of Fire seismicity and volcanism near landing regions.",
        "Deep Philippine Trench and Manila Trench bathymetry; extensive coral reefs."
      ],
      risks: [
        { problem: "RISK: Typhoon season disruption to Philippines marine works", category: "Delivery / Schedule", sev: 8, occ: 8, det: 3, priority: "1-CRITICAL", rootCause: "~20 cyclones/yr across the marine route", phase: "Survey & Design" },
        { problem: "RISK: Philippines cable-landing licence delay (NTC + LGU + ECC)", category: "Delivery / Schedule", sev: 7, occ: 6, det: 4, priority: "2-HIGH", rootCause: "Multi-body permitting stack", phase: "Permitting & Right-of-Way" },
        { problem: "RISK: West Philippine Sea routing constraints / at-sea interference", category: "Process / Flow", sev: 7, occ: 5, det: 5, priority: "2-HIGH", rootCause: "Contested maritime zones", phase: "Cable Installation" }
      ]
    },
    {
      key: "guam",
      name: "Guam (US territory)",
      authority: {
        name: "Federal Communications Commission",
        abbrev: "FCC",
        role: "Submarine cable-landing licence under the Cable Landing License Act & Section 214; local utility matters via the Guam Public Utilities Commission (PUC).",
        url: "https://www.fcc.gov/submarine-cables"
      },
      environmental: {
        body: "US federal NEPA review with USACE Section 10/404 permits, Guam EPA and NOAA coral-reef / Endangered Species Act protections",
        abbrev: "NEPA / USACE / Guam EPA",
        role: "Federal environmental review plus marine-construction and reef-protection permits."
      },
      geopolitical: [
        "US territory and strategic military hub — national-security (Team Telecom) review of foreign carriers.",
        "Stable governance and well-defined federal licensing process.",
        "A key Pacific interconnection point for trans-Pacific systems."
      ],
      geographical: [
        "Super-typhoon belt with very intense seasonal storms.",
        "Adjacent to the Mariana Trench — the deepest ocean bathymetry on Earth.",
        "Seismically active region with fringing coral-reef landing approaches."
      ],
      risks: [
        { problem: "RISK: Guam national-security (Team Telecom) review delays the landing licence", category: "Delivery / Schedule", sev: 7, occ: 5, det: 4, priority: "2-HIGH", rootCause: "Foreign-carrier security review on a strategic territory", phase: "Permitting & Right-of-Way" },
        { problem: "RISK: Super-typhoon damage to Guam landing station / shore-end", category: "Quality / Defects", sev: 8, occ: 6, det: 4, priority: "2-HIGH", rootCause: "Western-Pacific super-typhoon exposure", phase: "Survey & Design" }
      ]
    },
    {
      key: "malaysia",
      name: "Malaysia",
      authority: {
        name: "Malaysian Communications and Multimedia Commission (Suruhanjaya Komunikasi dan Multimedia Malaysia)",
        abbrev: "MCMC",
        role: "Licensing and cable-landing approval under the Communications and Multimedia Act 1998.",
        url: "https://www.mcmc.gov.my"
      },
      environmental: {
        body: "Department of Environment (EIA) with the Department of Fisheries / marine-park authority for coastal works",
        abbrev: "DOE",
        role: "Environmental impact assessment plus marine-park / coastal-works clearance."
      },
      geopolitical: [
        "Overlapping South China Sea claims off Sarawak/Sabah affect East-Malaysia routing.",
        "Separate peninsular and East-Malaysia jurisdictions can mean parallel approvals.",
        "Local landing-party / equity-participation expectations."
      ],
      geographical: [
        "Northeast monsoon (Dec–Feb) brings rough seas off the east coast — narrow lay windows.",
        "Shallow Sunda Shelf with dense shipping and fishing traffic.",
        "Protected coral-reef marine parks require route avoidance."
      ],
      risks: [
        { problem: "RISK: Malaysia landing approval delay (MCMC + peninsular/East-Malaysia split)", category: "Delivery / Schedule", sev: 7, occ: 5, det: 4, priority: "2-HIGH", rootCause: "Dual-jurisdiction permitting", phase: "Permitting & Right-of-Way" },
        { problem: "RISK: Northeast-monsoon weather window loss off Malaysia's east coast", category: "Delivery / Schedule", sev: 6, occ: 7, det: 3, priority: "2-HIGH", rootCause: "Seasonal rough seas", phase: "Survey & Design" }
      ]
    },
    {
      key: "brunei",
      name: "Brunei",
      authority: {
        name: "Authority for Info-communications Technology Industry of Brunei Darussalam",
        abbrev: "AITI",
        role: "Telecom licensing and cable-landing authorisation under the Telecommunications Order 2001.",
        url: "https://www.aiti.gov.bn"
      },
      environmental: {
        body: "Department of Environment, Parks and Recreation (environmental clearance) with coastal-works approval",
        abbrev: "JASTRe",
        role: "Environmental clearance plus coastal/foreshore works permit."
      },
      geopolitical: [
        "South China Sea EEZ overlap influences offshore routing.",
        "Small market served by a single national operator (UNN) — landing-party options are limited.",
        "Stable governance with a concise regulatory chain."
      ],
      geographical: [
        "Monsoon-driven sea-state windows govern marine works.",
        "Relatively low seismicity compared with the wider region.",
        "Shallow shelf with coral-reef habitats near the short coastline."
      ],
      risks: [
        { problem: "RISK: Brunei single-operator landing-party dependency", category: "Process / Flow", sev: 6, occ: 5, det: 4, priority: "2-HIGH", rootCause: "Limited landing-party alternatives", phase: "Permitting & Right-of-Way" },
        { problem: "RISK: South China Sea EEZ overlap constrains Brunei offshore routing", category: "Process / Flow", sev: 6, occ: 4, det: 5, priority: "3-MEDIUM", rootCause: "Maritime-boundary sensitivity", phase: "Cable Installation" }
      ]
    }
  ];

  // phaseRelevance is derived deterministically so each record stays in sync
  // with its authority / hazards / risks (no hand-maintained duplication).
  DATA.forEach(function (c) {
    var permitting = ["Regulatory authority: " + c.authority.abbrev + " — " + c.authority.role];
    if (c.environmental && c.environmental.body) permitting.push("Environmental: " + c.environmental.abbrev + " — " + c.environmental.role);
    c.phaseRelevance = {
      "Survey & Design": c.geographical.slice(0),
      "Permitting & Right-of-Way": permitting.concat(c.geopolitical),
      "Cable Installation": c.geographical.filter(function (g) { return /trench|shelf|anchor|reef|landslide|bathymetr/i.test(g); })
    };
  });

  // ---- framework reference data (Market Entry / Licensing / Landing Party) -
  // Merged onto each country record below. Kept as a separate map so the core
  // records above stay readable. All figures are INDICATIVE planning lead times
  // (months) and all operator names are real, well-known licensees as of 2025.
  // Plain language is used throughout — these feed tools for users with NO
  // project-management or telecom background.
  var EXTRA = {
    indonesia: {
      marketEntry: {
        demand: "Very large, fast-growing market (270M+ people) with a major data-centre build-out around Jakarta and Batam.",
        foreignOwnership: "Telecom services are largely open to majority foreign ownership (up to ~67% under the Positive Investment List), but the cable-landing right itself is held through a locally-licensed company.",
        recommendedMode: "Partner with a licensed Indonesian landing party (often via a local joint venture) and use their landing licence.",
        recommendation: "Enter through a strong local partner and budget extra time for approvals across several provinces.",
        verdict: "Conditional Go"
      },
      licensing: [
        { license: "Cable-landing approval / telecom licence", authority: "Komdigi (DJID)", leadTimeMonths: 12, dependsOn: "A local landing-party company", note: "Needs central + provincial coordination." },
        { license: "Marine spatial-use permit (sea corridor)", authority: "KKP", leadTimeMonths: 8, dependsOn: "Route survey", note: "Reserves the seabed corridor for the cable." },
        { license: "AMDAL environmental clearance", authority: "KKP / AMDAL", leadTimeMonths: 9, dependsOn: "Marine survey", note: "Reefs and seismic zones widen the study." }
      ],
      landingParties: {
        candidates: ["Telkom Indonesia / Telin", "Indosat Ooredoo Hutchison", "XL Axiata", "Moratelindo"],
        wants: ["A share of capacity (fibre pairs)", "Local equity or revenue share", "Backhaul to Jakarta / Batam data centres"],
        structures: ["Use the partner's landing licence + capacity swap (IRU)", "Local joint venture with the landing party"],
        note: "Telin already runs regional systems and existing landing stations."
      }
    },
    thailand: {
      marketEntry: {
        demand: "Solid regional-hub demand; established carriers and growing cloud/data-centre presence.",
        foreignOwnership: "The Foreign Business Act generally caps foreign ownership at 49% in telecoms, so a Thai-majority structure is normally required.",
        recommendedMode: "Thai-majority joint venture, or buy capacity through an existing NBTC-licensed landing party.",
        recommendation: "Plan for a Thai-majority partner; the 49% cap shapes the whole deal.",
        verdict: "Conditional Go"
      },
      licensing: [
        { license: "Telecom licence + landing-station authorisation", authority: "NBTC", leadTimeMonths: 10, dependsOn: "Thai-majority licensee", note: "Sequential with environmental sign-off." },
        { license: "Coastal / foreshore works approval", authority: "Marine Department", leadTimeMonths: 6, dependsOn: "Landing-site selection", note: "Shore-end construction permit." },
        { license: "Environmental impact assessment", authority: "ONEP", leadTimeMonths: 8, dependsOn: "Marine survey", note: "" }
      ],
      landingParties: {
        candidates: ["AIS (Advanced Info Service)", "True Corporation", "National Telecom (NT)"],
        wants: ["Capacity for domestic + transit traffic", "Thai-majority equity position", "Backhaul to Bangkok"],
        structures: ["Thai-majority JV holds the licence", "Capacity purchase (IRU) from an existing landing party"],
        note: "National Telecom (state-owned) already operates landing stations."
      }
    },
    vietnam: {
      marketEntry: {
        demand: "Large, young, fast-digitising market; strong need for more resilient international capacity after repeated cable faults.",
        foreignOwnership: "Facilities-based telecom is limited to ~49% foreign ownership; the market is dominated by state-linked operators.",
        recommendedMode: "Partner with a state-linked operator (Viettel/VNPT) or buy capacity into their landing stations.",
        recommendation: "Engage a state-linked landing partner early; routing near disputed waters needs lead time.",
        verdict: "Conditional Go"
      },
      licensing: [
        { license: "Submarine-cable landing licence", authority: "MOST (ex-MIC)", leadTimeMonths: 12, dependsOn: "State-linked landing partner", note: "Sensitivity near East Sea routing." },
        { license: "Sea-area use assignment", authority: "VASI", leadTimeMonths: 9, dependsOn: "Route survey", note: "Assigns the seabed corridor." },
        { license: "Provincial environmental impact assessment", authority: "VASI / Province", leadTimeMonths: 7, dependsOn: "Marine survey", note: "" }
      ],
      landingParties: {
        candidates: ["Viettel", "VNPT", "FPT Telecom", "CMC Telecom"],
        wants: ["Capacity + redundancy for national networks", "Local control of the landing station", "Backhaul to Hanoi / Ho Chi Minh City"],
        structures: ["Capacity swap (IRU) into a state-linked landing station", "Consortium membership with a Vietnamese operator"],
        note: "Viettel and VNPT hold the main international gateways."
      }
    },
    taiwan: {
      marketEntry: {
        demand: "High-value, high-tech market; critical interconnection point but politically sensitive.",
        foreignOwnership: "Network (Type I) operators face foreign-ownership limits (broadly ~49% direct / ~60% total) and NCC scrutiny of foreign control.",
        recommendedMode: "Partner with an incumbent (Chunghwa Telecom) and buy into their landing station.",
        recommendation: "Use an established local carrier; expect heightened national-security review.",
        verdict: "Caution"
      },
      licensing: [
        { license: "Submarine cable-landing authorisation", authority: "NCC", leadTimeMonths: 12, dependsOn: "Local Type I carrier", note: "Security review of foreign control." },
        { license: "Marine-area coordination", authority: "OAC", leadTimeMonths: 7, dependsOn: "Route survey", note: "Ocean Affairs Council." },
        { license: "Environmental impact assessment", authority: "MOENV", leadTimeMonths: 8, dependsOn: "Marine survey", note: "" }
      ],
      landingParties: {
        candidates: ["Chunghwa Telecom", "Taiwan Mobile", "Far EasTone"],
        wants: ["Capacity + route diversity", "Operational control of the landing", "Backhaul to Taipei / Hsinchu"],
        structures: ["Capacity swap (IRU) with the incumbent", "Consortium membership with a local carrier"],
        note: "Chunghwa Telecom operates the principal landing stations."
      }
    },
    philippines: {
      marketEntry: {
        demand: "Very large, under-served broadband market with rapid mobile/data growth.",
        foreignOwnership: "The Public Service Act (2022) lets foreign investors own up to 100% of telecom companies — among the most open in the region.",
        recommendedMode: "Direct entry is possible; a local landing partner still speeds local-government permits.",
        recommendation: "Strong open-ownership rules make entry attractive; weather and multi-body permits are the real constraints.",
        verdict: "Go"
      },
      licensing: [
        { license: "Cable-landing licence + value-added/telecom registration", authority: "NTC", leadTimeMonths: 9, dependsOn: "Local entity registration", note: "" },
        { license: "Environmental Compliance Certificate (ECC)", authority: "DENR-EMB", leadTimeMonths: 8, dependsOn: "Marine survey", note: "Under the EIS system." },
        { license: "Foreshore lease + local-government permits", authority: "DENR-EMB / LGU", leadTimeMonths: 6, dependsOn: "Landing-site selection", note: "Several local units may be involved." }
      ],
      landingParties: {
        candidates: ["PLDT", "Globe Telecom", "Converge ICT", "DITO Telecommunity"],
        wants: ["Capacity for fast-growing data demand", "Backhaul to Metro Manila / Cebu / Davao", "Brand & coverage benefits"],
        structures: ["Direct (100% allowed) with a local operating entity", "Capacity swap (IRU) with an incumbent"],
        note: "PLDT and Globe own multiple existing landing stations."
      }
    },
    guam: {
      marketEntry: {
        demand: "Small local market but the strategic Pacific hub — the gateway onward to the US mainland and Asia.",
        foreignOwnership: "No general foreign-ownership cap, but a US national-security review (Team Telecom) examines foreign owners before the FCC grants the landing licence.",
        recommendedMode: "Establish a US entity for the landing licence and partner with a Guam operator for the station.",
        recommendation: "Essential hub; start the FCC + national-security track first because it gates everything.",
        verdict: "Go"
      },
      licensing: [
        { license: "Submarine Cable Landing Licence", authority: "FCC", leadTimeMonths: 12, dependsOn: "US entity + security review", note: "Under the Cable Landing License Act." },
        { license: "National-security review", authority: "Team Telecom", leadTimeMonths: 12, dependsOn: "Disclosure of foreign owners", note: "Runs in parallel with the FCC licence." },
        { license: "Marine-construction permits + NEPA", authority: "USACE / Guam EPA", leadTimeMonths: 9, dependsOn: "Marine survey", note: "Section 10/404 + reef protection." }
      ],
      landingParties: {
        candidates: ["GTA TeleGuam", "Docomo Pacific", "IT&E"],
        wants: ["Capacity + interconnection to trans-Pacific systems", "Landing-station hosting fees", "Local backhaul"],
        structures: ["US entity holds the FCC licence", "Hosting / co-location at a Guam operator's station"],
        note: "Guam is a hub for many trans-Pacific cables; hosting options are mature."
      }
    },
    malaysia: {
      marketEntry: {
        demand: "Strong digital-economy push (MyDIGITAL) and growing data-centre clusters in Johor and Klang Valley.",
        foreignOwnership: "Network facilities/services licences require MCMC approval and have historically carried foreign-equity conditions (commonly up to ~70%, lower for some licence classes).",
        recommendedMode: "Local joint venture with an MCMC licensee; separate approvals for Peninsular and East Malaysia.",
        recommendation: "Attractive market; plan for dual-jurisdiction permits and MCMC equity conditions.",
        verdict: "Conditional Go"
      },
      licensing: [
        { license: "Network facilities licence + landing approval", authority: "MCMC", leadTimeMonths: 10, dependsOn: "Licensed local entity", note: "Peninsular + East-Malaysia split." },
        { license: "Environmental impact assessment", authority: "DOE", leadTimeMonths: 8, dependsOn: "Marine survey", note: "Marine-park avoidance." },
        { license: "Coastal / marine-park works clearance", authority: "DOE / Fisheries", leadTimeMonths: 6, dependsOn: "Landing-site selection", note: "" }
      ],
      landingParties: {
        candidates: ["Telekom Malaysia (TM)", "Maxis", "Time dotCom", "CelcomDigi"],
        wants: ["Capacity + regional transit", "Backhaul to Johor / Klang Valley data centres", "Local equity position"],
        structures: ["Local JV holding the MCMC licence", "Capacity swap (IRU) with TM"],
        note: "Telekom Malaysia operates the main landing stations."
      }
    },
    brunei: {
      marketEntry: {
        demand: "Small market, but a useful regional spur and diversification point off the main trunk.",
        foreignOwnership: "Foreign participation is limited and the infrastructure layer is a single national operator, so options are narrow.",
        recommendedMode: "Work through Unified National Networks (UNN), the sole infrastructure operator.",
        recommendation: "Treat as a single-partner market; confirm UNN appetite before committing a branch.",
        verdict: "Caution"
      },
      licensing: [
        { license: "Telecom licence + cable-landing authorisation", authority: "AITI", leadTimeMonths: 9, dependsOn: "UNN as landing party", note: "Under the Telecommunications Order 2001." },
        { license: "Environmental clearance", authority: "JASTRe", leadTimeMonths: 6, dependsOn: "Marine survey", note: "" },
        { license: "Coastal / foreshore works permit", authority: "JASTRe", leadTimeMonths: 5, dependsOn: "Landing-site selection", note: "" }
      ],
      landingParties: {
        candidates: ["Unified National Networks (UNN)", "DST (retail)", "imagine (retail)"],
        wants: ["Capacity for the national network", "Control of the landing station", "Backhaul to Bandar Seri Begawan"],
        structures: ["Capacity swap (IRU) via UNN", "Branch landing hosted by UNN"],
        note: "UNN is the single wholesale infrastructure operator."
      }
    }
  };
  DATA.forEach(function (c) { if (EXTRA[c.key]) { c.marketEntry = EXTRA[c.key].marketEntry; c.licensing = EXTRA[c.key].licensing; c.landingParties = EXTRA[c.key].landingParties; } });

  var COUNTRIES = {};
  DATA.forEach(function (c) { COUNTRIES[c.key] = c; });

  function list() { return DATA.slice(0); }

  // ---- detection -----------------------------------------------------------
  // Match on country name plus a few unambiguous aliases / landing-site cues.
  var ALIASES = {
    indonesia: ["indonesia", "indonesian", "jakarta"],
    thailand: ["thailand", "thai", "songkhla"],
    vietnam: ["vietnam", "viet nam", "vietnamese", "da nang", "danang", "quy nhon"],
    taiwan: ["taiwan", "taiwanese", "tamsui", "taipei"],
    philippines: ["philippines", "philippine", "filipino", "batangas", "luzon"],
    guam: ["guam", "piti", "mariana"],
    malaysia: ["malaysia", "malaysian", "mersing", "sarawak", "sabah"],
    brunei: ["brunei", "bruneian", "bandar seri begawan"]
  };
  var SUBSEA_RE = /(submarine|subsea|undersea|sub-sea|landing station|cable landing|festoon|trans-?pacific)/i;

  function norm(t) { return String(t == null ? "" : t).toLowerCase(); }

  /**
   * Decide which countries a description concerns.
   * @returns {{countries:Array, keys:string[], signal:string, all:boolean}}
   *  signal: "named" (explicit country/site), "submarine" (subsea project,
   *  no specific country → all 8), or "none".
   */
  function detect(text, opts) {
    opts = opts || {};
    var t = norm(text);
    var keys = [];
    Object.keys(ALIASES).forEach(function (key) {
      if (ALIASES[key].some(function (a) { return t.indexOf(a) !== -1; })) keys.push(key);
    });
    if (keys.length) {
      var named = DATA.filter(function (c) { return keys.indexOf(c.key) !== -1; });
      return { countries: named, keys: keys, signal: "named", all: false };
    }
    if (opts.includeAllOnSubsea !== false && SUBSEA_RE.test(t)) {
      return { countries: list(), keys: DATA.map(function (c) { return c.key; }), signal: "submarine", all: true };
    }
    return { countries: [], keys: [], signal: "none", all: false };
  }

  // ---- generators (shapes match brain.js mkCase / register rows) -----------
  function riskCases(countries) {
    var out = [];
    (countries || []).forEach(function (c) {
      (c.risks || []).forEach(function (r) {
        out.push({
          problem: r.problem + " — " + c.name,
          category: r.category || "Delivery / Schedule",
          priority: r.priority || "2-HIGH",
          sev: r.sev, occ: r.occ, det: r.det,
          rootCause: r.rootCause || "",
          owner: "Regional Coordinator",
          leanMethod: "FMEA",
          _phase: r.phase || "Permitting & Right-of-Way"
        });
      });
    });
    return out;
  }

  function permitTaskCases(countries) {
    return (countries || []).map(function (c) {
      return {
        problem: "Obtain cable landing license — " + c.authority.abbrev + " (" + c.name + ")",
        category: "Process / Flow",
        priority: "2-HIGH",
        sev: 6, occ: 5, det: 4,
        rootCause: "Regulatory approval by " + c.authority.name,
        owner: "Permitting Officer",
        costCat: "External / Consultant",
        estCost: 60000,
        leanMethod: "Standard Work",
        _phase: "Permitting & Right-of-Way"
      };
    });
  }

  function procurementItems(countries) {
    return (countries || []).map(function (c) {
      return {
        package: "Permitting & marine survey — " + c.authority.abbrev + " (" + c.name + ")",
        vendor: "TBD",
        value: 75000,
        poStatus: "Planned",
        owner: "Permitting Officer"
      };
    });
  }

  function summarize(countries) {
    return (countries || []).map(function (c) {
      return {
        key: c.key,
        name: c.name,
        authority: { name: c.authority.name, abbrev: c.authority.abbrev, role: c.authority.role, url: c.authority.url },
        environmental: c.environmental,
        geopolitical: c.geopolitical.slice(0, 2),
        geographical: c.geographical.slice(0, 2)
      };
    });
  }

  // ---- framework generators (plain language, for non-PM users) ------------
  // Each returns { title, explainer, legend?, countries:[...] }. Pure & local.

  function marketEntryFramework(countries) {
    return {
      title: "Market Entry",
      explainer: "For each country this answers three plain questions: is it worth going in, how much can a foreign investor own, and what is the simplest way in. The colour 'verdict' is a quick traffic-light to focus attention — not a guarantee.",
      legend: { "IRU": "Indefeasible Right of Use — a long-term lease of capacity on the cable, used when you buy space instead of building the landing yourself." },
      countries: (countries || []).map(function (c) {
        var m = c.marketEntry || {};
        return {
          key: c.key, name: c.name, regulator: c.authority.abbrev,
          demand: m.demand || "", foreignOwnership: m.foreignOwnership || "",
          recommendedMode: m.recommendedMode || "", recommendation: m.recommendation || "",
          verdict: m.verdict || "Conditional Go"
        };
      })
    };
  }

  function licensingFramework(countries) {
    var rows = (countries || []).map(function (c) {
      var ls = (c.licensing || []).map(function (l) {
        return { license: l.license, authority: l.authority, leadTimeMonths: Number(l.leadTimeMonths) || 0, dependsOn: l.dependsOn || "", note: l.note || "" };
      });
      var slowest = ls.slice().sort(function (a, b) { return b.leadTimeMonths - a.leadTimeMonths; })[0] || null;
      return {
        key: c.key, name: c.name, regulator: c.authority.abbrev,
        licenses: ls,
        criticalPathMonths: slowest ? slowest.leadTimeMonths : 0,
        criticalPathItem: slowest ? slowest.license : "",
        criticalPathAuthority: slowest ? slowest.authority : ""
      };
    });
    return {
      title: "Licensing & Permitting",
      explainer: "Every official approval the project needs in each country, who grants it, and roughly how many months it usually takes. The slowest approval in a country decides when work there can realistically start — so those are the ones to begin first.",
      countries: rows
    };
  }

  function landingPartnerFramework(countries) {
    return {
      title: "Landing Partner Engagement",
      explainer: "A 'landing party' is the licensed local company that brings the cable ashore and owns or operates the building where it lands. This shows who the realistic partners are in each country, what they usually want in return, and the common ways to structure a deal with them.",
      legend: {
        "Landing party": "The licensed local company that physically brings the cable ashore and operates the landing station.",
        "IRU": "Indefeasible Right of Use — a long-term lease of capacity on the cable."
      },
      countries: (countries || []).map(function (c) {
        var lp = c.landingParties || {};
        return {
          key: c.key, name: c.name,
          candidates: lp.candidates || [], wants: lp.wants || [], structures: lp.structures || [], note: lp.note || ""
        };
      })
    };
  }

  // ---- per-country briefing (powers the 3D map station drill-down) --------
  // Returns ONE country's complete, plain-language briefing for a free-text
  // hint (a station id, a country name, or any description). Pure & local:
  // reuses the framework builders above so there is a single source of truth.
  // Risk priorities are translated to plain words — no FMEA/RPN jargon leaks
  // out, because the people reading this have no project-management background.
  var RISK_LEVEL = {
    "1-CRITICAL": { label: "Top concern", rank: 1 },
    "2-HIGH":     { label: "Important",   rank: 2 },
    "3-MEDIUM":   { label: "Worth watching", rank: 3 }
  };
  function briefing(hint) {
    var d = detect(hint, { includeAllOnSubsea: false });
    var c = (d.countries && d.countries[0]) || null;
    if (!c) return null;
    var me = marketEntryFramework([c]).countries[0] || {};
    var lic = licensingFramework([c]).countries[0] || {};
    var lp = landingPartnerFramework([c]).countries[0] || {};
    var risks = (c.risks || []).map(function (r) {
      var lvl = RISK_LEVEL[r.priority] || { label: "Worth watching", rank: 3 };
      return {
        text: String(r.problem).replace(/^RISK:\s*/i, ""),
        level: lvl.label,
        rank: lvl.rank,
        phase: r.phase || ""
      };
    }).sort(function (a, b) { return a.rank - b.rank; });
    // One plain-language 'what this means for you' sentence, synthesised from
    // the verdict + the slowest approval + the single biggest risk. No jargon.
    var v = String(me.verdict || "").toLowerCase();
    var lead;
    if (v.indexOf("caution") !== -1) lead = "Approach " + c.name + " with caution";
    else if (v.indexOf("conditional") !== -1) lead = c.name + " is a conditional yes — go ahead once the local conditions are met";
    else lead = c.name + " is one of the more straightforward markets to enter";
    var takeaway = lead + ".";
    if (lic.criticalPathItem) takeaway += " Begin the " + lic.criticalPathItem + " early — about " + (lic.criticalPathMonths || 0) + " months, the longest approval.";
    if (risks[0]) takeaway += " Keep an eye on " + risks[0].text + ".";
    return {
      key: c.key,
      name: c.name,
      takeaway: takeaway,
      authority: { name: c.authority.name, abbrev: c.authority.abbrev, role: c.authority.role, url: c.authority.url || "" },
      environmental: c.environmental ? { abbrev: c.environmental.abbrev, body: c.environmental.body, role: c.environmental.role } : null,
      marketEntry: {
        verdict: me.verdict || "Conditional Go",
        recommendation: me.recommendation || "",
        foreignOwnership: me.foreignOwnership || "",
        recommendedMode: me.recommendedMode || "",
        demand: me.demand || ""
      },
      licensing: {
        licenses: lic.licenses || [],
        criticalPathItem: lic.criticalPathItem || "",
        criticalPathMonths: lic.criticalPathMonths || 0,
        criticalPathAuthority: lic.criticalPathAuthority || ""
      },
      landingParties: {
        candidates: lp.candidates || [],
        wants: lp.wants || [],
        structures: lp.structures || [],
        note: lp.note || ""
      },
      risks: risks,
      geographical: c.geographical.slice(0),
      geopolitical: c.geopolitical.slice(0)
    };
  }

  var API = {
    COUNTRIES: COUNTRIES,
    list: list,
    detect: detect,
    riskCases: riskCases,
    permitTaskCases: permitTaskCases,
    procurementItems: procurementItems,
    summarize: summarize,
    marketEntryFramework: marketEntryFramework,
    licensingFramework: licensingFramework,
    landingPartnerFramework: landingPartnerFramework,
    briefing: briefing
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.QICountryData = API;
})(typeof window !== "undefined" ? window : globalThis);
