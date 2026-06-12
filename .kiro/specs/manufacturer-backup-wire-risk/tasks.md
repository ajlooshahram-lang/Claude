# Implementation Plan: Manufacturer Back-up, Wire Numbering & Risk Matrix

## Overview

This implementation adds three life-safety-critical modules (backup, wire, risk) to the existing single-file El-Dimensionering app (`el-dimensionering.html`). All code is embedded JavaScript/CSS/HTML within the existing architecture patterns (state variables, data constants, render functions, `renderModule()` switch). The implementation follows incremental steps, integrating each module into the existing navigation before building out its full functionality.

## Tasks

- [ ] 1. Register new modules in navigation and renderModule switch
  - [ ] 1.1 Add module navigation entries and renderModule cases
    - Add 'backup', 'wire', 'risk' to the `modules` object in `translations` with Danish/English labels: `{ da: 'Back-up', en: 'Back-up' }`, `{ da: 'Ledningsnumre', en: 'Wire Numbers' }`, `{ da: 'Risikovurdering', en: 'Risk Matrix' }`
    - Add navigation buttons/tabs in the nav bar HTML generation for the three new modules
    - Add `case 'backup': content = renderBackup(); break;`, `case 'wire': content = renderWire(); break;`, `case 'risk': content = renderRisk(); break;` in the `renderModule()` function
    - Create placeholder `renderBackup()`, `renderWire()`, `renderRisk()` functions returning a simple heading so navigation works immediately
    - _Requirements: 14.2, 14.3_

- [ ] 2. Implement Manufacturer Back-up Protection module (backup)
  - [ ] 2.1 Add BACKUP_TABLES data constant and backupState variable
    - Add the complete `BACKUP_TABLES` JavaScript constant containing all manufacturer-certified combinations for Schneider Electric, Siemens, and ABB exactly as specified in the design (hash map structure with `icuBackup`, `maxIn`, `conditions` per combination)
    - Add `backupState` variable: `{ manufacturer: null, upstreamType: null, upstreamDevice: null, downstreamType: null, downstreamDevice: null, downstreamRating: null, ikAtPoint: null, validatedResult: null }`
    - _Requirements: 1.1, 2.6, 15.1_

  - [ ] 2.2 Implement validateBackupCombination() core safety function
    - Implement the `validateBackupCombination(manufacturer, upstreamKey, downstreamKey, ikProspective)` function with all 5 safety rules from the design
    - Return `{ valid, icuBackup, source, warning }` object
    - Safety Rule 1: No manufacturer → reject with warning
    - Safety Rule 2: Upstream device not in table → reject
    - Safety Rule 3: Specific combination not type-tested → reject (NEVER interpolate)
    - Safety Rule 4: Ik > Icu_backup → reject as unsafe
    - Safety Rule 5: Ik > 90% of Icu_backup → valid with yellow warning
    - Wrap entire function in try/catch that returns `valid: false` on any exception (Conservative_Default)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2_

  - [ ]* 2.3 Write property test for back-up safety invariant
    - **Property 1: Back-up Safety Invariant** — For all valid=true results, icuBackup ≥ ikProspective
    - **Property 3: Threshold Classification Correctness** — The three zones (reject/warn/safe) are exhaustive and mutually exclusive
    - **Validates: Requirements 2.3, 2.4, 2.5, 3.1**

  - [ ]* 2.4 Write property test for table-only lookup (no interpolation)
    - **Property 2: Table-Only Lookup** — Any combination not in BACKUP_TABLES returns valid=false and icuBackup=null
    - **Validates: Requirements 2.2, 2.6**

  - [ ] 2.5 Implement renderBackup() UI with manufacturer selection and device filtering
    - Render clickable manufacturer buttons (Schneider Electric, Siemens, ABB) with neon sci-fi styling
    - When manufacturer selected: filter and display upstream device buttons from `BACKUP_TABLES[manufacturer].combinations` keys
    - When upstream selected: filter and display downstream device buttons from the selected upstream's combination keys
    - When no manufacturer selected: show warning "Vælg producent / Select manufacturer" and block validation
    - All selections via click-only buttons/dropdowns (zero keyboard input)
    - Integrate with short-circuit module to auto-retrieve `scState.ikMax` as the prospective Ik
    - Display validation result card: green "✅ GODKENDT" with Icu_backup value, yellow warning, or red "🚫 AFVIST" with explanation
    - When rejected: display list of valid alternative downstream devices for the selected upstream (one-click re-selection)
    - Bilingual labels (Danish primary / English secondary) following existing translation pattern
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 3.3, 3.4, 14.1, 14.3, 15.1_

  - [ ]* 2.6 Write property test for device filtering correctness
    - **Property 4: Device Filtering Correctness** — Displayed downstream options equal exactly the keys in BACKUP_TABLES for the selected upstream
    - **Validates: Requirements 1.2, 1.3**

