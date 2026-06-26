# Audit Trail — el-dimensionering.html

Comprehensive verification/validation/QA mission against DS/HD 60364 (IEC 60364),
IEC 60228/60898/60909, EN 50588-1 and the in-repo trusted textbooks
(ELEKTROTEKNIK-8-BOOKS-STUDY.md, OPGAVESAMLING-STUDY.md). Branch:
`fix/audit-presentation-comma-mcb-harmonic-motor` (PR #92).

Format per correction: what was wrong / why / fix / modules / tests / outcome.

---

## Session: presentation fix + engine re-verification + coverage

### 1. fix(i18n): Danish genitive typo `Traføns` → `Trafoens`
- **What was wrong:** The exam quiz (`EXAM_QUIZ`) and scenario (`EXAM_SCEN`) content
  used the non-word `Traføns` (with `ø`) for the genitive of "trafo" (transformer).
- **Why wrong:** Danish genitive of *trafo* is *trafoens* (trafo → trafoen → trafoens).
  `Traføns` is a spelling error that undermines the professional Danish-language quality
  required for Authorized Installer material. Pure presentation; no calculation impact.
- **Fix:** Replaced all 5 occurrences with `Trafoens`/`trafoens`. Verified
  `grep 'Trafø[a-z]*'` now returns 0 matches.
- **Modules:** Authorization Exam Generator (quiz + scenarios `s1`, EV scenario).
- **Tests/outcome:** PARSE OK; 1613 → still passing; click-guard unchanged at 4.

### 2. Independent re-derivation of life-safety calculation paths (no code change — verification)
Per verification discipline, the safety-critical engine paths were re-derived from first
principles and compared to the live code (`da` defaults). **All matched exactly — nothing
flagged.** The already-correct life-safety constants were intentionally NOT touched.

| Check | Hand-derivation | App output | Standard |
|---|---|---|---|
| Trafo In (630 kVA/400 V) | S/(√3·U)=909.3 A | 909.3 A | 4-43 §433.1 |
| Trafo Ik (ek=5%, trafo-only) | In/ek=18 186 A | 18 187 A | 4-43 §434.5 (conservative) |
| Voltage drop 3-ph (80 A,50 m,50 mm²) | √3·I·L·(r·cosφ+x·sinφ)=2.655 V | 2.655 V | Annex G |
| Zs_max C16 (TN) | U0/Ia=230/160=1.4375 Ω | 1.4375 Ω | 4-41 §411 |
| Adiabatic min CSA (3 kA,0.1 s,k143) | √(I²t)/k=6.633 mm² | 6.634 mm² | 5-54 / 4-43 |
| TT RA_max (30 mA,50 V) | 50/IΔn=1666.7 Ω | 1666.7 Ω | 4-41 §411.5 |

Confirms prior audits (`task-audit-calculations`, `task-textbook-crossref-audit`,
`task-deep-textbook-audit`): engine formulas/constants/tables are correct and conservative.

### 3. test(safety): lock life-safety invariants into the regression suite
- **What/why:** The conservative behaviours above had no explicit boundary-value guards.
  Added 6 regression tests so any future regression in the dangerous direction fails CI.
- **Coverage added:**
  - `faultCalcIa` conservative upper-bound magnetic factors (B=5×, C=10×, D=20×).
  - `faultCalcTN` Zs·Ia ≤ U0 with **inclusive boundary** (= passes, just-over fails).
  - `faultCalcMinCSA` adiabatic monotonicity (higher Ik / longer t ⇒ larger CSA).
  - `faultCalcTT` RA·IΔn ≤ 50 V touch limit + just-over rejection.
  - `axVdrop` 3-phase √3 vs 1-phase factor-2.
  - `axIkTrafoSecondary` trafo-only Ik conservative + monotonic in ek (lower ek ⇒ higher Ik).
- **Outcome:** 1613 → **1619 passed, 0 failed**. PARSE OK. Click-guard = 4.

### Decision log
- **`extract_elektroteknik.py`** (pending working-tree edit): a tooling-only improvement to
  textbook-extraction noise filtering. Out of scope for PR #92 (app audit) and excluded by
  the staging rules (only `el-dimensionering.html`, `test-sld.js`, audit `.md`). Left
  uncommitted — preserved, not discarded.

### Acceptance gates (this session)
- `node test-sld.js` → **1619 passed, 0 failed**
- `grep -cE 'type="text"|<textarea'` → **4** (click-only UI intact)
- Parse check → **PARSE OK**

### Residual gaps / recommended next steps (presentation/UX backlog, not math)
- Inline trip curves (TCC) still partial: RCD/fuse/motor-protector/contactor modules.
- Deeper educational auto-analyzer narrative (IB→In→cable→ΔU→Ik→verdict per-step context).
- Manufacturer catalog refs + URLs on remaining device modules.
- Timed full-exam simulation countdown UI (generator exists; timer UI does not).
- Voltage-drop profile visualization along the cable run; AI curve analyzer.
- Note: "database / APIs / state management / synchronization" in the original mission are
  **N/A as backend** — this is a single static file; those concerns are in-memory/localStorage
  structures and were audited as client-side state.
