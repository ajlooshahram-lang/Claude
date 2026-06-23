# Viggo Bisch Calculation Methodology — Complete Reference
## Extracted from ALL authorization exam solutions (2015-2023)

---

## CRITICAL: CURVES AND DIAGRAMS REQUIRED

Viggo's solutions include these MANDATORY graphical elements:

### 1. Smeltekurver (Fuse melting curves) — Log-log plot
- X-axis: Current [A] (logarithmic, typically 10-10000A)
- Y-axis: Time [s] (logarithmic, 0.01-1000s)
- Shows: SIBA HHD Full Range / General Purpose fuse curves
- Marked points: I_inrush (red), I'_K3F,max,LV (black), I> relay (green)
- Used for: HV fuse selection verification (0.1s criterion)

### 2. Selektivitetsdiagram (Selectivity diagram) — Log-log TCC overlay
- Multiple curves overlaid: HV fuse + Line relay + MCCB/MCB
- Color-coded: Blue=HV fuse, Green=relay, Yellow=MCCB
- I_inrush transformer marked with red
- I'_K3F,max,LV marked with black vertical line
- Shows time grading between all protection levels
- Conclusion: "Der er selektivitet" / "Der er IKKE selektivitet"

### 3. Enstregsdiagram (Single-line diagram)
- Complete one-line showing: supply → fuse → transformer → main board → sub-boards → final circuits
- Each element labeled with: designation (-T2, -A10, -W1), ratings, cable types
- Protection devices shown with IEC symbols
- Current transformers, meters, earth connections shown

### 4. Impedansdiagram (optional, for complex visualization)
- Phasor diagram showing cumulative impedance vectors
- Z_net + Z_kabel + Z_trafo shown as vector addition

### 5. Belastningsskema (Load schedule table)
- Format: Mrk | Spænding | S[VA] | I1/1[A] | Sf | Cosφ | L1 | L2 | L3 | ∠
- Per-phase current distribution
- Subtotals per sub-board
- Grand total with vector sum (magnitude ∠ angle)

### 6. Smeltetidskurve for KB-kontrol (Fuse time for SC protection)
- Read fuse melting time at I_K,min
- Verify: t_smelte < t_max (typically 5s for distribution, 0.4s for final)

---

## OPGAVE 1: FORSYNING (Supply, 20%)

### Step 0: Generelle beregninger (General calculations)

**Network impedance (from utility Sk data):**
```
Z_net,min = (U_HV² / S_kn,max) ∠ arccot(R/X_max)
Z_net,max = (U_HV² / S_kn,min) ∠ arccot(R/X_min)
```
- Result shown in BOTH: {real + j·imag Ω} AND {|Z| ∠θ° Ω}
- R/X ratio given by utility (cosφ_k) → arccot gives the angle
- Note: arccot(R/X) = arctan(X/R) = 90° - arctan(R/X)

**Transformer impedance:**
```
Z_T = (U_N,tr² · ek / S_T) ∠ arccos(P_Cu / (S_T · ek))
```
- ek = total short-circuit voltage [pu or %]
- P_Cu = copper/load loss [W]
- The angle comes from arccos(er/ek) where er = P_Cu/(S_T) normalized

**Cable impedance (per segment):**
```
Z_kabel = l_kabel · (r + jx)
```
- r and x in Ω/km from NKT catalog
- l in km
- Result: {real + j·imag Ω} AND {|Z| ∠θ° Ω}

**Full-load current:**
```
I_1/1 = S_T / (U_N,tr · √3)         [HV side]
I_1/1,LV = S_T / (U_N,LV · √3)      [LV side, typically 400V]
  or: I_1/1,LV = I_1/1,HV · (U_HV/U_LV) · n
I_inrush = 12 · I_1/1                [typical transformer inrush]
```

### Step 1.1: Enstregsdiagram
- One-line diagram with all equipment labeled

### Step 1.2: HV Fuse Selection (SIBA HHD / Full Range)
Three criteria:
1. **Mærkespænding:** U_sik ≥ U_system (6/12 kV ≥ 10 kV)
2. **Fuldlaststrøm:** In,sik ≥ I_1/1 (with 20% overload margin)
3. **Indkoblingsstrøm:** I_sik,0.1s ≥ I_inrush (read from fuse curve at 0.1s)

