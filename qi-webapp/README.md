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

## Quality & accessibility

- **Click-only by design.** No `prompt()`/free-text dialogs anywhere — even creating or renaming a project uses a dropdown picker. The smoke test stubs `window.prompt` and asserts it never fires.
- **Drag-and-drop import.** Drop a JSON backup anywhere on the page to import it as a new project — a full-page overlay confirms the action.
- **Quick add anywhere.** A floating "+" button (bottom-right) opens the case form from any view; or press `n`.
- **Saved views.** Save the current Cases filter combo under a curated name ("Critical & high", "Blocked", "Watch list", …) and recall it from a dropdown in the toolbar.
- **Pagination & "Load more".** When the Cases list grows past the page size (50 / 100 / 200 / All), only the first batch renders, with a clear "Load next" / "Show all" footer.
- **Rename snapshots.** Snapshots get a meaningful label by picking from a curated list ("Pre-deployment", "End of sprint", "Quarterly review", …) — still click-only.
- **Pin important cases & register rows.** Click the pin column on the Cases list **or any engineering/business register** to keep your priorities at the top of every sort.
- **Sort any register by any column.** Click a column header to sort ascending; click again for descending; click a third time to clear. Pinned rows stay on top.
- **Bulk operations on registers.** Select rows with checkboxes; the bulk bar lets you delete many at once — same UX as the Cases list.
- **Compare snapshots.** On *History & Backups*, pick any two snapshots (or compare a snapshot to live data) and see exactly what was added, removed and field-by-field changed.
- **Sidebar collapse.** Squeeze the sidebar to icons-only with the `«` button — preference is saved per workspace.
- **Keyboard-friendly.** All buttons, nav items and dropdowns have visible `:focus-visible` outlines. Modals auto-focus their first field and **trap focus** so Tab/Shift+Tab cycle inside the dialog. Use `↑ / ↓` to move between sidebar items, and on Kanban cards use `←/→` to move a focused card across columns and `↑/↓` to move within a column.
- **Bookmarkable URLs.** Every view is reflected in the URL hash (e.g. `#kanban`); browser back/forward works; unknown hashes fall back to the dashboard without crashing.
- **Inline editing & bulk ops.** Status, owner and priority on the Cases list are dropdowns you can change in place. Tick the checkbox column to **select multiple** cases and use the bulk action bar to set status / owner / priority or delete in one click.
- **Soft-delete with undo.** When you delete a case, a **5-second toast lets you Undo** before the change is committed. Snapshots remain available for longer-term recovery.
- **First-run tour.** A 4-step tour shows you what the platform does on first run; skip or replay anytime from the Help view.
- **Friendly empty state.** When a project has no cases yet, the dashboard shows a clear call-to-action ("+ Add your first case") instead of zeros.
- **Storage-aware.** If your browser's localStorage fills up, the app surfaces a toast prompting you to export a JSON backup.
- **Print-ready.** Print or save-as-PDF (top-bar Print, or the dedicated **Report Pack** view): the print stylesheet hides the chrome, keeps tables and KPI cards from breaking across pages, repeats table headers, and forces colour fidelity for badges.
- **Screen-reader hints.** Active sidebar items expose `aria-current="page"`; modals are `role="dialog"`; icon-only topbar buttons carry `aria-label`s.
- **Themed charts.** Chart.js axis ticks, grid lines, legends and tooltips re-colour automatically when you toggle dark mode.
- **Verified.** 6/6 engine test suites and **185/185** jsdom smoke checks across 43 views, including regression checks for saved views, snapshot rename, FAB quick-add, pagination, register pinning, bulk-delete, sortable headers, row-patch perf, hash routing, focus trap, inline edit, bulk ops, undo toast, tour, print CSS, drag-and-drop import, snapshot diff, sidebar collapse, empty-state CTA and the storage-quota event.

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
