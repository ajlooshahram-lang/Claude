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
**Risk & Quality:** Risk Register · FMEA · Six Sigma (+ SPC I-MR) · Gage R&R (MSA) · Risk Matrix · X̄-R Control Chart · **Process Capability (Cp/Cpk)** · **NCR Pareto**
**Improve:** PDCA · Action Log
**People & Cost:** Stakeholders (RACI) · Budget
**Engineering registers:** HAZOP (guidewords & parameters) · Bow-tie diagram · Calibration · Punch List · SIL · Requirements Traceability · Document Register · NCR · MOC
**Business management:** Earned Value (EVM) · Cash Flow / S-curve · **Prioritisation (RICE/WSJF)** · Milestones · Decision Log · Procurement · Resources / Capacity · OKR Scorecard
**Intelligence:** AI Assistant · Change Impact (traceability) · KPI Scorecard (RAG) · Data Health
**Setup:** Report Pack (printable) · History & Backups · Settings · Help

## Engineering & business management

- **HAZOP worksheet** with standard **guidewords** (No/More/Less/Reverse/As-well-as/Part-of/Other-than/Early/Late…) and **process parameters** (Flow, Pressure, Temperature, Level…), auto risk = Severity × Likelihood.
- **Process Capability (Cp/Cpk + Pp/Ppk)** — pick USL/LSL from dropdowns; the app uses your X̄-R subgroup data to compute **Cp, Cpk, Pp, Ppk**, estimate **PPM out of spec**, and label the verdict (Excellent / Capable / Marginal / Not capable). Includes a histogram with USL/LSL/target reference lines.
- **Gage R&R (Measurement System Analysis)** — parts × operators × trials data grid; AIAG average-&-range method computes **%EV, %AV, %GRR, %PV and ndc** with an Acceptable/Marginal/Unacceptable verdict.
- **NCR Pareto** — three Pareto charts (severity, disposition, discipline) so you can see where non-conformances concentrate.
- **Calibration** (auto next-due + Overdue/Due-soon), Punch List, **SIL** (auto meets-target), Requirements Traceability, Document register, NCR, MOC.
- **Earned Value (EVM)** — BAC/PV/EV/AC + CPI/SPI/CV/SV/EAC/VAC.
- **Prioritisation (RICE / WSJF)** — switch between **RICE** = Reach × Impact × Confidence ÷ Effort and **WSJF** = (User-business value + Time-criticality + Risk-reduction) ÷ Job size. Inline dropdown editors re-rank cases live.
- **Cash Flow / S-curve** — monthly planned vs actual with a cumulative S-curve chart.
- **Resources / Capacity** — capacity vs allocated hours with auto utilisation %, over-allocation flags and a utilisation chart.
- **Milestones** (baseline/forecast/actual slip), **Decision Log**, **Procurement**.
- Every register supports add/edit/delete, search, computed columns, audit logging and is included in snapshots/exports.

## Click-only by design

Every operational field in the app is a **dropdown or picker** — there is no free-text typing anywhere in the data views. Problem statements, root causes, targets, costs, hours, measurements, **RICE/WSJF scores, Cp/Cpk spec limits**, and engineering vocabulary are all chosen from curated lists; dates use a calendar picker. The only typed field in the whole app is the optional, secret AI API key.

## Highlights

- **Multi-project portfolio** — many projects in one workspace; per-project isolation of cases/risks/budget/history/snapshots.
- **Branding** — company name, **logo** and **accent colour**.
- **Dark mode** — toggle from the topbar (◐) or press `t`; persisted per workspace.
- **Keyboard shortcuts** — `n` new case · `d` dashboard · `k` kanban · `p` portfolio · `r` report · `c` run checks · `t` toggle theme · `?` help · `Esc` close. The `?` icon in the topbar shows them anytime.
- **Run all checks** — topbar ✓ button shows a live KPI summary plus any Data Health issues, with a one-click jump to fix them.
- **Search, filter & sort** on the Cases list (status, priority, owner).
- **Kanban board** — drag cases between status columns.
- **Pareto** (80/20) on the dashboard, **SPC I-MR + X̄-R** control charts on Six Sigma, **Risk Matrix** heat-map.
- **5-Whys** capture and a one-click **A3 report**.
- **Change history (audit log)** and **Snapshots / restore points**.
- **Share link** — encode the current project into a URL.
- **Optional AI** (bring-your-own-key, OpenAI-compatible) with offline fallback.

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