### Step 1.3: HV Cable Dimensioning
- OB (overload): Iz ≥ In,sik/kt
- KB (short-circuit): I_K1s · √t_sik ≤ I_K1s,cable
- Temperature correction from NKT catalog tables

### Step 1.4: Selectivity Check
- Plot on log-log: fuse curve vs relay curve vs MCCB curve
- Check time grading at all fault current levels

### Step 1.5: Short-circuit power at secondary
```
I_K3F,max = U_HV / ((Z_net,min + Z_kabel) · √3)   [all complex]
I_K3F,min = U_HV / ((Z_net,max + Z_kabel) · √3)   [all complex]
Sk = U · |I_K3F| · √3
```

### Step 1.6/1.7: Earth conductor sizing (adiabatic)
```
S_Bj ≥ (I_K2F,max / k) · √(t_sik / ln((θ_f + β)/(θ_i + β)))
S_Dj ≥ (I_KFN,min,LV / k) · √(t_sik / ln((θ_f + β)/(θ_i + β)))
```
- k = 226 (copper), 148 (aluminium)
- θ_f = 300°C (final), θ_i = 35°C (initial), β = 234.5 (copper)
- Min per DS/EN 50522 pkt. 5.2.2: 16 mm²

---

## OPGAVE 2: BYGNINGSINSTALLATION (Installation, 60%)

### Step 2.0: Impedanser ved transformer (LV side)
```
Z_net = (U_n² / S_kn) ∠ arccot(R/X)        [mΩ at 400V level]
Z_T = (U_N² · ek / S_T) ∠ arccos(P_Cu / (S_T · ek))  [mΩ]
```
- NOTE: Now everything at 400V level (milliohms)

### Step 2.1: Belastningsskema (Load schedule)
Per load:
```
I = P / (√3 · U · cosφ)   [3-phase]
I = P / (U · cosφ)         [1-phase]
```
Then per phase (L1/L2/L3):
- 3-phase loads: I/phase = I (equally distributed)
- 1-phase loads: assigned to specific phase
- Each current carries an ANGLE: ∠-arccos(cosφ)
- Summation is VECTORIAL: I_total = Σ I_i ∠ φ_i

Simultaneity factor (Sf) applied per sub-board:
```
I_tavle = (ΣI_i) · Sf
```

Start current:
```
I_start = I_normal + (Ist/I1/1 - 1) · I_largest_motor
```

### Step 2.2: Fasekompensering check (Power factor correction)
```
If cos(φ_total) < 0.9 → compensation required (FR §27.1)
Q_C = P · (tan(φ_old) - tan(arccos(0.95)))
n_batt = Q_C / Q_per_battery
```

### Step 2.3: Sikringsvalg (Fuse/MCB selection)
```
In ≥ IB    (rated current ≥ load current)
In,start ≥ I_start (start current check for time-delayed devices)
```

### Step 2.4: Kabeldimensionering (Cable sizing)
Method:
1. Identify installation method → Tabel A.52.3 (e.g. nr. 34E, 7D, 60B2)
2. Determine column → Tabel B.52.1 (e.g. kolonne 3 for 90°C)
3. Look up Iz,tabel → Tabel B.52.4/5/10/12/13/16
4. Apply correction factors:
   - kt = temperature → Tabel B.52.14/15
   - ks = grouping → Tabel B.52.17/19/20/21
   - kd = ground depth → Tabel 65 NKT
   - ktm = thermal resistance → Tabel 66 NKT
5. Iz,corrected = Iz,tabel · kt · ks · kd · ktm
6. Check: Iz,corrected ≥ In (protection rating)

Cable impedance:
```
Z_W = l · (r + jx)     [complex, from NKT data per mm²]
```
For 2 parallel cables: Z = Z_single / 2

### Step 2.5: Spændingsfaldskontrol (Voltage drop)
```
ΔU = √3 · IB · l · (r·cosφ + x·sinφ)    [3-phase, V]
ΔU% = ΔU / Un · 100                       [%]
```
Limit: ≤ 0.5% for stikledning (per FR), ≤ 4% total

