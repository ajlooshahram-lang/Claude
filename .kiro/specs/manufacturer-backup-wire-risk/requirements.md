# Requirements Document

## Introduction

This document specifies the requirements for three life-safety-critical modules of the El-Dimensionering app: **Manufacturer Back-up Protection** (backup), **Wire Numbering / Terminal Plans** (wire), and **Installation Risk Matrix** (risk). All requirements derive from the approved technical design and must comply with DS/HD 60364 series as the primary standard, with Sikkerhedsstyrelsen.dk as the regulatory enforcement authority. The app is a single-file HTML application with 100% click-only interaction, Danish primary language with English toggle, and a neon sci-fi dark mode aesthetic.

Safety is paramount: the system always errs on the side of over-protection, never interpolates untested data, and defaults to the most conservative assumption when state is uncertain.

## Glossary

- **Backup_Module**: The manufacturer back-up protection coordination module that validates upstream/downstream device combinations per DS/HD 60364-4-43 clause 434.3.1 and IEC 60947-2 Annex A
- **Wire_Module**: The wire numbering and terminal plan generation module that assigns wire numbers and produces terminal strip layouts per DS/HD 60364-5-51 §514.5, DS/EN 81346-2, and IEC 60204-1
- **Risk_Module**: The installation risk matrix module that assesses electrical safety risks per DS/HD 60364-1:2025 §131, Elsikkerhedsloven, and Arbejdstilsynet.dk
- **Back-up_Combination**: A specific pairing of an upstream protective device (NH fuse or MCCB) with a downstream device (MCB or MCCB) that has been physically type-tested and certified by the manufacturer per IEC 60947-2 Annex A
- **Icu_backup**: The conditional short-circuit breaking capacity of a downstream device when backed up by a specific upstream device, as certified through manufacturer type-testing [kA]
- **Ik**: The prospective short-circuit current at the installation point of the downstream device [kA]
- **Wire_Number**: A structured identifier for a conductor following the format [Panel]-[Circuit]-[Conductor], e.g. "HT-K1-L1"
- **Terminal_Strip**: A physical arrangement of terminal blocks on DIN rail used for wire connections in electrical panels
- **Risk_Level**: A traffic-light classification (green/yellow/red) derived from probability × consequence in a 5×5 matrix
- **Load_Schedule**: The existing loadList data structure containing all electrical consumers with phase, current, and circuit information
- **BACKUP_TABLES**: Embedded read-only JavaScript constant containing only manufacturer-certified back-up protection combination data
- **Conservative_Default**: A safety principle where any unknown, uncertain, or error state defaults to the most protective (worst-case) assumption
- **Click-Only_Interaction**: A UI constraint where all user input is provided exclusively through buttons, dropdowns, sliders, and click-grids — zero keyboard typing permitted

## Requirements

### Requirement 1: Manufacturer Selection and Device Filtering

**User Story:** As an electrician, I want to select a manufacturer and see only their certified device combinations, so that I never accidentally use an untested back-up coordination.

#### Acceptance Criteria

1. WHEN the user navigates to the Backup_Module, THE Backup_Module SHALL display clickable manufacturer buttons for Schneider Electric, Siemens, and ABB
2. WHEN the user clicks a manufacturer button, THE Backup_Module SHALL filter and display only upstream devices available in that manufacturer's BACKUP_TABLES
3. WHEN the user clicks an upstream device, THE Backup_Module SHALL filter and display only downstream devices that have type-tested combinations with the selected upstream device
4. WHEN no manufacturer is selected, THE Backup_Module SHALL display a warning "Vælg producent / Select manufacturer" and prevent any validation attempt
5. THE Backup_Module SHALL present all device selections as clickable buttons or dropdown menus with zero keyboard input required

### Requirement 2: Back-up Combination Validation

**User Story:** As an electrician, I want to validate that my upstream/downstream protective device combination is manufacturer-certified, so that I can ensure the installation safely handles prospective fault currents.

#### Acceptance Criteria

