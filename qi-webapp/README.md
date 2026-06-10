# QI Intelligence Platform — Web App

A self-contained, browser-based version of the QI/PM Excel platform. Register a
case **once** and it flows into every view — PM tasks, risk register, FMEA, PDCA,
action log, timeline, budget, dashboard and an AI assistant — all updated live.

No install, no build step, no server, works offline.

## Run it

**Locally:** open `index.html` in any modern browser (double-click, or drag it into a tab).

**Host it for your team (free):** push this folder to GitHub and enable
**GitHub Pages** (Settings → Pages → deploy from branch). The app is then a normal URL.

> The only online dependency is the Chart.js chart library, loaded from a CDN.
> Everything else runs in your browser.

## How it works

1. **Settings** — enter your project details and team roster. Roster names populate the Owner & Stakeholder dropdowns.
2. **+ New Case** — fill the form (dropdowns + suggestions). RPN, timing, health and an AI recommendation calculate live as you type.
3. That single case automatically appears as a **PM task, scored risk, FMEA line, PDCA cycle, action-log entry, Gantt bar and budget line**.
4. **Dashboard / AI Assistant** — live KPIs, interactive charts and an RPN-ranked action queue.

## Your data

- Saved automatically in your browser (`localStorage`) — nothing is sent anywhere.
- **Export JSON** (Settings or top bar) to back up or move your data; **Import JSON** to restore.
- **Export CSV** for cases; **Print** any view to paper or PDF.

## Views

**Overview:** Portfolio · Dashboard · Cases (Master)
**Delivery:** PM Tasks · Kanban Board · Timeline (Gantt)
**Risk & Quality:** Risk Register · FMEA · Six Sigma (+ SPC I-MR control charts) · Gage R&R (MSA) · Risk Matrix
**Improve:** PDCA · Action Log
**People & Cost:** Stakeholders (RACI) · Budget
**Engineering registers:** HAZOP (with guidewords & parameters) · Calibration · Punch List · SIL / Functional Safety · Requirements Traceability · Document Register · Non-Conformance (NCR) · Management of Change (MOC)
**Business management:** Earned Value (EVM) · Cash Flow / S-curve · Milestones · Decision Log · Procurement · Resources / Capacity
**Intelligence:** AI Assistant · Change Impact (traceability) · Data Health
**Setup:** Report Pack (printable) · History & Backups · Settings · Help

## Engineering & business management

- **HAZOP worksheet** with standard **guidewords** (No/More/Less/Reverse/As-well-as/Part-of/Other-than/Early/Late…) and **process parameters** (Flow, Pressure, Temperature, Level…), auto risk = Severity × Likelihood.
- **Gage R&R (Measurement System Analysis)** — parts × operators × trials data grid; AIAG average-&-range method computes **%EV (repeatability), %AV (reproducibility), %GRR, %PV and ndc** with an Acceptable/Marginal/Unacceptable verdict and a contribution chart.
- **Calibration** (auto next-due + Overdue/Due-soon), Punch List, **SIL** (auto meets-target), Requirements Traceability, Document register, NCR, MOC.
- **Earned Value (EVM)** — BAC/PV/EV/AC + CPI/SPI/CV/SV/EAC/VAC.
- **Cash Flow / S-curve** — monthly planned vs actual with a cumulative S-curve chart.
- **Resources / Capacity** — capacity vs allocated hours with auto utilisation %, over-allocation flags and a utilisation chart.
- **Milestones** (baseline/forecast/actual slip), **Decision Log**, **Procurement**.
- Every register supports add/edit/delete, search, computed columns, audit logging and is included in snapshots/exports.

## Click-only by design

Every operational field in the app is a **dropdown or picker** — there is no free-text typing anywhere in the data views (Cases, all registers, Six Sigma, Gage R&R, cash flow, etc.). Problem statements, root causes, targets, costs, hours, measurements and engineering vocabulary are all chosen from curated lists; dates use a calendar picker. The only typed field in the whole app is the optional, secret AI API key (which cannot be a dropdown), and it is entirely optional.

## Highlights

- **Multi-project portfolio** — manage many projects in one workspace, switch from the sidebar, and see a roll-up of cases/critical/open/budget across all of them. Each project keeps its own cases, risks, budget, history and backups.
- **Branding** — set your company name, **logo** and **accent colour** in Settings; they appear in the sidebar and on reports.
- **Search, filter & sort** on the Cases list (text, status, priority, owner).
- **Kanban board** — drag cases between status columns to update them.
- **Pareto chart** (80/20) on the dashboard and **SPC control chart** (with UCL/LCL) on Six Sigma.
- **5-Whys** capture on each case and a one-click **A3 report** (printable).
- **Change history (audit log)** — timestamped record of every add/edit/delete.
- **Snapshots / restore points** — save a full copy and roll back anytime.
- **Share link** — copy a link that encodes the current project so a colleague can open it as a new project.
- **Optional AI** — add your own OpenAI-compatible API key in Settings to ask natural-language questions about your data. Without a key it falls back to the built-in offline advisor. Your key is stored only in your browser and sent only to the endpoint you configure.

## Files

```
index.html        app shell
css/styles.css    theme
js/calc.js        pure calculation engine (RPN, health, AI, timing, sigma) + controlled lists
js/store.js       state, localStorage persistence, seed data, derived views
js/charts.js      Chart.js helpers
js/ui.js          navigation, views, the case form, import/export
test.js           Node unit test for the engine        (run: node test.js)
smoke.js          jsdom full-app test (needs jsdom)     (run: npm i jsdom && node smoke.js)
```

## How calculations work (parity with the Excel workbook)

- **RPN** = Severity × Occurrence × Detection. Bands: ≥200 Critical, 100–199 High, 50–99 Medium, <50 Low.
- **Est. duration** = base by priority (Critical 7 / High 14 / Medium 30 / Low 45 days) stretched by RPN.
- **Sigma level** derived from DPMO (defects per million opportunities).
- **Stakeholder strategy** from the Influence × Interest grid.
- The **AI assistant** is a transparent rules engine (no external calls), so it works fully offline.
