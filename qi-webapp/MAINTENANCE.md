# QI Platform — Maintenance & Backup Plan

This document explains, in plain language, **two things the owner asked for**:

1. **A maintenance plan** — how the app at the *same link* can be updated and fixed
   for new issues **without damaging the projects already saved inside it**.
2. **A backup plan** — your insurance for every saved project.

It applies to the single-file app (`dist/STP-Application.html`) and to the
server-backed multi-user deployment. Where they differ, both are described.

---

## 1. Where your saved projects actually live

- The single-file app saves **all your projects** in your browser under one key:
  `qi_workspace_v9` (browser **localStorage**).
- localStorage is tied to the **origin** (the web address the page was opened
  from), **not** to the version of the HTML. So when a *new* version of the app
  is opened at the **same address**, it reads the **same saved data**.
- A numeric **data-format version** (`schemaVersion`, currently **10**) is stored
  with your data so any future app build knows how to read older saves.

> **Golden rule for safe updates:** keep the **address (origin) the same** and
> keep the **storage key the same** (`qi_workspace_v9`). Do that and updating the
> app **never** erases saved projects.

### Important hosting note (read this once)
- **Best practice — host at a fixed URL** (e.g. GitHub Pages, an intranet server,
  or the server-backed deployment). Every update replaces the file at the *same*
  address, so the browser keeps the same localStorage and **all projects survive
  automatically**.
- **Opening the downloaded file directly (`file://…`)** is fine for a quick look,
  but browsers may treat each downloaded copy as a *different* origin. If you rely
  on `file://`, **always take a Full Backup before switching files** (see §3) and
  restore it into the new file. This is the only situation where data won't carry
  over by itself — and the Full Backup completely covers it.

---

## 2. How we ship updates without breaking saved data

### 2.1 The compatibility contract (the rule we never break)
When fixing bugs or adding features, data migrations are **forward-only and
additive**:

- ✅ **Allowed:** add a new field with a sensible default; add a new module/register;
  add a new project property.
- ❌ **Never:** rename or delete an existing field in a destructive way, or change
  the storage key, without writing a migration that converts old saves first.
- All loading goes through `normalize()` / `normalizeWs()` which **fill in any
  missing fields with defaults** — so an *old* save always opens cleanly in a
  *new* build. After normalising, the data is stamped with the current
  `schemaVersion`.

If a future change ever *must* alter the shape of saved data, the procedure is:
1. **Bump `SCHEMA_VERSION`.**
2. In `normalizeWs()`, detect `w.schemaVersion < N` and **convert** the old shape
   to the new one (keeping the user's values), then stamp the new version.
3. Add a smoke test that loads a sample *old* save and asserts it migrates
   without loss. (See `smoke.js` Step 120.)

### 2.2 Release checklist (run for EVERY update to the link)
No change ships unless all of these pass (the user can't see the terminal, so the
results are always surfaced in chat):

1. `node --check` on every changed `js/*.js` (syntax).
2. `node smoke.js` — full headless suite (**735+ assertions**) all green.
3. `node verify-standalone.js` — standalone boot checks all green.
4. `npm audit` — **0 vulnerabilities** (and the server package too).
5. `npm run build:standalone` — rebuild the single file; confirm the **build
   stamp** in the file matches the source commit.
6. Commit **source first**, then rebuild `dist`, then commit `dist` (so the stamp
   matches), then push.
7. Tell the user the **direct download link** and the **build stamp** to verify.

### 2.3 Rolling back a bad update (safety net)
- Every build is committed to git and stamped (e.g. `864b1ff`). If an update
  misbehaves, re-publish the **previous** build — your saved projects are
  untouched because they live in localStorage, independent of the HTML version.
- Server-backed deployment: `git revert` the bad commit and redeploy
  (`./deploy.sh --tls`); the database is separate and unaffected.

---

## 3. Backup plan (your insurance for saved files)

The app has **three layers** of protection. Use all three.

### Layer 1 — Automatic in-app snapshots (restore points)
- The app keeps up to **25 snapshots** per project (under **History & Backups**).
- A snapshot is taken **automatically before a restore**, so you can always undo.
- Use **Take snapshot** before any big change. Rollback is one click.

### Layer 2 — Full Backup of EVERYTHING (the key insurance) ⭐
- **Settings → Data & backups → “⭳ Back up EVERYTHING (all projects)”.**
- Downloads **one file** containing **every project** plus your branding, named
  `qi-platform-FULL-backup-YYYY-MM-DD.json`.
- The file is **safe to share/store** — your API key is deliberately **stripped
  out**, so no secret ever leaves in a backup.
- **Restore:** “⭱ Restore from a full backup” → pick the file. Restored projects
  are **added alongside** what you already have — **nothing is overwritten or
  deleted**. (You can also just drag-and-drop a backup file onto the app.)

### Layer 3 — Per-project / spreadsheet exports
- **Export this project only** (one project as JSON) and **Export cases CSV** (for
  Excel) are available for sharing a single project or feeding other tools.

### Recommended backup routine (the 3-2-1 rule)
- **Frequency:** take a **Full Backup weekly**, and **before every app update**.
- **3 copies, 2 places, 1 offsite:** keep the latest Full Backup in **two**
  locations (e.g. your computer **and** a cloud drive / email to yourself), and
  keep at least one **older** copy too (in case a problem isn't noticed for a
  while).
- **Name them by date** (the file already does this) so the newest is obvious.
- **Test a restore** occasionally: open the app in a fresh browser profile and
  restore your latest Full Backup to confirm it works end-to-end.

### Server-backed deployment (multi-user)
- Data lives in the server database, not the browser. Schedule **automated daily
  database backups** (dump + offsite copy) and keep **30 days** of history.
- The Full Backup export above still works per-user as an extra portable copy.
- Restores are validated against the same `schemaVersion` contract.

---

## 4. Quick reference

| I want to… | Do this |
|---|---|
| Update the app for a new fix | Publish the new build at the **same URL**; data persists. Take a Full Backup first if using `file://`. |
| Make sure I never lose work | **Settings → Back up EVERYTHING**, weekly + before updates; store in 2 places. |
| Undo a recent change | **History & Backups → restore a snapshot**. |
| Move everything to a new computer/browser | Full Backup on the old one → **Restore** on the new one. |
| Recover after a problem | Re-publish the previous build (data is safe), or **Restore** your latest Full Backup. |
| Share one project | **Export this project only** (JSON) or **Export cases CSV**. |

**Storage key:** `qi_workspace_v9` · **Data format version:** `schemaVersion = 10`
(forward-only, additive migrations). Updating the app does **not** change these.
