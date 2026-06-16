# Project Inventory — All Materials & Products (Sessions v1 + v2)

> Consolidated catalogue of **every source material** and **every built product** produced
> across the prior two work sessions. Gathered so nothing is stranded on a branch and the
> whole estate is visible in one place. Generated 2026-06-16.

---

## 1. Built products (deliverables)

| # | Product | Type | Location | Version | Origin | Status |
|---|---------|------|----------|---------|--------|--------|
| P1 | **El-Dimensionering** — bilingual (DA/EN), click-only Danish electrical dimensioning app + exam simulator | Single-file web app | `el-dimensionering.html` | `2026.12` | v1 (PR #4) → v2 (PR #11) | **On `main`** |
| P2 | **QI Full Program** — AI PM platform workbook | Excel (`.xlsm`) | `QI_Full_Program_v8_Complete_AI_PM_PLATFORM.xlsm` | v8 | v1/v2 | **On `main`** |
| P3 | **QI Intelligence Platform — Web App** — self-contained PM / risk / quality / EVM browser app | Multi-file web app | `qi-webapp/` | v9 | v2 (`upgrade/v9-integrated-platform`, PRs #10/#12/#13) | **Gathered from branch** |
| P4 | **QI Platform v9 Integrated** — integrated workbook | Excel (`.xlsx`) | `QI_Platform_v9_Integrated.xlsx` | v9 | v2 (branch) | **Gathered from branch** |
| P5 | **FMEA-Lite** — standalone FMEA tool | Single-file web app | `fmea-lite.html` | — | v2 (branch) | **Gathered from branch** |
| P6 | **Trend Product Finder** | Single-file web app | `trend-product-finder/index.html` | — | v2 (branch) | **Gathered from branch** |
| P7 | **Neon Shooter** — experiment/demo | Single-file web app | `neon-shooter/index.html` | — | v2 (branch) | **Gathered from branch** |
| — | **Standards manifest** — dynamic DK standards/law versions | JSON | `standards-manifest.json` | checked 2026-06-11 | v1 | On `main` |

### P1 — El-Dimensionering (data v2026.12)
Single HTML file, 4,895 lines, ~363 KB. 100% click-only, bilingual DA/EN.
- **Engineering modules:** Load (IB), Fuses (NH/D01/D02), MCB (C60/NG125, curves B/C/D), MCCB (NSX + Micrologic 2.2), Cables (Cu/Al + correction factors), Voltage drop (≤4% / 3%-5% DK), Short circuit (Ik max/min, Icu≥Ik), Transformer (50–2500 kVA), Standards, RCD/HPFI, Earthing systems (TN-S/TN-C-S/TN-C/TT/IT).
- **Component bank:** 179 real Danish-market products (NKT, Schneider, ABB, Eaton, Hager, LK).
- **Intelligence:** product recommendation engine (safety-filtered IB≤In≤Iz, Icu≥Ik), per-module AI assistant, QI quality index, AI-Electrician KB (offline + optional online).
- **Exam simulator (v2 addition):** Quick Quiz (23 MCQs), Full Assignment (11 scenarios / 68 steps), Full/Quick timed mock, Apprentice vs Exam modes, answer shuffling, weak-clause report (print/.txt), review-mistakes screen, hidden instructor answer-key (5-tap). All steps cite DS/HD 60364 clauses.

### P3 — QI Intelligence Platform Web App (v9)
`index.html` + `css/styles.css` + `js/{calc,store,charts,ui,brain}.js` + tests.
- One case → flows into PM tasks, risk register, FMEA, PDCA, action log, Gantt, budget, dashboard, AI.
- 43+ views: Portfolio/Dashboard/Cases, Kanban, Timeline, Risk Matrix, Six Sigma (SPC I-MR, X̄-R), Gage R&R, Process Capability (Cp/Cpk), NCR Pareto, HAZOP, Bow-tie, SIL, Requirements Traceability, EVM, Cash Flow/S-curve, RICE/WSJF, OKR, AI Assistant, Report Pack, etc.
- Offline, localStorage, JSON/CSV export, click-only, dark mode, command palette.
- **Project Brain** (`js/brain.js`): offline, deterministic description → full plan (WBS, FMEA risks, milestones, procurement, budget) with a built-in fibre/telecom domain profile.

---

## 2. Verification performed (this gather)

| Check | Result |
|-------|--------|
| `node --check` on all `qi-webapp/js/*.js` + tests | **8/8 OK** |
| `node qi-webapp/test.js` (engine: MSA, cashflow, resource, Cp/Cpk, RICE/WSJF, NCR Pareto, theme, soft-delete/bulk) | **PASS** |
| `node qi-webapp/brain.test.js` (domain detect, scale parse, cost scaling, fallback, determinism) | **24/24 PASS** |
| `el-dimensionering.html` inline script parse | **OK (1 block)** |

> `qi-webapp/smoke.js` is a jsdom full-app suite (199 checks) requiring `npm i jsdom`; not re-run here
> because the network mode may block the install. Engine + brain suites cover the calculation logic.

---

## 3. Source materials on `main` (120 files)

| Category | Count | Examples |
|----------|-------|----------|
| **Exam papers** (Maskinmester / El-autorisationsprøve, 2006–2023, + solutions) | ~55 | `Autoprøve MM 2019 12 december VB opg. 1, 2 og 3.pdf`, `2023_01_El-autorisation_Godkendt.pdf`, `MM-autorisationsprove februar 2019 svar installation DS_HD_60364_3 JR.docx` |
| **Excel calculation workbooks** (belastningsskema, kabeloplægning, dimensionering, fasekompensering) | 16 (.xlsx/.xlsm) | `Belastningsberegner_vers2.1.xlsx`, `Installations ark V3.0. dimensionering.xlsm`, `Total-IB-T3.3.xlsx`, `fasekompensering.xlsx` |
| **Manufacturer datasheets & catalogues** | ~10 | `ABB Dry/Oil DTR Datasheets 2017.1 M4.pdf`, `Siemens transformere, data 2017.1 M4.pdf`, `SENTRON_LV10-PH05...pdf`, `HHD-Sicherungen*.pdf`, `TYTAN I/II.pdf`, `Siemens beta katalog 2008.pdf` |
| **Standards & law** | ~9 | `elsikkerhedsloven.pdf`, `BEK 1082.pdf`, `BEK 1608.pdf`, `DS-håndbog 183_2021.pdf`, `DS_EN 50110-1_2013.pdf`, `Fællesregulativet 2019.pdf`, `EU-forordning ... 548-2014 / 2019-1783.pdf` |
| **Course slides** (.pptx) | 6 | `1.-Dim-af-trafo`, `2.-Linjerelæ`, `3.-Spændingsniveau`, `4.-Trafobeskyttelse`, `5.-Jordingssystem`, `Overstrømsbeskyttels` |
| **Student projects / mini-projects** | ~8 | `3-semester-Mikkel Mac Dalsing.docx`, `Miniprojekt-Milad.pdf`, `FaseKomp-miniprojekt.milad.docx`, `Projektoplæg Avantgrøn miniprojekt - F2023.pdf` |

**By extension:** 62 PDF · 29 DOCX · 13 XLSX · 7 DOC · 6 PPTX · 3 XLSM = **120 files**.

These were uploaded in **PR #3** (and its comments) during session v1 and are the data source for the El-Dimensionering product (fuse/MCB/cable/transformer tables, Danish standards framework).

---

## 4. Session timeline

| Session | Date (merge) | PRs | What shipped |
|---------|--------------|-----|--------------|
| **v1** | 2026-06-11 | #3, #4 | Source-material upload; El-Dimensionering app initial build (7 engineering modules → transformer, standards, RCD/earthing, 179-product component bank, recommendation engine, AI assistant, QI index, AI-Electrician). |
| **v2** | 2026-06-13 | #11, #10, #12, #13 | Exam simulator added to El-Dim (v2026.8 → v2026.12, instructor answer-key); QI Platform **v9** line on `upgrade/v9-integrated-platform` — i18n (#10), secure backend (#12), Project Brain (#13), plus FMEA-Lite, Trend Product Finder, Neon Shooter. |

> **Key finding:** the entire **v9 QI Platform web app and companion tools (P3–P7)** were merged into the
> `upgrade/v9-integrated-platform` branch, **not** into `main`. This inventory pulls them into the working
> tree so all v1 + v2 products are gathered together.