- [ ] 3. Checkpoint - Verify back-up module
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement Wire Numbering / Terminal Plans module (wire)
  - [ ] 4.1 Add WIRE_SCHEME, TERMINAL_MANUFACTURERS constants and wireState variable
    - Add `WIRE_SCHEME` constant with `danish` and `iec60204` sub-objects containing panels, panelNames, circuitPrefix, conductors3phase, conductors1phase, and colors exactly as specified in design
    - Add `TERMINAL_MANUFACTURERS` constant with `phoenix` (Phoenix Contact CLIPLINE), `weidmuller` (Weidmüller), and `wago` (Wago TopJob S) terminal type catalogues with width, maxA, maxMM2, color, and type fields
    - Add `wireState` variable: `{ panelName: 'HT', numberingScheme: 'danish', terminalMfr: 'phoenix', circuits: [], terminalStrips: [], wireList: [], exportFormat: 'svg' }`
    - _Requirements: 5.1, 5.2, 5.3, 7.2_

  - [ ] 4.2 Implement generateWireNumbers() function
    - Implement `generateWireNumbers(loadList, panelName, scheme)` that iterates the load schedule and generates wire objects
    - For each consumer: determine circuit ID as `panelName + '-' + config.circuitPrefix + circuitNum`
    - For 3-phase circuits: generate 5 conductors (L1, L2, L3, N, PE)
    - For 1-phase circuits: generate 3 conductors (L, N, PE)
    - Each wire object: `{ wireNumber, circuit, conductor, color, crossSection, terminalFrom, terminalTo }`
    - Assign colors per DS/HD 60364-5-51 §514.5: PE=#228B22 with stripe #FFD700, N=#0066CC, L1/L=#8B4513, L2=#1a1a1a, L3=#808080
    - Ensure all wire numbers within a panel are unique (format guarantees this by construction)
    - When loadList is empty: return empty array (UI handles the empty-state message)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.4, 6.1, 6.2, 6.3, 6.4, 15.2_

  - [ ]* 4.3 Write property tests for wire number generation
    - **Property 5: Wire Number Uniqueness** — All wire numbers are pairwise distinct within a panel
    - **Property 6: Conductor Count per Phase Type** — 3-phase → 5 wires, 1-phase → 3 wires
    - **Property 7: Wire Number Format Compliance** — Danish matches `^[A-Z]{2}-K\d+-(?:L[123]?|N|PE)$`, IEC matches `^=[A-Z]\d+-W\d+-(?:L[123]?|N|PE)$`
    - **Property 8: Conductor Color Safety Invariant** — PE always green/yellow, N always blue, L1 always brown
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 5.4, 6.1, 6.2, 6.3**

  - [ ] 4.4 Implement selectTerminal() function
    - Implement `selectTerminal(mm2, conductor, manufacturer)` that selects the smallest adequate terminal from the manufacturer catalogue
    - Filter by conductor type: PE conductor → only PE-type terminals, N conductor → only N-type (or standard if N-type unavailable), phase → only standard terminals
    - Sort candidates by maxMM2 ascending, pick first that satisfies `maxMM2 >= mm2`
    - SAFETY: Never return a terminal with maxMM2 < cable cross-section (Conservative_Default)
    - Return null if no adequate terminal found (UI shows error)
    - _Requirements: 7.1, 7.3, 7.4, 7.5_

  - [ ]* 4.5 Write property tests for terminal selection
    - **Property 9: Terminal Sizing Safety Invariant** — Selected terminal maxMM2 ≥ conductor cross-section
    - **Property 10: Terminal Type Safety Invariant** — PE conductors always get PE terminals, N gets N terminals, phases never get PE/N terminals
    - **Validates: Requirements 7.1, 7.3, 7.4, 7.5**

  - [ ] 4.6 Implement renderWire() UI with scheme/panel/manufacturer selection and wire list display
    - Render clickable scheme toggle (Danish / IEC 60204-1) with neon styling
    - Render clickable panel name buttons (HT, UT, GT, FT, LT, ST for Danish; =M1, =M2, =E1, =E2 for IEC)
    - Render clickable terminal manufacturer selection (Phoenix Contact, Weidmüller, Wago)
    - "Generer / Generate" button that calls `generateWireNumbers()` with current loadList
    - Display generated wire list as a table with wire number, conductor, color swatch, cross-section
    - When loadList is empty: display "Tilføj forbrugere først / Add consumers first" with one-click navigation to load module
    - All interactions click-only (zero keyboard input)
    - Bilingual labels following existing translation pattern
    - _Requirements: 4.1, 4.6, 5.1, 5.2, 5.3, 14.1, 14.3, 15.2_

  - [ ] 4.7 Implement generateTerminalLayout() and renderTerminalSVG() for terminal strip visualization
    - Implement `generateTerminalLayout(wireList, manufacturer)` that groups wires into terminal strips and assigns terminal types using `selectTerminal()`
    - Implement `renderTerminalSVG(terminalStrips)` that produces inline SVG at A4 print dimensions
    - Render terminals with correct colors: PE terminals green, N terminals blue, phase terminals grey
    - Label each terminal position with wire number and circuit reference
    - Use only inline SVG styling (no external CSS or JavaScript dependencies)
    - "Eksporter PDF / Export PDF" button triggers SVG generation at A4 dimensions
    - _Requirements: 7.1, 7.2, 8.1, 8.2, 8.3, 8.4_