1. WHEN a complete combination (manufacturer, upstream, downstream) is selected, THE Backup_Module SHALL look up the combination in BACKUP_TABLES and return the certified Icu_backup value
2. WHEN the selected combination does not exist in BACKUP_TABLES, THE Backup_Module SHALL reject the combination with a red "🚫 AFVIST" status and the message "Kombination IKKE type-testet / Combination NOT type-tested"
3. WHEN the prospective Ik at the installation point exceeds the Icu_backup value, THE Backup_Module SHALL reject with a red error: "Ik > Icu_backup. Installation er IKKE sikker / Installation is NOT safe"
4. WHEN the prospective Ik exceeds 90% of Icu_backup but remains within the certified limit, THE Backup_Module SHALL display a yellow warning: "Ik er tæt på grænsen. Overvej større opstrømssikring / Ik is close to limit. Consider larger upstream device"
5. WHEN the prospective Ik is within 90% of the certified Icu_backup, THE Backup_Module SHALL display a green "✅ GODKENDT" status with the validated Icu_backup value and source reference
6. THE Backup_Module SHALL never interpolate, extrapolate, or calculate Icu_backup values — only exact table lookups from manufacturer-certified data are permitted

### Requirement 3: Back-up Validation Safety Invariants

**User Story:** As a safety authority inspector, I want the back-up validation to enforce strict safety rules, so that no unsafe combination can ever be approved by the system.

#### Acceptance Criteria

1. FOR ALL validated results where valid equals true, THE Backup_Module SHALL guarantee that Icu_backup is greater than or equal to the prospective Ik at the installation point
2. WHEN the condition evaluation encounters an error or exception, THE Backup_Module SHALL treat the combination as invalid (Conservative_Default)
3. THE Backup_Module SHALL integrate with the short-circuit module to automatically retrieve the prospective Ik value at the downstream device's installation point
4. WHEN a combination is rejected, THE Backup_Module SHALL display a list of valid alternative downstream devices for the selected upstream device, accessible via one-click selection

### Requirement 4: Wire Number Generation from Load Schedule

**User Story:** As an electrician, I want wire numbers auto-generated from my load schedule, so that I get consistent, standards-compliant conductor identification without manual entry.

#### Acceptance Criteria

1. WHEN the user clicks "Generer / Generate" in the Wire_Module, THE Wire_Module SHALL auto-generate wire numbers for all circuits in the Load_Schedule
2. THE Wire_Module SHALL produce wire numbers in the format [Panel]-[CircuitPrefix][Number]-[Conductor] following the selected numbering scheme
3. WHEN a circuit is 3-phase, THE Wire_Module SHALL generate five conductors: L1, L2, L3, N, and PE
4. WHEN a circuit is 1-phase, THE Wire_Module SHALL generate three conductors: L, N, and PE
5. FOR ALL generated wire numbers within a single panel, THE Wire_Module SHALL ensure every wire number is unique
6. WHEN the Load_Schedule is empty, THE Wire_Module SHALL display an informational message "Tilføj forbrugere først / Add consumers first" with a one-click navigation button to the load module

### Requirement 5: Wire Numbering Scheme Selection

**User Story:** As an electrician, I want to choose between Danish standard and IEC 60204-1 numbering schemes, so that I can match the convention required for my installation type.

#### Acceptance Criteria

1. THE Wire_Module SHALL provide clickable selection between Danish scheme (panels: HT, UT, GT, FT, LT, ST with prefix K) and IEC 60204-1 scheme (panels: =M1, =M2, =E1, =E2 with prefix -W)
2. WHEN the Danish scheme is selected, THE Wire_Module SHALL use panel designations per DS/EN 81346-2: HT (Hovedtavle), UT (Undertavle), GT (Gruppetavle), FT (Fordelingstavle), LT (Lystavle), ST (Styretavle)
3. WHEN the IEC 60204-1 scheme is selected, THE Wire_Module SHALL use machine panel designations: =M1, =M2, =E1, =E2
4. THE Wire_Module SHALL apply Danish conductor color coding per DS/HD 60364-5-51 §514.5: PE is green/yellow, N is blue, L1 is brown, L2 is black, L3 is grey

### Requirement 6: Wire Color Coding Safety Invariant

**User Story:** As a safety inspector, I want conductor colors to always comply with the standard, so that misidentification leading to electric shock is prevented.

#### Acceptance Criteria

