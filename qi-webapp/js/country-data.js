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

  var API = {
    COUNTRIES: COUNTRIES,
    list: list,
    detect: detect,
    riskCases: riskCases,
    permitTaskCases: permitTaskCases,
    procurementItems: procurementItems,
    summarize: summarize
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.QICountryData = API;
})(typeof window !== "undefined" ? window : globalThis);