- [ ] 5. Checkpoint - Verify wire module
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement Installation Risk Matrix module (risk)
  - [ ] 6.1 Add RISK_CATEGORIES, RISK_MATRIX, AUTO_RISK_RULES constants and riskState variable
    - Add `RISK_CATEGORIES` constant with 6 categories (electric_shock, fire, overcurrent, overvoltage, electromagnetic, earth_fault) each with da/en labels, icon, clause, and subcategories
    - Add `PROBABILITY_LABELS` and `CONSEQUENCE_LABELS` in Danish and English
    - Add `RISK_MATRIX` 5×5 array mapping consequence×probability to green/yellow/red
    - Add `RISK_LEVELS` with color codes and action types
    - Add `AUTO_RISK_RULES` array with all 5 auto-detection rules from the design (shock_no_rcd, fire_overload, overcurrent_backup, overvoltage_no_spd, earth_fault_impedance)
    - Add `riskState` variable: `{ assessmentDate: null, installation: { type: null, environment: null, occupants: null }, risks: [], overrides: {}, mitigations: [] }`
    - _Requirements: 9.5, 10.1, 10.2, 11.4, 13.1, 13.2, 13.3_

  - [ ] 6.2 Implement calculateRiskLevel() and autoPopulateRisks() functions
    - Implement `calculateRiskLevel(probability, consequence)` using the 5×5 RISK_MATRIX lookup
    - Conservative rounding: when probability or consequence is ambiguous, round to higher (more dangerous) value
    - Implement `autoPopulateRisks()` that scans all module states (load, fuse, MCB, MCCB, cable, short-circuit, backup)
    - For each AUTO_RISK_RULE: evaluate condition in try/catch; on ANY error or exception → treat risk as triggered (Conservative_Default)
    - Sort results: red first, yellow second, green last
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3, 15.3_

  - [ ]* 6.3 Write property tests for risk matrix
    - **Property 11: Risk Matrix Monotonicity** — Increasing P or C never decreases the risk level (green < yellow < red)
    - **Property 12: Conservative Default Invariant** — Unknown/null/error states always trigger risk as present
    - **Property 13: Risk Sort Ordering** — Red entries always precede yellow, yellow precedes green
    - **Validates: Requirements 9.2, 9.3, 9.4, 10.3, 10.4**

  - [ ] 6.4 Implement generateMitigations() function
    - For each risk entry classified as yellow or red: generate a mitigation recommendation citing specific DS/HD 60364 clause
    - All mitigation text in bilingual format (Danish primary, English secondary)
    - Reference standards per category: DS/HD 60364-4-41 (shock), 4-42 (fire), 4-43 (overcurrent), 4-44 (overvoltage), 5-54 (earth faults)
    - _Requirements: 11.1, 11.2, 11.4_

  - [ ]* 6.5 Write property test for bilingual mitigation completeness
    - **Property 15: Bilingual Mitigation Completeness** — Every yellow/red risk has both `da` and `en` mitigation text plus a DS/HD 60364 clause reference
    - **Validates: Requirements 11.1, 11.2**

  - [ ] 6.6 Implement renderRisk() UI with installation context, clickable 5×5 grid, and risk list
    - Render installation context selection: clickable buttons for type (bolig/erhverv/industri/landbrug), environment (indoor dry/indoor wet/outdoor/hazardous), occupants (general/children/elderly/trained)
    - Render 5×5 click-grid for manual probability/consequence override with Danish/English axis labels
    - Auto-populate risk entries on module load via `autoPopulateRisks()`
    - Display risk entries sorted by severity (red → yellow → green) with traffic-light color coding, category icon, bilingual description
    - "Anbefalinger / Recommendations" button shows clause-specific mitigation actions grouped by risk category
    - All interactions click-only (zero keyboard input)
    - Neon sci-fi dark mode styling consistent with existing 16 modules
    - _Requirements: 9.1, 9.4, 9.5, 10.1, 10.2, 10.5, 11.3, 13.1, 13.2, 13.3, 13.4, 14.1, 14.3_

  - [ ] 6.7 Implement risk report export and project sign-off integration
    - "Eksporter rapport / Export report" button generates print-ready A4 risk assessment document
    - Include assessment date, installation type, environment classification, occupant category
    - When any risk is red (Unacceptable): block project sign-off in verification module with clear message identifying outstanding red risks
    - When export attempted with incomplete data: display yellow warning listing missing items with one-click navigation to each source module
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [ ]* 6.8 Write property test for red risk blocks sign-off
    - **Property 14: Red Risk Blocks Sign-off** — Any risk state with ≥1 red entry blocks project sign-off
    - **Validates: Requirements 12.2**