1. FOR ALL generated wires where the conductor is PE, THE Wire_Module SHALL assign the color green/yellow (hex #228B22 with stripe #FFD700)
2. FOR ALL generated wires where the conductor is N, THE Wire_Module SHALL assign the color blue (hex #0066CC)
3. FOR ALL generated wires where the conductor is L1 or L, THE Wire_Module SHALL assign the color brown (hex #8B4513)
4. THE Wire_Module SHALL never allow override or modification of safety conductor colors (PE and N)

### Requirement 7: Terminal Strip Layout and Selection

**User Story:** As a panel builder, I want terminal strips auto-sized from my cable data, so that every terminal is guaranteed adequate for the conductor cross-section.

#### Acceptance Criteria

1. WHEN generating the terminal layout, THE Wire_Module SHALL auto-select the smallest terminal type from the chosen manufacturer whose maxMM2 rating is greater than or equal to the cable cross-section
2. THE Wire_Module SHALL provide clickable manufacturer selection between Phoenix Contact CLIPLINE, Weidmüller, and Wago TopJob S
3. WHEN selecting PE terminals, THE Wire_Module SHALL use only dedicated PE-type terminals (green colored) from the manufacturer catalogue
4. WHEN selecting N terminals, THE Wire_Module SHALL use only dedicated N-type terminals (blue colored) where available in the manufacturer catalogue
5. THE Wire_Module SHALL never select a terminal whose maxMM2 rating is less than the conductor cross-section (Conservative_Default)

### Requirement 8: Terminal Strip SVG Export

**User Story:** As a panel builder, I want a print-ready terminal strip diagram, so that I can include it in my panel documentation per Danish regulatory requirements.

#### Acceptance Criteria

1. WHEN the user clicks "Eksporter PDF / Export PDF", THE Wire_Module SHALL generate an SVG terminal strip layout at A4 print dimensions
2. THE Wire_Module SHALL render terminals with correct colors: PE terminals in green, N terminals in blue, phase terminals in manufacturer standard (grey)
3. THE Wire_Module SHALL label each terminal position with its wire number and circuit reference
4. THE Wire_Module SHALL use only inline SVG styling with no external CSS or JavaScript dependencies

### Requirement 9: Risk Matrix Auto-Population

**User Story:** As an electrician, I want the risk assessment auto-populated from my current design, so that potential safety issues are immediately visible without manual entry.

#### Acceptance Criteria

1. WHEN the user navigates to the Risk_Module, THE Risk_Module SHALL scan all existing module states (load, fuse, MCB, MCCB, cable, short-circuit, backup) and auto-populate risk entries
2. WHEN any protection state is unknown or cannot be determined, THE Risk_Module SHALL default to risk present (Conservative_Default: assume the worst case)
3. WHEN an auto-populate condition evaluation throws an error, THE Risk_Module SHALL treat the risk as triggered (Conservative_Default)
4. THE Risk_Module SHALL sort all risk entries with red (unacceptable) items first, yellow (mitigate) second, and green (acceptable) last
5. THE Risk_Module SHALL auto-detect the following risk conditions at minimum: missing RCD 30mA protection, cable overloading (Ib > Iz), insufficient breaking capacity (Icu < Ik), missing SPD, and unverified fault loop impedance

### Requirement 10: Risk Level Calculation

**User Story:** As an electrician, I want a clear 5×5 risk matrix with traffic-light classification, so that I can immediately see which risks require mandatory action.

#### Acceptance Criteria

1. THE Risk_Module SHALL calculate risk levels using a 5×5 matrix with probability (1-5) on one axis and consequence (1-5) on the other axis
2. THE Risk_Module SHALL classify risk levels as: green (Acceptabel/Acceptable — no action), yellow (Reducér risiko/Mitigate — reduce risk), red (Uacceptabel/Unacceptable — MUST fix)
3. WHEN probability or consequence is ambiguous, THE Risk_Module SHALL round to the higher (more dangerous) classification (Conservative_Default)
4. FOR ALL risk assessments where probability P2 ≥ P1 and consequence C2 ≥ C1, THE Risk_Module SHALL ensure riskLevel(P2, C2) is greater than or equal to riskLevel(P1, C1) (monotonicity property)
5. THE Risk_Module SHALL present the 5×5 grid as a fully clickable interface for manual probability/consequence override with zero keyboard input

### Requirement 11: Risk Mitigation Recommendations

**User Story:** As an electrician, I want specific DS/HD 60364 clause-referenced mitigation recommendations, so that I know exactly which standard requirement to follow for each risk.

#### Acceptance Criteria

1. WHEN a risk entry is classified as yellow or red, THE Risk_Module SHALL generate a mitigation recommendation citing the specific DS/HD 60364 clause
2. THE Risk_Module SHALL display all mitigation text in bilingual format (Danish primary, English secondary)
3. WHEN the user clicks "Anbefalinger / Recommendations", THE Risk_Module SHALL display all applicable mitigation actions grouped by risk category
4. THE Risk_Module SHALL reference the following standards for mitigations: DS/HD 60364-4-41 for electric shock, DS/HD 60364-4-42 for fire, DS/HD 60364-4-43 for overcurrent, DS/HD 60364-4-44 for overvoltage, DS/HD 60364-5-54 for earth faults

### Requirement 12: Risk Report Export and Project Sign-off Integration

**User Story:** As an electrician, I want a print-ready risk assessment report, so that I can submit it for regulatory documentation per Elsikkerhedsloven and Sikkerhedsstyrelsen requirements.

#### Acceptance Criteria

1. WHEN the user clicks "Eksporter rapport / Export report", THE Risk_Module SHALL generate a print-ready A4 risk assessment document
2. WHEN any risk entry is classified as red (Unacceptable), THE Risk_Module SHALL block project sign-off in the verification module with a clear message identifying the outstanding red risks
3. THE Risk_Module SHALL include the assessment date, installation type, environment classification, and occupant category in the exported report
4. WHEN the user attempts to export with incomplete data, THE Risk_Module SHALL display a yellow warning listing missing items with one-click navigation links to each source module

### Requirement 13: Installation Context Selection

**User Story:** As an electrician, I want to classify my installation type and environment, so that the risk assessment applies the correct risk assumptions for my specific project.

#### Acceptance Criteria

1. THE Risk_Module SHALL provide clickable selection for installation type: bolig (residential), erhverv (commercial), industri (industrial), landbrug (agricultural)
2. THE Risk_Module SHALL provide clickable selection for environment: indoor dry, indoor wet, outdoor, hazardous
3. THE Risk_Module SHALL provide clickable selection for occupant type: general public, children, elderly, trained personnel
4. THE Risk_Module SHALL present all selections as buttons or dropdown menus with zero keyboard input required

### Requirement 14: Bilingual Display and Module Navigation

**User Story:** As a Danish or international electrician, I want all safety messages in both Danish and English with correct neon sci-fi styling, so that critical information is never misunderstood due to language barriers.

#### Acceptance Criteria

1. THE Backup_Module, Wire_Module, and Risk_Module SHALL display all labels, warnings, and status messages in bilingual format with Danish as the primary language and English as the toggle secondary
2. THE Backup_Module, Wire_Module, and Risk_Module SHALL integrate into the existing navigation bar as clickable module tabs: "Back-up", "Ledningsnumre / Wire Numbers", "Risikovurdering / Risk Matrix"
3. THE Backup_Module, Wire_Module, and Risk_Module SHALL maintain the existing neon sci-fi dark mode aesthetic consistent with the 16 existing modules
4. THE Backup_Module, Wire_Module, and Risk_Module SHALL preserve all module state when the user switches between modules (no data loss on navigation)

### Requirement 15: Cross-Module Data Integration

**User Story:** As an electrician, I want the three new modules to automatically use data from existing modules, so that I never need to re-enter information already provided.

#### Acceptance Criteria

1. THE Backup_Module SHALL automatically retrieve the prospective Ik from the short-circuit module without requiring user re-entry
2. THE Wire_Module SHALL automatically read the Load_Schedule including phase type and cable cross-section data without requiring user re-entry
3. THE Risk_Module SHALL automatically read states from load, fuse, MCB, MCCB, cable, short-circuit, and backup modules for risk auto-population
4. WHEN upstream data changes in a source module, THE dependent modules SHALL reflect the updated data upon next render (reactive data flow)

