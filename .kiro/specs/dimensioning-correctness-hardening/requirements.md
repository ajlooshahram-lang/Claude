# Requirements Document

## Introduction

This feature delivers **Tier 1 Safety-Correctness Hardening** for the `el-dimensionering` Danish
electrical dimensioning application (single-file `el-dimensionering.html`). The application is
life-safety-critical: it advises on conductor sizing and protective-device selection for electrical
installations governed by DS/HD 60364 (the Danish adoption of IEC 60364), under the authority of
Sikkerhedsstyrelsen.

A code review identified four correctness gaps that can cause the application to present an
installation as SAFE when DS/HD 60364 would reject it:

1. **Derating is display-only.** The Cable module computes a corrected ampacity
   (`correctedIz = baseIz × kInstall × kTemp × kGroup`) for display, but the auto-recommendation
   function `recommendCables(ib, material)` and parts of the quality-index check
   (`runQiValidation`) coordinate against the **raw, uncorrected** table ampacity
   (`officialIz`). A cable that is overloaded after derating can therefore be approved.

2. **Missing overload rule.** The application verifies `IB ≤ In ≤ Iz` but not the second condition
   of DS/HD 60364-4-43 §433.1, namely `I₂ ≤ 1,45 × Iz`. For gG fuses `I₂ = 1,6 × In`, so a
   combination that passes `In ≤ Iz` can still fail the overload check.

3. **No adiabatic short-circuit check.** Nothing verifies that the conductor survives the fault
   energy until the protective device clears (`k²·S² ≥ I²t`, DS/HD 60364-4-43 §434.5.2).

4. **Zs is only flagged, never computed.** The Risk module flags "unverified Zs" but no module
   computes the maximum permitted earth-fault-loop impedance for the chosen device and compares it
   to the actual loop impedance (DS/HD 60364-4-41 §411).

This document specifies the correctness requirements to close these gaps. Because the outcomes are
safety verdicts, every requirement is written with explicit, testable pass/fail conditions and, where
applicable, stated correctness properties (invariants). The governing principle throughout is
**conservatism**: when any input is unknown, the application must assume the worst case and must
never present a PASS when the data is insufficient to prove safety.

This feature changes calculation and verdict logic only. It must remain consistent with the existing
application: 100% click-only interaction (no typing), Danish-primary with English toggle, and the
neon sci-fi dark-mode visual style.

## Glossary

- **Application**: The `el-dimensionering` single-file web application (`el-dimensionering.html`).
- **DS/HD 60364**: The Danish harmonized adoption of IEC 60364, "Low-voltage electrical
  installations"; the governing standard. Cited parts include 60364-4-41, 60364-4-43, and
  60364-5-52.
- **IB**: Design (load) current of the circuit, in amperes (A). Produced by the load module
  (`calcIB`).
- **In**: Rated current of the protective device (fuse / MCB / MCCB), in amperes (A).
- **I2 (I₂)**: The conventional tripping/operating current of a protective device — the current that
  guarantees operation within the conventional time. Defined per device type:
  for a gG fuse `I₂ = 1,6 × In`; for an MCB to IEC 60898 and an MCCB to IEC 60947-2 `I₂ = 1,45 × In`.
- **Base_Iz**: The raw tabulated continuous current-carrying capacity of a conductor from the
  DS/HD 60364-5-52 reference tables, before any correction, in amperes (A). In code this is
  `baseIz` / `officialIz(product)`.
- **Derated_Iz**: The corrected continuous current-carrying capacity,
  `Derated_Iz = Base_Iz × Ca × Cg × Cs × k_install`, in amperes (A). In code this is `correctedIz`.
- **Correction_Factor**: Any multiplier reducing or adjusting Base_Iz. Specifically:
  - **Ca**: Ambient-temperature correction factor (code: `TEMP_FACTORS`).
  - **Cg**: Grouping correction factor (code: `GROUP_FACTORS`).
  - **Cs**: Soil-thermal-resistivity correction factor (for buried installations).
  - **k_install**: Installation-method factor (code: `INSTALL_METHODS`).