- [ ] 7. Checkpoint - Verify risk module
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Cross-module integration and state preservation
  - [ ] 8.1 Wire cross-module data flow and reactive updates
    - Backup module: auto-retrieve Ik from `scState.ikMax` without user re-entry
    - Wire module: auto-read loadList and cable cross-section data from existing state variables
    - Risk module: auto-read states from load, fuse, MCB, MCCB, cable, short-circuit, and backup modules
    - Ensure dependent modules reflect updated data upon next render (reactive data flow per existing pattern)
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [ ] 8.2 Implement state preservation across module navigation
    - Ensure `backupState`, `wireState`, `riskState` are declared at top-level scope (same pattern as existing module states)
    - Verify that switching between modules via navigation does NOT reset any module state
    - State variables persist in memory across render cycles (existing app pattern — no localStorage needed)
    - _Requirements: 14.4_

  - [ ]* 8.3 Write integration tests for cross-module data flow
    - Test: short-circuit result flows into backup validation automatically
    - Test: load schedule changes reflected in wire generation on next render
    - Test: backup validation result feeds into risk auto-population
    - Test: all module states survive navigation switching
    - **Property 16: State Preservation Across Navigation** — Navigate away and back preserves complete state
    - **Validates: Requirements 14.4, 15.1, 15.2, 15.3, 15.4**

- [ ] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major module
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All code is embedded in the single `el-dimensionering.html` file — no separate files
- The app follows existing patterns: top-level state variables, const data tables, render functions returning HTML strings, `renderModule()` switch routing
- Safety-critical: always err on the side of over-protection, never interpolate untested data
- 100% click-only UI: zero keyboard input fields in any module
- Bilingual: Danish primary language with English toggle, following existing translation pattern
- Neon sci-fi dark mode: consistent with existing 16 modules' aesthetic

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "4.1", "6.1"] },
    { "id": 2, "tasks": ["2.2", "4.2", "6.2"] },
    { "id": 3, "tasks": ["2.3", "2.4", "4.3", "4.4", "6.3", "6.4"] },
    { "id": 4, "tasks": ["2.5", "4.5", "4.6", "6.5", "6.6"] },
    { "id": 5, "tasks": ["2.6", "4.7", "6.7"] },
    { "id": 6, "tasks": ["6.8", "8.1"] },
    { "id": 7, "tasks": ["8.2"] },
    { "id": 8, "tasks": ["8.3"] }
  ]
}
```
