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

Dashboard · Cases (Master) · PM Tasks · Timeline (Gantt) · Risk Register · FMEA ·
Six Sigma · PDCA · Action Log · Stakeholders (RACI) · Budget · AI Assistant ·
Data Health · Settings · Help

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