### Step 2.6: Kortslutningskontrol (Short-circuit verification)
Cumulative impedance (ALL COMPLEX):
```
Z_total = Z_net + Z_T + Z_W0 + Z_W1 + ...
I_K3F,max = c_max · Un / (√3 · |Z_total|)    [at relevant point]
```
For single-phase minimum (TN disconnection check):
```
Z_s = Z_net + Z_T + 2·Z_W   [factor 2 for go+return in fault loop]
I_KFPE,min = c_min · U0 / |Z_s|
```

### Step 2.7: KB-kontrol (Adiabatic short-circuit protection)
```
I²t ≤ k²S²
where: I²t = |I_K,max|² · t_sik
       k²S² = (k·S)²   [k=115 Cu/PVC, k=143 Cu/XLPE, k=76 Al/PVC]
```

### Step 2.8: Fejlbeskyttelse (Fault protection / indirect contact)
For TN system:
```
I_KFPE,min ≥ I_a     [Ia = trip current of protection device]
```
or equivalently:
```
Z_s · I_a ≤ U0      [U0 = 230V phase-to-earth]
```
Disconnection times (DS/HD 60364-4-41 Table 41.1):
- Final circuits ≤32A: 0.4s (TN) / 0.2s (TT)
- Distribution: 5s (TN) / 1s (TT)

### Step 2.9: MCCB Selection & Settings (Compact NSX)
```
Ir (overload): set ≥ IB
Isd (short-time): set between I_start and I_K,min
Ii (instantaneous): set below I_K,max
ICU ≥ I_K3F,max
```
Selectivity: verified via manufacturer tables or TCC overlay.

---

## OPGAVE 3: REGLER (Regulations, 20%)

Questions referencing specific clauses from:
- BEK 1082 (installations)
- BEK 1114 (anlæg)
- BEK 1608 (drift)
- DS/HD 60364-4-41 (shock protection)
- DS/HD 60364-4-43 (overcurrent)
- DS/HD 60364-5-52 (wiring)
- DS/HD 60364-5-54 (earthing)
- DS/HD 60364-7-7xx (special locations)
- DS/EN 50522 (HV earthing)
- DS/EN 61936-1 (HV installations)
- Fællesregulativet (FR)

---

## NOTATION CONVENTIONS (MUST be followed exactly)

1. **Every complex result in DUAL form:**
   ```
   Z = { 0,144 + j0,787 Ω
       { 0,800 ∠79,6° Ω
   ```

2. **Calculation layout (Mathcad-style):**
   ```
   Symbol = Formula = Substitution = Result
   ```

3. **Danish decimal comma:** 0,556 (not 0.556)

4. **Table references always cited:**
   "Tabel B.52.14" or "Tabel 63 NKT tekniske katalog"

5. **Cable notation:** 5G2,5 mm² NOIKLX 90 / 4X150 mm² NOIK-Al-M 90

6. **Current with angle:** 188,0 A ∠-32,2°

7. **Impedance units:** Ω for HV, mΩ for LV (400V level)

8. **All angles in degrees** (not radians)

9. **arccot(R/X) for network angle** (NOT arctan — arccot!)

10. **arccos(Pcu/(Sn·ek)) for transformer angle**

---

## EXAM VARIATIONS BY YEAR (Each is unique!)

### December 2019 (Viggo — the most complete, 19 pages)
- Ring network with 6 transformer stations (T1-T6)
- Multiple cable segments with different lengths (3.0+2.0+1.0+1.5+0.5+1.0 km)
- Transformer: 800 kVA, ek=4%, Pcu=7000 W, Un,tr=10500 V
- HV fuse: SIBA Full Range 50A (3 criteria check)
- Internal HV cables: PEX-Cu 1x16 mm² in trekant
- Earth fault loop: Un/(√3·√3·Z_total) for single-phase LV fault referred to HV
- Cable to LV: IKFPE,min · √3 · n for LV-referred fault current
- Max LV voltage calculation using voltage factor and load angle
- Installation: compressor, ventilator (motorværn), lighting, general loads
- MCCB with Micrologic relay settings (Ir, Isd, Ii)
- Motorværn (GV2ME) with manual operation for ventilator
- Lighting dimensioned from voltage drop (not just current)

