# Engineering Transparency + Progressive Disclosure Design System

## Architecture: The 3-Layer Information Model

Every engineering result in the application follows a strict 3-layer progressive disclosure model:

### Layer 1: Executive Summary (Always Visible)
- Status badge (Pass/Fail/Warning)
- Single-line result value with unit
- Context label (what was calculated)
- Confidence indicator

### Layer 2: Engineering Summary (One Click to Expand)
- Input parameters table (what went in)
- Key intermediate values
- Standards compliance verdict
- Component selection with justification
- Clickable standards references

### Layer 3: Full Engineering Reasoning Chain (Second Click)
- Design assumptions stated explicitly
- Applicable standards and specific clauses
- Formula selection and WHY this formula
- Variable definitions with sources
- Unit definitions
- Table references (which row/column of which standard table)
- All correction factors with justification
- Every intermediate calculation step
- Verification steps (IB <= In <= Iz, etc.)
- Alternative solutions considered
- Reasons for rejecting alternatives
- Final engineering conclusion
- Economic impact note

## User Modes

```
var USER_MODES = {
  apprentice: { depth: 1, explanations: true, warnings: true, formulas: false },
  electrician: { depth: 2, explanations: false, warnings: true, formulas: false },
  engineer: { depth: 3, explanations: false, warnings: true, formulas: true },
  expert: { depth: 3, explanations: false, warnings: true, formulas: true, advanced: true }
};
```

- **Apprentice**: Only Layer 1 visible by default; guided language; extra explanations
- **Electrician**: Layers 1+2; fast workflows; practical info
- **Engineer**: All 3 layers; full formulas; Mathcad-style
- **Expert**: All layers + advanced parameters unlocked

## CSS Component Classes

- `.eng-summary` — Executive summary badge row
- `.eng-detail` — Expandable engineering detail (uses `<details>`)
- `.eng-chain` — Full reasoning chain (nested `<details>` inside `.eng-detail`)
- `.eng-step` — Single calculation step in Mathcad style
- `.eng-verdict` — Pass/Fail/Warning badge
- `.eng-ref` — Clickable standards reference
- `.eng-assumption` — Stated assumption block
- `.eng-alternative` — Considered alternative (with rejection reason)
- `.depth-1` — Visible in all modes
- `.depth-2` — Hidden in apprentice mode
- `.depth-3` — Only visible in engineer/expert mode
- `.advanced-only` — Only visible in expert mode

## Progressive Disclosure Pattern

```html
<!-- Layer 1: Always visible -->
<div class="eng-summary">
  <span class="eng-verdict ok">OK</span>
  <span class="eng-label">Cable: NOIKLX 5G16</span>
  <span class="eng-value">Iz = 76 A</span>
</div>

<!-- Layer 2: Click to expand -->
<details class="eng-detail">
  <summary>Show Engineering Summary</summary>
  <!-- Parameters, key values, compliance -->
</details>

<!-- Layer 3: Nested inside Layer 2 -->
<details class="eng-chain">
  <summary>Full Reasoning Chain</summary>
  <!-- Complete Viggo-style derivation -->
</details>
```

## Context-Aware Input Pattern

Instead of showing all 40 inputs simultaneously:
1. User selects a **context** (load type, building type, circuit type)
2. Only relevant inputs for that context appear
3. Smart defaults pre-fill based on context
4. "Advanced" panel (collapsed) holds override inputs

## Engineering Reasoning Function Signature

```javascript
function engReasoning(params) {
  // params.title — what is being calculated
  // params.inputs — [{name, symbol, value, unit, source}]
  // params.assumptions — [{text, standard, conservative}]
  // params.standard — primary standard reference
  // params.formula — {expression, explanation, whyThisFormula}
  // params.substitution — string showing numbers plugged in
  // params.intermediateSteps — [{desc, expr, result}]
  // params.verification — [{check, passed, detail}]
  // params.alternatives — [{name, reason_rejected}]
  // params.conclusion — {value, unit, status, justification}
  // params.economicNote — optional
  // params.reference — full citation
  // Returns: HTML string with all 3 layers
}
```