- **Ampacity_Coordination**: The verdict that `IB ≤ In ≤ Derated_Iz` holds (DS/HD 60364-4-43 §433.1,
  first condition).
- **Overload_Coordination**: The verdict that `I₂ ≤ 1,45 × Derated_Iz` holds (DS/HD 60364-4-43
  §433.1, second condition).
- **k (adiabatic constant)**: The material/insulation constant used in the adiabatic equation, in
  A·s^½/mm². Reference values (DS/HD 60364-4-43 Table 43A / 43.1):
  Cu/PVC = 115, Cu/XLPE(EPR) = 143, Al/PVC = 76, Al/XLPE(EPR) = 94.
- **S**: Conductor cross-sectional area, in mm².
- **I²t**: The thermal let-through energy of the prospective short-circuit, expressed as
  `Isc² × t_clear` (or the device's stated let-through energy), in A²·s.
- **t_clear**: The clearing (disconnection) time of the protective device for the prospective fault
  current, in seconds (s).
- **Isc**: Prospective short-circuit current at the relevant point, in amperes (A). Provided by the
  short-circuit module.
- **Adiabatic_Withstand**: The verdict that the conductor survives the fault energy, `k²·S² ≥ I²t`,
  equivalently `S ≥ √(I²t) / k` (DS/HD 60364-4-43 §434.5.2).
- **Zs**: Actual earth-fault-loop impedance of the circuit, in ohms (Ω).
- **Zs_max**: Maximum permitted earth-fault-loop impedance, `Zs_max = U₀ / Ia`, in ohms (Ω).
- **U0 (U₀)**: Nominal line-to-earth voltage of the supply, in volts (V); 230 V for the standard
  Danish 230/400 V system.
- **Ia**: The current causing automatic operation of the protective device within the required
  disconnection time, in amperes (A).
- **Disconnection_Time**: The maximum permitted automatic disconnection time. In a TN system:
  0,4 s for final circuits with In ≤ 32 A; 5 s for distribution circuits and final circuits with
  In > 32 A (DS/HD 60364-4-41 §411.3.2.2 / §411.3.2.3).
- **System_Type**: The earthing-system arrangement of the installation. Relevant values: **TN**
  (TN-C, TN-S, TN-C-S) and **TT**.
- **RCD**: Residual current device, used for fault protection where the impedance condition cannot
  be met (notably TT systems), characterized by rated residual operating current IΔn.
- **Zs_Verification**: The verdict that `Zs ≤ Zs_max` (TN), or that an RCD satisfies
  `Zs × IΔn ≤ 50 V` (TT) (DS/HD 60364-4-41 §411.4 / §411.5).
- **Cable_Engine**: The internal logic that selects and recommends conductors, including
  `recommendCables` and `officialIz`.
- **Coordination_Validator**: The internal logic that evaluates coordination verdicts, including
  `runQiValidation`.
- **Verify_Module**: The existing self-test/verification view (`renderVerify` / `runSelfTests`).
- **QI_Index**: The Quality Index summary produced by `runQiValidation`, scoring coordination
  across modules.
- **Risk_Matrix**: The existing Risk module (`renderRisk` / `autoPopulateRisks`) that aggregates
  installation risks.
- **Conservative_Default**: A default value or assumption chosen to produce the most pessimistic
  (safest) verdict when an input is unknown or ambiguous.
- **Verdict**: A discrete result presented to the user, one of PASS (OK), FAIL, or
  INSUFFICIENT_DATA, accompanied by the governing DS/HD 60364 clause.

## Requirements

### Requirement 1: Derated ampacity drives every coordination verdict

**User Story:** As an electrical designer, I want every ampacity verdict to use the derated
(corrected) cable capacity, so that the Application never approves a conductor that is overloaded
after temperature, grouping, soil, and installation-method derating.

#### Acceptance Criteria

1. WHEN the Cable_Engine evaluates a candidate conductor in `recommendCables`, THE Cable_Engine
   SHALL compare the required protective-device rating against Derated_Iz rather than Base_Iz.
2. WHEN the Coordination_Validator evaluates the ampacity condition, THE Coordination_Validator
   SHALL use Derated_Iz as the upper bound for `In ≤ Iz`.
3. WHERE any cross-module check compares device rating to conductor capacity, THE Application SHALL
   use Derated_Iz as the conductor capacity value.
4. WHEN Derated_Iz is computed, THE Application SHALL compute it as
   `Derated_Iz = Base_Iz × Ca × Cg × Cs × k_install` using the active correction-factor selections,
   substituting a default value of 1.0 for any correction factor not explicitly selected, and
   rounding the result down (toward zero) to two decimal places in Amperes.
5. WHEN a candidate conductor's Derated_Iz is less than the protective-device rating In, THE
   Cable_Engine SHALL exclude that conductor from the recommended results.
6. WHEN a conductor is selected, THE Application SHALL display Base_Iz and Derated_Iz in Amperes to
   two decimal places together with the active total correction factor (Ca × Cg × Cs × k_install)
   expressed to three decimal places.
7. WHEN Derated_Iz is presented as the basis of an ampacity verdict, THE Application SHALL cite
   DS/HD 60364-5-52 §523.
8. IF any active correction factor (Ca, Cg, Cs, or k_install) is non-numeric, less than 0.01, or
   greater than 1.0, THEN THE Application SHALL reject the Derated_Iz computation, retain the
   previously displayed ampacity verdict unchanged, and present an error indication identifying the
   invalid correction factor.
9. IF no candidate conductor has a Derated_Iz greater than or equal to the protective-device rating
   In, THEN THE Cable_Engine SHALL return an empty recommendation set and present an indication that
   no compliant conductor was found.

**Correctness properties (testable invariants):**
- For all candidate conductors C returned by `recommendCables(IB)`, `Derated_Iz(C) ≥ In`, where In
  is the smallest standard device rating with `In ≥ IB`.
- For all conductors, `Derated_Iz ≤ Base_Iz` whenever the total correction factor is `≤ 1`
  (monotonicity: derating never increases capacity).
- A conductor that passes Ampacity_Coordination against Base_Iz but whose `Derated_Iz < In` MUST
  produce a FAIL verdict (regression guard against the display-only bug).

### Requirement 2: Conservative handling of unknown correction factors

**User Story:** As a safety-conscious designer, I want the Application to assume the worst case when
a correction factor is not specified, so that an incomplete entry can never inflate the apparent
cable capacity.

#### Acceptance Criteria

1. IF a required Correction_Factor (Ca, Cg, Cs, or k_install) is not selected by the user, THEN THE
   Application SHALL substitute the most reducing (numerically lowest) value defined for that
   category in DS/HD 60364-5-52 Annex B and use that substituted value when computing Derated_Iz.
2. IF the installation method is buried AND the Cs soil-thermal-resistivity factor is not selected
   by the user, THEN THE Application SHALL substitute the most reducing (numerically lowest) Cs
   value defined for buried installations in DS/HD 60364-5-52 Annex B when computing Derated_Iz.
3. WHEN the Application substitutes a conservative default value for any Correction_Factor instead
   of a user-selected value, THE Application SHALL display a persistent visible indicator adjacent
   to that factor that distinguishes it from user-selected factors and remains displayed until the
   user selects a value for that factor.
4. WHEN the user selects a value for a Correction_Factor that was previously defaulted
   conservatively, THE Application SHALL recompute Derated_Iz using the selected value and remove
   the conservative-default indicator for that factor.
5. THE Application SHALL constrain every conservatively defaulted Correction_Factor to a value that
   is less than or equal to 1,0 and less than or equal to every user-selectable value for that
   category in DS/HD 60364-5-52 Annex B, such that a defaulted factor never increases Derated_Iz; a
   Correction_Factor may exceed 1,0 only when a value greater than 1,0 has been explicitly selected
   by the user.

**Correctness properties (testable invariants):**
- For any combination of selected and unselected factors, the resulting Derated_Iz is less than or
  equal to the Derated_Iz that would result if any single unselected factor were instead chosen at
  its most favourable (largest) value.

### Requirement 3: Overload coordination — I₂ ≤ 1,45 × Iz

**User Story:** As an electrical designer, I want the Application to verify the device conventional
tripping current against 1,45 times the derated cable capacity, so that the second condition of the
overload-protection rule is enforced and not just `In ≤ Iz`.

#### Acceptance Criteria

1. WHEN a protective device and a conductor are both selected, THE Coordination_Validator SHALL
   compute `I₂` from the device type: `I₂ = 1,6 × In` for a gG fuse, and `I₂ = 1,45 × In` for an
   MCB (IEC 60898) or MCCB (IEC 60947-2).
2. WHEN `I₂` and Derated_Iz are both available and greater than 0, THE Coordination_Validator SHALL
   evaluate the Overload_Coordination condition `I₂ ≤ 1,45 × Derated_Iz`, comparing both sides
   expressed in amperes rounded to 2 decimal places, and SHALL produce a PASS Verdict when the
   condition holds (including the equality case `I₂ = 1,45 × Derated_Iz`) or a FAIL Verdict
   otherwise.
3. IF `I₂ > 1,45 × Derated_Iz`, THEN THE Coordination_Validator SHALL produce a FAIL Verdict and
   SHALL recommend a larger conductor cross-section or a device with a lower I₂ factor.
4. WHEN the Overload_Coordination Verdict is produced, THE Application SHALL display the computed
   `I₂`, the limit `1,45 × Derated_Iz`, and the resulting Verdict for the selected device/conductor
   pair, with all current values shown in amperes rounded to 2 decimal places.
5. WHEN the device type cannot be determined, THE Coordination_Validator SHALL assume the highest
   applicable I₂ factor (`1,6 × In`) when evaluating Overload_Coordination and SHALL indicate that a
   conservative default I₂ factor was applied.
6. WHEN the Overload_Coordination Verdict is presented, THE Application SHALL cite
   DS/HD 60364-4-43 §433.1.
7. IF the device rated current `In` or Derated_Iz is unavailable, zero, or negative, THEN THE
   Coordination_Validator SHALL NOT produce a PASS or FAIL Overload_Coordination Verdict and SHALL
   produce an INSUFFICIENT_DATA Verdict with an indication that the Overload_Coordination condition
   could not be evaluated.

**Correctness properties (testable invariants):**
- For a gG fuse, there exists a region where `In ≤ Derated_Iz` holds but `I₂ ≤ 1,45 × Derated_Iz`
  fails; in that region the Application MUST report FAIL (the two conditions are independent).
- For an MCB/MCCB where `I₂ = 1,45 × In`, Overload_Coordination passes if and only if
  `In ≤ Derated_Iz`; the displayed Verdict MUST be consistent with the Ampacity_Coordination
  Verdict for these devices.

### Requirement 4: Adiabatic short-circuit withstand — k²·S² ≥ I²t

**User Story:** As an electrical designer, I want the Application to verify that the selected
conductor survives the prospective fault energy until the device clears, so that a conductor that is
adequate for load current but inadequate for short-circuit energy is rejected.

#### Acceptance Criteria

1. WHEN a conductor material, insulation type, cross-section S (in mm²), prospective short-circuit
   current Isc (in amperes, A), and clearing time t_clear (in seconds, s) are available, THE
   Application SHALL compute the let-through energy `I²t = Isc² × t_clear` (in A²·s) and the
   conductor withstand `k² × S²` (in A²·s).
2. WHEN the conductor material and insulation type are known, THE Application SHALL select the
   adiabatic constant k by material and insulation: Cu/PVC = 115, Cu/XLPE = 143, Al/PVC = 76,
   Al/XLPE = 94 (A·s^½/mm²).
3. WHEN `I²t` and `k² × S²` are available, THE Application SHALL evaluate the Adiabatic_Withstand
   condition `k² × S² ≥ I²t` and produce a PASS or FAIL Verdict.
4. IF `k² × S² < I²t`, THEN THE Application SHALL produce a FAIL Verdict and SHALL recommend the
   smallest cross-section from the available standard conductor size series that satisfies
   `S ≥ √(I²t) / k`.
5. THE Application SHALL display the computed minimum required cross-section `S_min = √(I²t) / k`
   (in mm²), the selected S (in mm²), and the resulting Verdict.
6. IF the prospective Isc or t_clear is unknown, THEN THE Application SHALL produce an
   INSUFFICIENT_DATA Verdict for Adiabatic_Withstand and SHALL NOT present the conductor as adequate
   for short-circuit withstand.
7. IF the combination of conductor material and insulation type does not correspond to a defined
   adiabatic constant k, THEN THE Application SHALL produce an INSUFFICIENT_DATA Verdict for
   Adiabatic_Withstand and SHALL NOT present the conductor as adequate for short-circuit withstand.
8. IF no available standard cross-section satisfies `S ≥ √(I²t) / k`, THEN THE Application SHALL
   produce a FAIL Verdict and SHALL indicate that no available conductor cross-section meets the
   short-circuit withstand requirement.
9. WHEN the Adiabatic_Withstand Verdict is presented, THE Application SHALL cite
   DS/HD 60364-4-43 §434.5.2.

**Correctness properties (testable invariants):**
- The Verdict is monotonic in S: for fixed material, insulation, Isc, and t_clear, if cross-section
  `S1 ≥ S2` and S2 yields PASS, then S1 yields PASS.
- The Verdict is monotonic in fault energy: for fixed conductor, if `I²t` increases, a PASS can
  become a FAIL but a FAIL can never become a PASS.
- The recommended `S_min` always satisfies `k² × S_min² ≥ I²t` after rounding up to the next
  standard cross-section (round-trip: recommending S_min then re-evaluating yields PASS).

### Requirement 5: Earth-fault-loop impedance (Zs) and disconnection-time verification

**User Story:** As an electrical designer, I want the Application to compute the maximum permitted
loop impedance for the chosen device and compare it to the actual loop impedance, so that automatic
disconnection within the required time is proven rather than merely flagged.

#### Acceptance Criteria

1. WHEN a protective device, a System_Type, and a circuit context (final vs distribution, In value)
   are available, THE Application SHALL determine the required Disconnection_Time: for TN, 0,4 s for
   final circuits with In ≤ 32 A and 5 s for distribution circuits and final circuits with In > 32 A;
   for TT, 0,2 s for final circuits with In ≤ 32 A and 1 s for distribution circuits and final
   circuits with In > 32 A.
2. WHEN the required Disconnection_Time is determined, THE Application SHALL determine Ia as the
   device current that guarantees operation within that time for the selected device; IF Ia cannot
   be determined from the device characteristic, THEN THE Application SHALL produce an
   INSUFFICIENT_DATA Verdict.
3. WHEN U₀ and Ia are available, THE Application SHALL compute `Zs_max = U₀ / Ia`.
4. WHILE the System_Type is TN, THE Application SHALL evaluate the Zs_Verification condition
   `Zs ≤ Zs_max` and produce a PASS or FAIL Verdict.
5. WHILE the System_Type is TT, THE Application SHALL evaluate fault protection via RCD using the
   condition `Zs × IΔn ≤ U_L` where U_L is the conventional touch-voltage limit of 50 V AC, and
   produce a PASS or FAIL Verdict.
6. IF `Zs > Zs_max` in a TN system, THEN THE Application SHALL produce a FAIL Verdict, state that
   disconnection within the required time is not proven, and recommend a faster-operating device.
7. IF the actual Zs is unknown, THEN THE Application SHALL produce an INSUFFICIENT_DATA Verdict for
   Zs_Verification and SHALL NOT present disconnection as guaranteed.
8. WHEN the Zs_Verification Verdict is presented for a TN system, THE Application SHALL cite
   DS/HD 60364-4-41 §411.4; WHEN presented for a TT system, THE Application SHALL cite
   DS/HD 60364-4-41 §411.5; and THE Application SHALL cite §411.3.2 for the disconnection-time basis.
9. IF the device characteristic or Ia cannot be determined for the selected device, THEN THE
   Application SHALL produce an INSUFFICIENT_DATA Verdict and SHALL NOT present disconnection as
   guaranteed.
10. IF the RCD condition `Zs × IΔn ≤ U_L` is not satisfied in a TT system, THEN THE Application
    SHALL produce a FAIL Verdict and SHALL recommend the addition of an RCD or an RCD with a lower
    IΔn.

**Correctness properties (testable invariants):**
- For fixed U₀, `Zs_max` is inversely monotonic in Ia: a device with a higher Ia yields a smaller
  `Zs_max` (a faster/more-sensitive device makes the condition easier to satisfy at a given Zs).
- A FAIL Verdict can never coexist with a presented claim of guaranteed disconnection (consistency:
  the Verdict and the disconnection claim are always aligned).

### Requirement 6: Click-only inputs for new parameters

**User Story:** As a field user wearing gloves on a tablet, I want every new parameter to be
selectable by button, dropdown, or slider, so that I can complete a full verification without typing.

#### Acceptance Criteria

1. WHERE the new checks require a System_Type, THE Application SHALL present System_Type as a set of
   discrete clickable controls offering exactly the two values TN and TT, where each value is
   selectable with a single tap and no value can be entered by typing.
2. WHERE the new checks require a clearing time, fault current, circuit category (final /
   distribution), or RCD rating, THE Application SHALL present each parameter as a single discrete
   clickable control (button, dropdown, or slider) whose selectable values are restricted to a
   finite, predefined set.
3. WHERE a slider is used for any new input parameter, THE Application SHALL constrain the slider to
   predefined discrete step increments with defined minimum and maximum bounds, so that every
   selectable value belongs to the predefined set and no intermediate or out-of-bounds value can be
   selected.
4. THE Application SHALL NOT present any free-text field, text area, or other keyboard-entry control
   on any screen used to produce a Verdict defined in Requirements 1 through 5.
5. WHEN a new input control is rendered, THE Application SHALL pre-select the Conservative_Default
   value, defined as the most restrictive (safest) value among that control's available options, so
   that a valid Verdict can be produced immediately on screen load without the user changing any
   control.
6. THE Application SHALL render every new input control with a minimum touch-target size of
   44 × 44 pixels, so that each control is operable by a gloved fingertip without keyboard or stylus
   input.

### Requirement 7: Integration into Verify module, QI index, and Risk matrix

**User Story:** As a designer relying on the summary views, I want all four new verdicts to appear in
the Verify module, the Quality Index, and the Risk matrix, so that no safety verdict is hidden in a
single module.

#### Acceptance Criteria

1. THE Verify_Module SHALL include a self-test for each of Ampacity_Coordination,
   Overload_Coordination, Adiabatic_Withstand, and Zs_Verification that reports the verdict's
   current state as exactly one of PASS, FAIL, or INSUFFICIENT_DATA.
2. THE QI_Index SHALL include each of the four verdicts as a scored rule whose displayed state is
   exactly one of PASS, FAIL, or INSUFFICIENT_DATA (the complete Verdict set, not PASS/FAIL only).
3. IF any of the four verdicts is FAIL, THEN THE QI_Index SHALL classify that rule with `error`
   severity.
4. IF any of the four verdicts is INSUFFICIENT_DATA, THEN THE QI_Index SHALL classify that rule with
   `warning` severity and SHALL NOT classify it as passing.
5. IF any of the four verdicts is FAIL or INSUFFICIENT_DATA, THEN THE Risk_Matrix SHALL include a
   corresponding risk entry that identifies the affected verdict, its state, and the governing
   DS/HD 60364 clause.
6. WHEN a verdict changes from FAIL or INSUFFICIENT_DATA to PASS, THE Risk_Matrix SHALL remove the
   corresponding risk entry so that no risk entry remains for a now-passing verdict.
7. WHEN any input that affects a verdict changes and that verdict is recalculated, THE
   Verify_Module, THE QI_Index, and THE Risk_Matrix SHALL each display the same recalculated state
   for that verdict before the next user interaction, with no view retaining the verdict's previous
   state.

**Correctness properties (testable invariants):**
- For each of the four checks, the PASS/FAIL state reported by the Verify_Module, the QI_Index, and
  the Risk_Matrix for the same inputs is identical (cross-view consistency).

### Requirement 8: Bilingual presentation and visual consistency

**User Story:** As a Danish electrician who sometimes switches to English, I want the new verdicts in
Danish by default with an English toggle and in the existing neon dark-mode style, so that the new
content is consistent with the rest of the Application.

#### Acceptance Criteria

1. WHILE the language toggle is set to Danish or no language has been explicitly selected, THE
   Application SHALL present all new labels, verdicts, and recommendations in Danish.
2. WHEN the language toggle is set to English, THE Application SHALL present all new labels,
   verdicts, and recommendations in English, re-rendering any content currently displayed on screen
   within 1 second, without reloading the page and without discarding values the user has already
   entered.
3. THE Application SHALL render all new UI elements using the same dark-mode theme — including the
   color palette, typography, and component styling — as the existing modules, such that a new
   element is visually indistinguishable in styling from the equivalent existing-module element.
4. THE Application SHALL display, for every new control, label, verdict, and recommendation, a
   non-empty translated string in the active language, with no raw translation keys, blank values,
   or untranslated placeholder text visible in either the Danish or English setting.
5. IF a new control, label, verdict, or recommendation has no translation available for the active
   language, THEN THE Application SHALL display the corresponding Danish text as a fallback rather
   than a blank value, a raw translation key, or placeholder text.

### Requirement 9: Verdict provenance and conservative presentation

**User Story:** As an inspector reviewing the output, I want every verdict to state its governing
clause and to default to the safe side, so that I can trust and trace each result.

#### Acceptance Criteria

1. WHEN THE Application presents a Verdict produced by Requirements 1 through 5, THE Application
   SHALL display the identifier of each DS/HD 60364 clause that governs that Verdict.
2. IF one or more input values required to evaluate a Verdict are missing or unspecified, THEN THE
   Application SHALL present INSUFFICIENT_DATA for that Verdict and SHALL NOT present PASS.
3. IF two or more candidate results are equally valid for a Verdict and cannot be ranked by the
   governing DS/HD 60364 clause, THEN THE Application SHALL select the candidate that yields the
   larger conductor cross-section, the faster-operating protective device, or the additional
   protective measure.
4. WHEN THE Application presents a FAIL or INSUFFICIENT_DATA Verdict, THE Application SHALL display
   the verdict-state label and a visual treatment that is distinguishable from a PASS Verdict
   without relying on color as the only distinguishing attribute.
5. IF THE Application cannot determine the governing DS/HD 60364 clause for a Verdict, THEN THE
   Application SHALL present INSUFFICIENT_DATA for that Verdict and SHALL NOT present PASS.

**Correctness properties (testable invariants):**
- No combination of inputs produces a PASS Verdict when any input required for that Verdict is
  absent (safety invariant: absence of proof never reads as proof of safety).