### February 2018 (Viggo — 15 pages installation)
- Multiple sub-boards (A1.0, A1.1, A1.2, A1.3) with hierarchy
- Motor loads: 60A ∠-36.9°, 90A ∠-45.6° with START currents
- Vector summation of currents per phase (not scalar!)
- Fasekompensering check: cos(φ_total) < 0.9 → must compensate
- Capacitor bank sizing: Q = P·(tan φ_old - tan φ_new), n = Q/Q_per_bank
- Parallel cables: 2//4X150 mm² NOIK-Al-M 90
- Cable impedance for parallel: Z = l·(r+jx)/2
- MCCB NSX 100B with Micrologic 2.0 settings
- Selectivity: verified via Schneider online tool
- KB-kontrol: I²t = |Ik|² · t_sik vs k²S²
- FB (fejlbeskyttelse): I_KFPE,min ≥ I_sd (instantaneous trip)

### August 2018 (Viggo — 3 pages forsyning + 8 pages installation)
- Two transformers that can operate in parallel
- Start current of 4 motors combined: I_st = ΣI_normal + (6-1)·I_largest
- Neozed fuse has 50 kA short-circuit withstand
- Parallel operation check: which fuses can stay in panel?
- MCCB NSX with Ir/Isd/Ii/x settings fully documented
- Selektivitetskontrol med multiple protection levels

### December 2018 (from DOCX opgave)
- Produktionsvirksomhed with transformerstation -T8
- 60/10 kV station supply
- Full ring network analysis

### December 2016 (Viggo)
- Multiple tavler: -A1 through -A5 with different load compositions
- Large motor loads (519 A combined in -A2)
- Fasekompensering: 82,7 kvar → 8,27 stk → 9 stk batteries
- 4 parallel 160A NH2 gG fuses for stikledning
- 4//4X120 mm² NOIKX-Al-S + 1G185 mm² NOIKX flex (PE)

### June 2016 (Viggo — TT system!)
- TT earthing (NOT TN!) — rare but important
- RCD is primary fault protection (not overcurrent device)
- SB6 (old standard) references throughout
- Hydraulikstation with large motor
- Fasekompensering with extreme case analysis

### August 2016 (Viggo)
- SB6b references (kapitel 52, kapitel 47)
- BIB'ning (Beskyttelse mod Indirekte Berøring) terminology
- Strømtransformer selection (CT sizing)

### 2015 Reeksamen (AAMS løsning)
- 3 parallel systems: 3 II 4G300 mm² XLPE-AL
- Micrologic 2.0 with detailed In/Ir/Isd/Ii settings
- "Worst case" installation method analysis (multiple routes)
- I2kmin calculation with impedance vector addition

### 2023 January (50480 — newest exam)
- Housing estate with EV charging (contemporary topic)
- Erfaringsformel for boligforsyning: Pb = 0.834·(W·n)^0.89
- NKT Elforsyning 2010 cable catalog references
- Annual energy consumption per household calculation
- Transformer selection based on calculated demand

---

## KEY DIFFERENCES FROM MY CURRENT APP (MUST FIX):

1. **arccot(R/X) NOT arctan** for network angle (my app uses wrong function)
2. **arccos(Pcu/(Sn·ek))** for transformer angle (my app doesn't compute this)
3. **Vector current summation** with angles — NOT scalar addition
4. **Dual display ALWAYS** — {rect} AND {polar} shown side by side
5. **Danish decimal comma** (0,556 not 0.556) in displayed results
6. **NKT table number citations** in every calculation step
7. **Start current with Ist/I1/1 ratio** — not just "6x" but actual datasheet value
8. **Fasekompensering** with FR §27.1 reference and n_batt calculation
9. **Parallel cable impedance** Z_parallel = l·(r+jx)/n_parallel
10. **MCCB Micrologic settings** (Ir, Ir×In, Isd, Isd×Ir, Ii, Ii×In, t_sd)
11. **Selectivity verification** via TCC overlay or manufacturer tool
12. **KB-kontrol** explicitly showing I²t vs k²S² inequality
13. **FB-kontrol** showing Ik,min ≥ Ia (trip threshold)
14. **HV cable from NKT** with tabel 60-66 corrections
15. **Earth conductor adiabatic** with full formula including ln(θ)
16. **Smeltekurve** (fuse curve) — log-log SVG with marked points
17. **Enstregsdiagram** — generated from the SLD tree data
18. **Ring network** impedance calculation with multiple segments
19. **Transformer inrush** = 12 × I_1/1 (standard Danish practice)
20. **Voltage factor c** = 1.05 max / 0.95 min (IEC 60909)
