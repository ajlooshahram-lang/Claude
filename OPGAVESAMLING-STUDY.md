# OPGAVESAMLING-STUDY.md
## Comprehensive Study: Elektroteknik Opgavesamling (4. udgave)

**Extraction date:** 2025-06-20
**Source files:** Opgavesamling.pdf (201 pages, 232,306 chars extracted), Opgavesamling.word.doc (3.38 MB)
**Extraction method:** PyMuPDF (fitz) on PDF - full text successfully extracted. The .doc file (Word 97-2003 format) was only partially extractable via `strings` (Danish characters corrupted); the PDF provided complete, clean text.

---

## A) Book Overview

| Field | Value |
|-------|-------|
| **Title** | Elektroteknik - Opgavesamling |
| **Edition** | 4. udgave, 3. oplag 2009 |
| **Authors** | Poul Erik Petersen & Niels Windel Kringelum |
| **Publisher** | Bogfondens Forlag A/S (Maskinmesterskolens Boghandel), Lyngby |
| **ISBN** | 87-7463-273-6 |
| **Original copyright** | 1986 |
| **Target audience** | Maskinmester- og Elektroinstallatoeruddannelserne |
| **Total pages** | 201 (172 content pages + appendices + answer key) |
| **Total exercises** | ~430+ numbered exercises across 18 chapters |
| **Companion textbook series** | "Elektroteknik" bind 1-8 |

### Subject Areas / Chapters:

| Ch. | Danish Title | English | Pages | Exercise Range |
|-----|-------------|---------|-------|----------------|
| 1 | Grundbegreber | Fundamentals (Ohm's law, resistance, resistivity) | 9-11 | 1.1-1.43 |
| 2 | Jaevnstroemskredsloeb | DC circuits (series, parallel, Kirchhoff) | 12-25 | 2.1-2.56 |
| 3 | Effekt og energi i jaevnstroemskredse | Power & energy in DC circuits | 26-28 | 3.1-3.14 |
| 4 | Elektrisk felt, kapacitans | Electric field, capacitance | 29-31 | 4.1-4.18 |
| 5 | Magnetisk felt, induktans | Magnetic field, inductance | 32-37 | 5.1-5.28 |
| 6 | Vekselstroemsteori | AC theory (R, L, C circuits) | 38-55 | 6.1-6.127 |
| 7 | 3-faset vekselspaending | Three-phase AC (sym. & asym.) | 56-63 | 7.1-7.34 |
| 8 | Maaleinstrumenter | Measuring instruments | 64-81 | 8.1-8.88 |
| 9 | Transformere | Transformers | 82-91 | 9.1-9.28 |
| 10 | Jaevnstroemsmaskiner | DC machines (generators & motors) | 92-99 | 10.1-10.46 |
| 11 | Vekselstroemsmaskiner | AC machines (generators & motors) | 100-110 | 11.1-11.46 |
| 12 | Lys og belysningsanlaeg | Light & lighting systems | 111-119 | 12.1-12.22 |
| 13 | Rumvarme | Room heating | 120-121 | 13.1-13.6 |
| 14 | Transmissionsnet | Transmission networks | 122 | 14.1-14.3 |
| 15 | Distributionsnet, 10 kV | Distribution networks 10kV | 123-129 | 15.1-15.21 |
| 16 | Transformerstationer | Transformer stations (protection) | 130-139 | 16.1-16.14 |
| 17 | Distributionsnet, lavspaending | LV distribution networks | 140-156 | 17.1-17.17 |
| 18 | Opgaver med blandet indhold | Mixed exercises | 150-156 | 18.1-18.13 |

### Appendices:
- **Bilag A**: Symbolliste (Symbol list) - 2 pages
- **Bilag B**: Materialekonstanter (Material constants table)
- **Bilag C**: Dimensionering af ledere (Conductor sizing K-values)
- **Facitliste**: Answer key (pages 162-172) - covers chapters 1-15 and 18 (chapters 16-17 answers omitted)

---

## B) ALL Symbols, Formulas, and Abbreviations

### B.1 Core Electrical Symbols (from Bilag A + exercise text)

| Symbol | Danish Term | Unit | Formula Context |
|--------|------------|------|-----------------|
| U | Spaending, potentialforskel | V | U = R * I |
| I | Elektrisk stroem | A | I = U / R |
| R, r | Resistans, modstand | Ohm | R = rho * l / S |
| G | Konduktans, ledningsevne | S | G = 1/R |
| P | Effekt | W | P = U * I * cos(phi) |
| W | Arbejde, energi | J | W = P * t |
| S | Tilsyneladende effekt | VA | S = U * I |
| Q | Reaktiv effekt, blindeffekt | var | Q = U * I * sin(phi) |
| Z | Impedans | Ohm | Z = sqrt(R^2 + X^2) |
| XL | Induktiv reaktans | Ohm | XL = 2*pi*f*L |
| XC | Kapacitiv reaktans | Ohm | XC = 1/(2*pi*f*C) |
| L | Induktans, selvinduktion | H | L = N^2 * mu * A / l |
| C | Kapacitans | F | C = epsilon * A / d |
| E | Elektromotorisk kraft | V | E = U + I*Ri |
| rho | Specifik modstand, resistivitet | Ohm*mm2/m | R = rho * l / S |
| gamma | Specifik ledningsevne, konduktivitet | S/m | gamma = 1/rho |
| alpha | Modstandstemperaturkoefficient | K^-1 | R_T = R_0*(1+alpha*dT) |
| phi | Faseforskydningsvinkel | rad, deg | cos(phi) = P/S |
| lambda | Effektfaktor | - | lambda = P/S |
| eta | Virkningsgrad | - | eta = P_out/P_in |
| f | Frekvens | Hz | f = 1/T |
| f0 | Resonansfrekvens | Hz | f0 = 1/(2*pi*sqrt(LC)) |
| T | Periodetid | s | T = 1/f |
| tau | Tidskonstant | s | tau = L/R or tau = R*C |
| omega | Vinkelhastighed | rad/s | omega = 2*pi*f |
| n | Omdrejningshastighed | omdr./min | n = 120*f/p |
| v | Hastighed | m/s | |
| F | Kraft | N | F = B*I*l |
| M | Moment, drejningsmoment | N*m | M = F*r |
| J | Stroemtaethed | A/mm2 | J = I/S |
| S (area) | Areal af ledertvaaersnit | mm2 | |
| l | Laengde, afstand | m | |
| B | Magnetisk fluxtaethed | T (Wb/m2) | B = Phi/A |
| Phi | Magnetisk flux | Wb | Phi = B*A |
| H | Magnetisk feltstyrke | A/m | H = N*I/l |
| Rm | Reluktans | A/Wb, H^-1 | Rm = l/(mu*A) |
| mu_0 | Vacuumpermeabilitet | H/m | 4*pi*10^-7 |
| mu_r | Relativ permeabilitet | - | |
| N | Vindingstal | - | |
| n (transf.) | Omsaetningsforhold | - | n = N1/N2 |
| epsilon_0 | Vacuumpermittivitet | F/m | 8.854*10^-12 |
| epsilon_r | Relativ permittivitet (dielektricitetskonstant) | - | |
| D | Elektrisk forskydning (fluxtaethed) | C/m2 | D = epsilon*E |
| E (field) | Elektrisk feltstyrke | V/m | E = U/d |
| Q (charge) | Elektrisk ladning | C | Q = C*U |
| sigma | Ladningstaethed / spredningskoefficient | C/m2 or - | |
| Imax, Umax | Maksimalvaerdi, amplitude | A, V | Imax = I*sqrt(2) |
| Imid, Umid | Numerisk middelvaerdi | A, V | Imid = (2/pi)*Imax |
| i, u | Oejebliksvaerdi | A, V | i = Imax*sin(omega*t) |
| Fm | Magnetomotorisk kraft | A (Av) | Fm = N*I |
| m | Masse | kg | |
| g | Tyngdeacceleration | m/s2 | 9.81 |
| k | Rumfaktor (belysning) | - | k = l*b/(hm*(l+b)) |
| E (light) | Belysningsstyrke | lux (lm/m2) | E = I*cos(theta)/r^2 |
| I (light) | Lysstyrke | cd | |
| Phi (light) | Lysflux, lysstrOEm | lm | Phi = I*Omega |
| L (light) | Luminans | cd/m2 | |
| Omega | Rumvinkel | sr | |
| lambda (heat) | Varmeledningstal | W/(m*K) | |
| U (heat) | Transmissionstal (U-vaerdi) | W/(m2*K) | |

### B.2 Transformer-Specific Symbols

| Symbol | Danish Term | Formula Context | Example |
|--------|------------|-----------------|---------|
| ek | Procentisk kortslutningsspaending | ek = Uk/U1N * 100% | 5.5% |
| er | Procentisk resistansspaending | er = Ir*R/U1N * 100% | 1.4% |
| P0 | Tomgangstab (jerntab) | Measured at no-load | 195 W |
| PCu | Kobbertab (stroemvarmetab) | PCu = I^2 * R | 900 W |
| PFe | Jerntab | PFe = P0 - I10^2*R1 | |
| SN | Maerkeeffekt (nominel ydeevne) | | 400 kVA |
| U1N, U2N | Nominel primaer/sekundaer spaending | | 10/0.4 kV |
| I10 | Primaer tomgangsroem | | 0.66 A |
| RFe | Jernmodstand (equivalent) | | |
| XH | Hovedinduktans (reaktans) | | |
| Dy, Yy, Dd | Koblingsbetegnelse | | Dy5, Dy11 |

### B.3 Machine-Specific Symbols

| Symbol | Danish Term | Context |
|--------|------------|---------|
| Ra | Ankermodstand | DC machines |
| RV | Vendepolsmodstand | DC machines |
| Rsh | Shuntmodstand | DC shunt machines |
| EG | Generatorens EMK | |
| EB | Batteriets EMK | |
| Ri | Indre modstand | |
| s | Slip (slip) | Asynchronous motors: s = (ns-n)/ns |
| ns | Synkron hastighed | ns = 60f/p |
| p | Polpar (antal poler) | |
| IN | Maerkestrroem (nominel stroem) | |
| Istart/Ist | Startstrroem | |
| cos(phi)start | Starteffektfaktor | |

### B.4 Distribution / Installation Symbols

| Symbol | Danish Term | Context |
|--------|------------|---------|
| Ik, Ik3f | 3-faset kortslutningsstroem | Short-circuit calc |
| Sk | Kortslutningseffekt | Sk = sqrt(3)*U*Ik |
| deltaU | Spaendingsfald | Voltage drop |
| K | K-vaerdi (termisk) | K = I*sqrt(t)/S |
| T1, T2 | Begyndelses-/sluttemperatur | Conductor thermal |
| I>, t> | Relaeindstiing (oerstroemudloeser) | Protection |
| I>>, t>> | Kortslutningsudloeser | Protection |
| kn | Omsaetningsforhold (maletransformer) | CT/VT ratio |
| Un | Netspaending | |
| Uf | Fasespaending | |
| C0 | Nulkapacitans | Earth fault calc |

### B.5 Key Formulas Used in the Book

| # | Formula | Context |
|---|---------|---------|
| 1 | R = rho * l / S | Resistance from resistivity |
| 2 | R_T = R_20 * (1 + alpha*(T-20)) | Temperature-dependent resistance |
| 3 | P = U*I = I^2*R = U^2/R | DC power |
| 4 | P = U*I*cos(phi) | AC active power |
| 5 | S = U*I | Apparent power |
| 6 | Q = U*I*sin(phi) | Reactive power |
| 7 | Z = sqrt(R^2 + (XL-XC)^2) | Impedance (RLC series) |
| 8 | XL = 2*pi*f*L = omega*L | Inductive reactance |
| 9 | XC = 1/(2*pi*f*C) = 1/(omega*C) | Capacitive reactance |
| 10 | f0 = 1/(2*pi*sqrt(L*C)) | Resonance frequency |
| 11 | tau = L/R or tau = R*C | Time constant |
| 12 | u_C(t) = U*(1-e^(-t/tau)) | Capacitor charging |
| 13 | u_C(t) = U*e^(-t/tau) | Capacitor discharging |
| 14 | U_line = sqrt(3) * U_phase | 3-phase Y-connection |
| 15 | I_line = sqrt(3) * I_phase | 3-phase Delta-connection |
| 16 | P_3ph = sqrt(3)*U_L*I_L*cos(phi) | 3-phase power |
| 17 | E = U + I*Ri (generator) | Generator terminal voltage |
| 18 | U = E - I*Ra - U_brush (motor) | Motor back-EMF |
| 19 | n = U1/U2 = N1/N2 | Transformer ratio |
| 20 | ek = Uk/UN * 100 | Short-circuit voltage % |
| 21 | Ik = IN/ek*100 or U/(Z) | Short-circuit current |
| 22 | deltaU = sqrt(3)*I*(R*cos(phi)+X*sin(phi)) | Voltage drop 3-phase |
| 23 | s = (ns - n)/ns | Motor slip |
| 24 | M = P/(2*pi*n/60) = 9.55*P/n | Torque |
| 25 | E_lux = I_cd * cos(theta) / r^2 | Point illuminance |
| 26 | Phi_total = E_mean * A / (eta_arm * eta_room * MF) | Lighting design |
| 27 | Q_trans = U * A * deltaT | Heat transmission |
| 28 | K*S = Ik * sqrt(t) | Thermal short-circuit (adiabatic) |
| 29 | Fm = N*I (amperevindingstal) | Magnetomotive force |
| 30 | B = mu_0 * mu_r * H | Flux density |
| 31 | e = -N * dPhi/dt | Faraday's law |
| 32 | e = B*l*v | Motional EMF |
| 33 | F = B*I*l | Force on conductor |
| 34 | C = epsilon_0 * epsilon_r * A / d | Parallel plate capacitor |
| 35 | Q_C = C * U | Capacitor charge |
| 36 | W_C = 0.5*C*U^2 | Capacitor energy |
| 37 | cos(phi) = R/Z | Power factor from impedance |
| 38 | Kirchhoff I: sum(I) = 0 | Current law (node) |
| 39 | Kirchhoff II: sum(U) = 0 | Voltage law (loop) |
| 40 | R_parallel = (R1*R2)/(R1+R2) | Two resistors in parallel |

---

## C) Exercise Types / Categories

### C.1 Grundbegreber (Ch. 1) - Basic Concepts / Ohm's Law
**Exercises:** 1.1-1.43 (~35 exercises)
**Calculation patterns:**
- Direct Ohm's law: U=R*I, solve for any variable
- Resistivity: R = rho * l / S (specific resistance, conductor dimensions)
- Conductance: G = 1/R, gamma = 1/rho
- Temperature coefficient: R_T = R_0*(1+alpha*(T-T_0))
- Current density: J = I/S
- EMF and internal resistance: E = U + I*Ri, U = E - I*Ri

**Key formulas:** Ohm's law, resistance-geometry relation, temperature dependence, voltage sources with internal resistance.

### C.2 Jaevnstroemskredsloeb (Ch. 2) - DC Circuits
**Exercises:** 2.1-2.56 (~50 exercises)
**Calculation patterns:**
- Series/parallel resistance combinations
- Voltage dividers (spaendingsdelere) - loaded and unloaded
- Current dividers
- Kirchhoff's laws (maschereglen / knudepunktsreglen)
- Wheatstone bridge balance
- Generator + battery parallel circuits (Kirchhoff mesh analysis)
- Potentiometer calculations
- Complex networks with multiple EMF sources

**Key formulas:** Kirchhoff I and II, parallel resistance formula, voltage divider rule, superposition.

### C.3 Effekt og Energi (Ch. 3) - Power and Energy
**Exercises:** 3.1-3.14 (~14 exercises)
**Calculation patterns:**
- Power in series/parallel circuits: P = I^2*R = U^2/R = U*I
- Energy: W = P*t (in Ws, kWh)
- Efficiency: eta = P_out/P_in
- Heating element design (multi-position switches)
- Cost calculations (el-pris in oere/kWh)
- Pump power with mechanical efficiency chain

**Key formulas:** P=UI, W=Pt, eta=P2/P1, P_pump = rho*g*V*h/t

### C.4 Elektrisk Felt, Kapacitans (Ch. 4) - Electric Field, Capacitance
**Exercises:** 4.1-4.18 (~18 exercises)
**Calculation patterns:**
- Coulomb's law: F = Q1*Q2/(4*pi*eps0*r^2)
- Electric field: E = U/d, E = F/Q
- Parallel plate capacitor: C = eps0*eps_r*A/d
- Series/parallel capacitors
- RC time constant: tau = R*C
- Charging/discharging curves: u(t) = U*(1-e^(-t/tau))
- Cable capacitance and insulation resistance

**Key formulas:** C=eps*A/d, Q=CU, tau=RC, exponential charge/discharge.

### C.5 Magnetisk Felt, Induktans (Ch. 5) - Magnetic Field, Inductance
**Exercises:** 5.1-5.28 (~28 exercises)
**Calculation patterns:**
- Magnetic circuit: Fm = N*I, B = Phi/A, H = Fm/l
- Reluctance: Rm = l/(mu*A)
- Air gap calculations with field spreading (feltspredning)
- Faraday induction: e = -N*dPhi/dt, e = B*l*v
- Force on conductor: F = B*I*l
- Self-inductance: L = N^2*mu*A/l
- RL time constant: tau = L/R
- Rotating conductors in magnetic fields (generator principle)
- Mean/peak induced EMF in rotating coils

**Key formulas:** Fm=NI, B=mu*H, Phi=B*A, e=Blv, e=-N*dPhi/dt, L=N^2/(Rm)

### C.6 Vekselstoermsteori (Ch. 6) - AC Theory
**Exercises:** 6.1-6.127 (~90+ exercises, the largest chapter)
**Sub-sections:**
- **Grundbegreber (6.1-6.21):** Sinusoidal waveforms, peak/RMS/mean values, phasors, vector addition
- **R+L serie (6.30-6.45):** RL circuits, impedance, phase angle, power factor
- **Spoler med jernkerne (6.50-6.54):** Iron-core coils, copper loss + iron loss separation
- **R+C serie (6.65-6.71):** RC circuits, capacitive reactance
- **R+L+C serie (6.78-6.85):** RLC series, resonance, impedance matching
- **Parallelforbindelser (6.90-6.102):** Parallel RL, RC, RLC, parallel resonance
- **Blandede forbindelser (6.120-6.127):** Mixed series-parallel AC networks

**Key formulas:** Z=sqrt(R^2+X^2), XL=2*pi*f*L, XC=1/(2*pi*f*C), cos(phi)=R/Z=P/S, resonance f0=1/(2*pi*sqrt(LC)), power triangle P/Q/S.

### C.7 3-faset Vekselspaending (Ch. 7) - Three-Phase Systems
**Exercises:** 7.1-7.34 (~34 exercises)
**Calculation patterns:**
- **Symmetrisk belastning (7.1-7.9):** Star/delta connections, line vs phase quantities
- **Usymmetrisk belastning (7.20-7.34):** Unbalanced loads, neutral current, broken neutral, broken phase
- Power factor correction with capacitor banks
- Two-wattmeter method for 3-phase power measurement
- Mixed star-delta loads
- Effect of fuse blowing (sikring braender over)

**Key formulas:** UL=sqrt(3)*Up (star), IL=sqrt(3)*Ip (delta), P=sqrt(3)*UL*IL*cos(phi), Qc for compensation.

### C.8 Maaleinstrumenter (Ch. 8) - Measuring Instruments
**Exercises:** 8.1-8.88 (~75+ exercises)
**Sub-sections:**
- **Volt/amperemetre, shunt, formodstand (8.1-8.18):** Meter design, shunt resistors, series resistors
- **Watt- og var-metre (8.30-8.43):** Wattmeter readings, scale factors, 2-wattmeter method
- **Maalebroer (8.50-8.58):** Wheatstone bridge, Maxwell bridge, cable fault location
- **Maaletransformere (8.70-8.74):** CT/VT ratios, burden calculations
- **Andre instrumenter (8.78-8.79):** Energy meters, phase sequence detection
- **Maaleusikkerhed (8.80-8.88):** Measurement uncertainty, instrument classes

**Key formulas:** Shunt: Rs = Ri/(n-1), Formodstand: Rv = (U-Ui)/Ii, Bridge balance: R1/R2 = R3/R4, Uncertainty class calculations.

### C.9 Transformere (Ch. 9) - Transformers
**Exercises:** 9.1-9.28 (~28 exercises)
**Calculation patterns:**
- Turns ratio and EMF: E = 4.44*f*N*Bmax*A
- Open-circuit and short-circuit tests
- Equivalent circuit parameters (R, X referred to primary/secondary)
- Voltage regulation at various loads and power factors
- Efficiency at various loads
- Parallel operation of transformers (load sharing)
- 3-phase transformer connections (Dy, Yy, Dd), vector groups
- Short-circuit current calculation through transformers
- Heating cables powered through transformers

**Key formulas:** n=U1/U2=N1/N2, ek=Uk/UN*100, eta=P2/(P2+P0+PCu*(S/SN)^2), Ik=IN*100/ek.

### C.10 Jaevnstroemsmaskiner (Ch. 10) - DC Machines
**Exercises:** 10.1-10.46 (~40 exercises)
**Sub-sections:**
- **Generatorer (10.1-10.12):** Shunt/series/compound generators, EMF, losses, efficiency
- **Motorer (10.30-10.46):** Shunt/series/compound motors, starting resistors, speed control, torque

**Key formulas:** E = U + Ia*Ra + Ub (gen), U = E + Ia*Ra + Ub (motor), eta, torque M = 9.55*P/n, starter design.

### C.11 Vekselstroemsmaskiner (Ch. 11) - AC Machines
**Exercises:** 11.1-11.46 (~46 exercises)
**Sub-sections:**
- **Generatorer (11.1-11.16):** Synchronous generators, EMF, voltage regulation, parallel operation
- **Motorer (11.30-11.46):** Asynchronous (induction) motors, slip, torque, efficiency, star-delta starting, Steinmetz connection, single-phase motors, rotor starters

**Key formulas:** ns=120f/p, s=(ns-n)/ns, PCu_rotor=s*P_air_gap, M=9.55*P/n, Y-D start current = 1/3 of direct.

### C.12 Lys og Belysning (Ch. 12) - Lighting
**Exercises:** 12.1-12.22 (~22 exercises)
**Calculation patterns:**
- Photometry: candela, lumen, lux relationships
- Inverse square law: E = I*cos(theta)/r^2
- Room factor (rumfaktor): k = l*b/(hm*(l+b))
- Lumen method for interior lighting design
- Maintenance/depreciation factor (forringelsesfaktor)
- Projector/floodlight calculations with ISOLUX diagrams

**Key formulas:** E=I*cos(theta)/r^2, Phi=E*A/(eta_arm*eta_rum*MF), lysudbytte=Phi/P.

### C.13 Rumvarme (Ch. 13) - Room Heating
**Exercises:** 13.1-13.6 (~6 exercises)
**Calculation patterns:**
- Heat conduction through walls: Q = lambda*A*deltaT/d
- U-value (transmissionstal): U = 1/R_total
- Thermal resistance (isolans): R = d/lambda
- Surface resistance (overgangsisolans): Ri, Ru
- Building heat loss calculation
- Air change heat loss: Q_vent = 0.33*n*V*deltaT

**Key formulas:** Q=U*A*deltaT, R=d/lambda, U=1/(Ri+sum(d/lambda)+Ru).

### C.14 Transmissionsnet (Ch. 14) - Transmission Networks
**Exercises:** 14.1-14.3 (~3 exercises)
**Calculation patterns:**
- Cable charging current: Ic = omega*C*U/sqrt(3)
- Voltage drop in HV cables
- Ferranti effect (voltage rise at unloaded end)

### C.15 Distributionsnet 10 kV (Ch. 15) - 10kV Distribution
**Exercises:** 15.1-15.21 (~21 exercises)
**Calculation patterns:**
- Voltage drop in radial/ring networks
- Short-circuit current at various points
- Cable thermal limits (adiabatic equation): Ik*sqrt(t) = K*S
- Protection relay coordination
- Earth fault current in isolated networks
- Petersen coil (slukkespole) sizing
- Parallel cable load sharing
- Series capacitor compensation

**Key formulas:** deltaU=sqrt(3)*I*(R*cos+X*sin), Sk=sqrt(3)*Un*Ik, K*S=Ik*sqrt(t).

### C.16 Transformerstationer (Ch. 16) - Transformer Stations
**Exercises:** 16.1-16.14 (~14 exercises)
**Calculation patterns:**
- HV fuse characteristics (smelteintegral, totalintegral)
- Relay coordination (selektivitet)
- Constant-time relays vs. inverse-time relays
- Time-current curves on log-log paper
- Transformer + cable + fuse selectivity verification

### C.17 Distributionsnet, Lavspaending (Ch. 17) - LV Distribution
**Exercises:** 17.1-17.17 (~17 exercises)
**Calculation patterns:**
- LV voltage drop calculations
- Motor starting voltage dip
- Fluctuation percentage (fluktuationsprocent)
- Selectivity between NH fuses and HV fuses
- Wind turbine connection effects
- Parallel transformers with different parameters
- Capacitor bank voltage support

**Key formulas:** deltaU%=deltaU/UN*100, Flukt%=deltaU_start/UN*100.

### C.18 Opgaver med Blandet Indhold (Ch. 18) - Mixed Problems
**Exercises:** 18.1-18.13 (~13 exercises)
**Calculation patterns:**
- Combined transformer + cable + load calculations
- Series capacitor compensation of transformer + cable
- Asymmetric voltage drop in single-phase/two-phase loaded cables
- Parallel overhead lines
- Full system design problems (transformer station to load point)

---

## D) ALL Answers (Facitliste)

The following is the complete answer key extracted from pages 162-172 of the PDF. Answers for chapters 16 and 17 and parts of chapter 15 are omitted by the authors.

### Chapter 1 - Grundbegreber

| Ex. | Answer |
|-----|--------|
| 1.1 | 0.3 Ohm |
| 1.2 | 0.4 A |
| 1.3 | 500 V |
| 1.4 | a) 2.75 A, b) 2.94 A |
| 1.5 | 6.20 V |
| 1.6 | 500 Ohm |
| 1.7 | 20 Ohm |
| 1.8 | a) 1000 kOhm, b) 0.125 mA |
| 1.9 | 5.46 A |
| 1.10 | 0.172 mOhm |
| 1.11 | 0.488 Ohm*mm2/m |
| 1.12 | 37.3 mS |
| 1.13 | 117.2 m |
| 1.14 | 413.3 m |
| 1.15 | 0.0175 Ohm*mm2/m |
| 1.16 | 1.401 Ohm*mm2/m |
| 1.17 | a) 54.4 mOhm, b) 149 mm2, c) 0.801 kg, 0.402 kg |
| 1.18 | a) 0.50 mm2, b) 0.64 mm2 |
| 1.19 | 3.3 kOhm |
| 1.22 | 1.78 * 10^6 A/m2 |
| 1.23 | a) 800 A, b) 70 mV |
| 1.24 | 15.7 m |
| 1.25 | 1488 Ohm |
| 1.26 | 52.1 deg C |
| 1.27 | 100 deg C |
| 1.28 | 0.010 |
| 1.29 | 2454 deg C |
| 1.30 | -0.4 * 10^-3 |
| 1.40 | 116.2 V |
| 1.41 | 0.326 A, 26.1 V |
| 1.42 | 232 V, 0.5 Ohm |
| 1.43 | 0.267 Ohm, 114.7 V |

### Chapter 2 - Jaevnstroemskredsloeb

| Ex. | Answer |
|-----|--------|
| 2.1 | a) 220 V, b) 70/160/210 Ohm, c) 440 Ohm |
| 2.2 | 375 Ohm |
| 2.3 | 77.5 Ohm |
| 2.4 | a) 5000/1250 Ohm, b) 6250 Ohm, c) 1.92 mA, d) 0.16 mS |
| 2.5 | 13.2 V |
| 2.6 | 1098 Ohm |
| 2.9 | a) 550/338 mA, b) 888 mA, c) 248 Ohm |
| 2.10 | a) 195.5 Ohm, b) 179.7 Ohm |
| 2.11 | a) 25 mS, b) 66.7/40.0 Ohm, c) 25.0 Ohm |
| 2.12 | a) 3.0/2.0/1.5 A, b) 6.5 A, c) 1.85 Ohm |
| 2.13 | 120 Ohm |
| 2.14 | 120 Ohm |
| 2.15 | 17.88 mOhm |
| 2.16 | 0.1053 Ohm |
| 2.17 | 440 Ohm to 23.16 Ohm, 9.5 A to 0.5 A |
| 2.18 | 5.30 A |
| 2.19 | a) 140 V, b) 5.0 Ohm |
| 2.20 | a) 5.5/0.55/0.44/0.11/11.0 A, b) 6.45 Ohm |
| 2.21 | a) 12.0/12.0/4.80/7.20/4.32/2.88 A, b) 24.0 A, c) 139.2 V |
| 2.22 | a) 1.938/0.884/1.054/0.659/0.395 A, b) 8.13 V |
| 2.23 | a) 143.0 V, b) 108.9 V |
| 2.24 | 17.14 Ohm, 24.0 Ohm |
| 2.25 | 11.67 kOhm, 5.60 kOhm |
| 2.26 | 2.77 V |
| 2.27 | a) 447 Ohm, b) 6.94 V |
| 2.28 | a) -5.63 V to +6.65 V, b) 1.2 kOhm |
| 2.40 | 8.0/3.0/11.0 A |
| 2.41 | 1.5/1.0/2.5 A |
| 2.42 | 3.0/0/3.0 A |
| 2.43 | a) 8.0/4.0/12.0 A, b) 27.4/92.9/65.5 A |
| 2.44 | a) 2.46/0.082/2.38 A, b) 64.8/65.5/0.738 A |
| 2.45 | 94.5 Ohm, 17.1 Ohm |
| 2.46 | a) 2.0/7.0/5.0 A, b) 72.0/56.0 V, c) 32/392 W |
| 2.47 | a) 1.077/0.923/0.154 A, b) 0.615/2.77/2.15 V |
| 2.48 | 1.485/2.25/1.505/2.23/1.075/0.430 A |
| 2.49 | a) 23 A, b) 21.9 A |
| 2.50 | a) 1.10 Ohm, b) 2.66 A, c) 0.342 A |
| 2.51 | a) 5.00/7.50/2.50 A, b) 300 W, c) 6.0 Ohm |
| 2.52 | 17.4 mV |
| 2.53 | a) 1.33/2.67/4.0 A, b) -11.2/-60.0 V, c) 1.50 A |
| 2.54 | a) 3.0/10.0 Ohm, b) 0.10 A |
| 2.55 | a) 116.0/20.0 V, b) 80.0 V, 120.0 Ohm |
| 2.56 | a) 0.75 V, 1.313 W, b) 0.563 V, 2.46 W |

### Chapter 3 - Effekt og Energi

| Ex. | Answer |
|-----|--------|
| 3.1 | a) 50.0/25.0/12.5 W, b) 87.5 W |
| 3.2 | a) 11.2/22.4/44.8 W, b) 78.4 W |
| 3.3 | a) 1104 W, b) 6.72 V, c) 323 W |
| 3.4 | a) 7.26 mW, b) 2413 mW |
| 3.5 | 50.0 mW |
| 3.6 | a) 61.0 W, b) 5.81 W, c) 16.04 kJ |
| 3.7 | 1.26 J/s |
| 3.8 | 500/1000/2000 W |
| 3.9 | a) 1:3:4.5, b) 177.8 Ohm |
| 3.10 | a) 67.2 Ohm, b) 0.5*10^-3, c) 182 deg C |
| 3.11 | a) 160 Ohm, b) 2400*10^3 Ws / 0.67 kWh, c) 120 min |
| 3.12 | a) 1.618, b) 1.618, c) 1.618 |
| 3.13 | 0.78 |
| 3.14 | a) 17.44 kW, b) 4.36 kWh, c) 27.70 kr/h |

### Chapter 4 - Elektrisk Felt, Kapacitans

| Ex. | Answer |
|-----|--------|
| 4.1 | 3000 C |
| 4.2 | 30*10^-6 N |
| 4.3 | 1.521 nC |
| 4.4 | 21.6 kV/m |
| 4.5 | 10 nC |
| 4.6 | a) 17.7 pF, b) 0.212 nC, c) 20.0 kV/m, d) 177 nC/m2 |
| 4.7 | a) 1.195 nF, b) 121.4 V |
| 4.8 | 4.24 |
| 4.9 | a) 132.8 pF, b) 66.4 nC, c) 664 pF, d) 100 V |
| 4.10 | a) 22.0 mA, b) 67.5/124.7/173.1/278.1/356.9 V |
| 4.11 | 32320 Ohm |
| 4.12 | a) 0.10 s |
| 4.13 | 230 s |
| 4.14 | 180 V |
| 4.15 | 60 uF |
| 4.16 | 16.4 uF |
| 4.17 | a) 0.674/7.70 uF, b) 56.2/27.0/16.8 V and 100 V, c) 67.4 uC and 120/250/400 uC |
| 4.18 | a) 17.72 pF, b) 354 nC, c) 2.08/16.7 kV/mm, d) 66.7 kV |

### Chapter 5 - Magnetisk Felt (selected key answers)

| Ex. | Answer |
|-----|--------|
| 5.1 | 0.8 T |
| 5.2 | 14.4 mWb |
| 5.9 | 0.5 V |
| 5.10 | 160 V |
| 5.14 | 0.1 H |
| 5.15 | 5000 V |
| 5.17 | a) 7 ms, b) 0.415 A |

### Chapter 6 - Vekselstoermsteori (selected key answers)

| Ex. | Answer |
|-----|--------|
| 6.1 | a) 110.3 V, b) 16.67 ms |
| 6.2 | a) 325.3 V, b) 162.6 V |
| 6.30 | a) 880 Ohm, b) 0.048 A |
| 6.31 | a) 6.28 Ohm, b) 6.59 Ohm, c) 16.69 A |
| 6.78 | a) 7.0 Ohm, b) 17.1 A, c) etc. |

### Chapter 7 - 3-faset (selected key answers)

| Ex. | Answer |
|-----|--------|
| 7.1 | a) 7.6 A, b) 48.3 Ohm |
| 7.2 | a) 17.3 A, b) 10.0 A, c) 12000 W |
| 7.3 | a) 2.17 A, b) 1500 VA, c) 900 var, d) 6.50 A, e) 3600 W |

### Chapter 8 - Maaleinstrumenter (selected)

| Ex. | Answer |
|-----|--------|
| 8.1 | 0.0102 Ohm |
| 8.50 | 36.8 Ohm |
| 8.80 | a) +/-0.125 A, +/-3.13%, b) +/-0.125 A, +/-8.33% |

### Chapter 9 - Transformere

| Ex. | Answer |
|-----|--------|
| 9.1 | a) 1.22 V, b) 311 |
| 9.2 | a) 0.55, b) 418 V, c) 126.5 V |
| 9.3 | a) 5.24, b) 2.27 A, c) 11.9 A |
| 9.10 | a) 3.80%, b) 0.1837 Ohm, c) 599 A, d) 0.976, e) 0.973 |
| 9.20 | a) 65.6 A/0.976, b) 0.979, c) 2187 A |
| 9.25 | a) 0.973/0.978, b) 231 A/6.08 kA, c) 186/464 kVA, d) 0.975 |
| 9.27 | a) 1173 kVA, b) 42.3 kA, c) 388.4 V, d) 0.986/0.988 |

### Chapter 10 - Jaevnstroemsmaskiner

| Ex. | Answer |
|-----|--------|
| 10.1 | 114 V |
| 10.3 | a) 80 mOhm, b) 512 W, c) 221.6 V |
| 10.7 | a) 0.819, b) 25371 W, c) 84317 W |
| 10.32 | a) 204.3 Nm, b) 0.824 |
| 10.35 | a) 2.96 kW/4.0 HK, b) 0.856, c) 215.1 V, d) 496 W |

### Chapter 11 - Vekselstroemsmaskiner

| Ex. | Answer |
|-----|--------|
| 11.1 | 1000 omdr./min |
| 11.4 | a) 234.5 V, b) 349.6 A |
| 11.30 | a) 10.05 A, b) 5294 W, c) 3971 var, d) 75 omdr./min/5.0%, e) 2.5 Hz |
| 11.35 | a) 0.916, b) 0.887, c) 18.60 kW, d) 124.4 Nm, e) 4.8% |

### Chapter 12 - Lys

| Ex. | Answer |
|-----|--------|
| 12.1 | a) 300 nm, b) UV |
| 12.3 | a) 60 lm, b) 754 lm |
| 12.6 | 178.6 lux |
| 12.17 | a) 0.444, b) 25 W/m2 |
| 12.18 | a) 6, b) 320 lux, c) 229 lux |

### Chapter 13 - Rumvarme

| Ex. | Answer |
|-----|--------|
| 13.1 | 90 kJ/h |
| 13.2 | 99 W |
| 13.3 | a) 0.0375, b) 5.33 m2*K/W, c) 0.188 W/(m2*K) |
| 13.5 | 6095 W |

### Chapter 14 - Transmissionsnet

| Ex. | Answer |
|-----|--------|
| 14.1 | 224.9/92.5/20.9/18.5 A |
| 14.2 | a) 91.4 A, b) 68.9 kV, c) 70.0 kV |
| 14.3 | a) 7.36 kV, b) 76.5 A, c) 64.9 kV |

### Chapter 15 - Distributionsnet 10 kV (partial)

| Ex. | Answer |
|-----|--------|
| 15.1 | 10.85 kV |
| 15.2 | a) 57.74 A, b) 10.8 kV, c) 70 kW, d) 619 A |
| 15.3 | a) 55.13 kV, b) 0.888 |
| 15.5 | 45.2 V |

### Chapter 18 - Blandet Indhold

| Ex. | Answer |
|-----|--------|
| 18.1 | a) 171.3 mF, b) 429.2 V, c) 400 V, d) 397.8 V, e) 31.6 kA, f) 397.8 V, g) 9.46 kA |
| 18.2 | a) 436.2 V, b) 14.73 kvar, c) 0.989, d) 437.4 V |
| 18.5 | a) 0.852, b) 435 V, c) 13.38/16.69 A |
| 18.6 | a) 284 kW, b) 356 kW, c) 6.44 kV |
| 18.9 | a) 16.3 kA, b) 1395 A, c) 25.2 kA |
| 18.10 | a) 220/233/233 V, b) 394/400/394 V, c) 87.7 W |
| 18.11 | 390/405/405 V |
| 18.12 | a) 384 V/222 V, b) 221/222/219 V, 384/382/381 V |
| 18.13 | a) 59.0/70.8/40.0/24.0 A, b) 221/225/230 V, 385/392/395 V |

---

## E) Technical Vocabulary Specific to This Book

The following terms/phrases appear in the Opgavesamling but may NOT be in the existing AUTORISATIONSPROVE-VOCABULARY.md (which focuses on DS/HD 60364 exam terms). These are foundational electrical engineering terms from textbook-level study:

### E.1 Circuit Analysis Terms (not typically in autorisation exams)

| Danish Term | English | Context in Book |
|-------------|---------|-----------------|
| Maschereglen | Mesh/Loop rule (Kirchhoff II) | Ch. 2 network analysis |
| Knudepunktsreglen | Node/Junction rule (Kirchhoff I) | Ch. 2 network analysis |
| Spaendingsdeler | Voltage divider | Ch. 2 (loaded/unloaded) |
| Stroemdeler | Current divider | Ch. 2 parallel circuits |
| Erstatningsmodstand / aekvivalentmodstand | Equivalent resistance | Ch. 2 simplification |
| Superpositonsprincippet | Superposition principle | Ch. 2 multi-source |
| Thevenin / Norton | Source transformation | Implicit in Ch. 2 |
| Glidekontakt | Slider contact (potentiometer) | Ch. 2 potentiometer |
| Potentiometer | Potentiometer | Ch. 2.23-2.28 |
| Formodstand | Series (dropping) resistor | Instrument circuits |
| Shuntmodstand | Shunt resistor | Ammeter extension |
| Konduktans | Conductance | G = 1/R |
| Konduktivitet | Conductivity | gamma = 1/rho |
| Siemens (S) | Siemens (unit) | Conductance unit |
| Stroemtaethed | Current density | J = I/S [A/mm2] |
| Massefylde | Mass density | rho [kg/m3] |
| Klemmaespaending | Terminal voltage | Source with Ri |
| Elektromotorisk kraft (EMK) | Electromotive force (EMF) | E in volt |
| Tomgangsspaending | Open-circuit voltage | = EMF |
| Belastningsmoodstand | Load resistance | External R |
| Akkumulatorbatteri | Accumulator battery | Storage battery |
| Opladning / afladning | Charging / discharging | Battery + capacitor |
| Cirkulationsstroem | Circulating current | Parallel transformers |

### E.2 AC Theory Terms

| Danish Term | English | Context |
|-------------|---------|---------|
| Effektivvaerdi | RMS value | I, U effective |
| Maksimalvaerdi / amplitude | Peak value | Imax = I*sqrt(2) |
| Oejebliksvaerdi | Instantaneous value | i(t), u(t) |
| Middelvaerdi (numerisk) | Mean value (rectified) | Imid = 2/pi * Imax |
| Formfaktor | Form factor | Ueff/Umid |
| Faseforskydning | Phase shift/displacement | phi |
| Faseforskydningsvinkel | Phase angle | arccos(P/S) |
| Wattkomposant | Active (watt) component of current | I*cos(phi) |
| Wattloes komposant | Reactive component of current | I*sin(phi) |
| Effektfaktor | Power factor | cos(phi) or lambda |
| Tilsyneladende effekt | Apparent power | S [VA] |
| Blindeffekt / wattloes effekt | Reactive power | Q [var] |
| Virkeeffekt | Active/real power | P [W] |
| Impedanstrekant | Impedance triangle | Z, R, X |
| Resonans | Resonance | f0 = 1/(2pi*sqrt(LC)) |
| Resonansfrekvens | Resonance frequency | series/parallel |
| Parallelforbindelse / parallelforbindelsens... | Parallel connection | |
| Serieforbindelse | Series connection | |
| Savtaksspaending | Sawtooth voltage | Ch. 6.9 |
| Firkantkurve | Square wave | Ch. 6.8 |
| Sinusformet | Sinusoidal | Standard waveform |
| Vektordiagram | Phasor diagram | AC analysis |
| Fasekompensering | Power factor correction | Capacitor bank |
| Daempespole | Choke coil (ballast) | Fluorescent lamp |
| Reaktorspole | Reactor coil | Lighting ballast |
| L-kobling | L-coupling (inductor + lamp) | Fluorescent circuit |
| LC-kobling | LC-coupling | Phase-shifted circuit |

### E.3 Magnetic / Induction Terms

| Danish Term | English | Context |
|-------------|---------|---------|
| Magnetisk kreds | Magnetic circuit | Ch. 5 |
| Reluktans | Reluctance | Rm = l/(mu*A) |
| Amperevindingstal | Ampere-turns | Fm = N*I |
| Luftspalte / luftgab | Air gap | Magnetic circuits |
| Feltspredning | Field fringing/spreading | Air gap factor |
| Fluxtaethed | Flux density | B [T] |
| Feltstyrke | Field strength | H [A/m] |
| Permeabilitet | Permeability | mu = mu_0 * mu_r |
| Vindingstal | Number of turns | N |
| Selvinduktion | Self-inductance | L [H] |
| Induceret spaending | Induced voltage | e = -N*dPhi/dt |
| Ledersloejfe | Conductor loop | Moving in B-field |

### E.4 Machine-Specific Terms

| Danish Term | English | Context |
|-------------|---------|---------|
| Anker / ankeret | Armature | DC machines |
| Vendepolsvikling | Commutating/interpole winding | DC machines |
| Shuntvikling / shuntgenerator | Shunt winding/generator | DC machines |
| Seriegenerator | Series generator | DC machines |
| Kompounderet (med-/mod-) | Compound (cumulative/differential) | DC machines |
| Boerstespaendingsfald | Brush voltage drop | ~2 V |
| Magnetiseringsvikling | Field/magnetizing winding | |
| Kommutator | Commutator | DC machines |
| Pronybremse | Prony brake | Torque measurement |
| Igangsaetter / igangsaetningsmodstand | Starter / starting resistance | Motor starting |
| Polsko | Pole shoe | Generator/motor |
| Slaeberinge | Slip rings | Wound-rotor motor |
| Kontaktringsmotor | Slip-ring (wound-rotor) motor | Ch. 11 |
| Kortslutningsrotor / kortslutningsmotor | Squirrel-cage motor | Ch. 11 |
| Synkrongenerator | Synchronous generator | Ch. 11 |
| Asynkronmotor | Asynchronous/induction motor | Ch. 11 |
| Slip / slipprocent | Slip / slip percentage | s = (ns-n)/ns |
| Rotorfrekvens | Rotor frequency | f_rotor = s*f |
| Stjerne-trekantstart | Star-delta starting | Y-D starter |
| Steinmetzkobling | Steinmetz connection | Single-phase from 3-ph |
| Drejningsmoment | Torque | M [Nm] |
| Startmoment / startdrejningsmoment | Starting torque | |
| Omloebstal / omdrejningstal | Rotational speed | n [rpm] |
| Polpar / antal poler | Pole pairs / number of poles | p |
| Fremmedmagnetiseret | Separately excited | DC machine type |

### E.5 Transformer Terms

| Danish Term | English | Context |
|-------------|---------|---------|
| Tomgangsforsroeg | No-load/open-circuit test | P0, I10 |
| Kortslutningsforsroeg | Short-circuit test | Pk, Uk |
| Omsaetningsforhold | Turns ratio | n = N1/N2 |
| Procentisk kortslutningsspaending | Percentage impedance voltage | ek% |
| Procentisk resistansspaending | Percentage resistance voltage | er% |
| Stroemvarmetab / kobbertab | Copper loss / I2R loss | PCu |
| Jerntab / tomgangstab | Iron/core loss / no-load loss | PFe, P0 |
| Koblingsbetegnelse | Vector group designation | Dy5, Dy11, Yy0 |
| Primaarvikling / sekundaarvikling | Primary / secondary winding | |
| Henfoert til (primaer/sekundaersiden) | Referred to (primary/secondary) | Z' = Z*n^2 |
| Paralleldrift / parallelforbundne transformere | Parallel operation | Load sharing |
| Varmekabel | Heating cable | Transformer application |

### E.6 Distribution / Protection Terms

| Danish Term | English | Context |
|-------------|---------|---------|
| Stikledning | Service cable/line | From network to consumer |
| Netledning / gruppeledning | Network/group cable | Distribution |
| Distributionsnet | Distribution network | 10 kV / LV |
| Transmissionsnet | Transmission network | HV |
| Radialledning | Radial feeder | Single-end feed |
| Ringledning | Ring main / loop | Two-end feed |
| Samleskinne | Busbar | |
| Lastadskiller | Load-break switch | |
| Effektafbryder | Circuit breaker | |
| Straeknningsafbryder | Line disconnector | |
| Konstanttidsrelae | Definite-time relay | I>, t> settings |
| Stroemafhaengigt relae | Inverse-time relay | IDMT |
| Overstroemsudloeser | Overcurrent trip | I> |
| Kortslutningsudloeser | Short-circuit trip | I>> |
| Smelteintegral | Melting integral (I2t) | Fuse characteristic |
| Totalintegral | Total I2t (let-through) | Fuse characteristic |
| Selektivitet | Selectivity/discrimination | Protection coordination |
| Hoejspaendingssikring | HV fuse | |
| NH-sikring | NH fuse (LV) | NH00, NH1, NH2 |
| CEF-sikring | CEF fuse | |
| Jordslutningsstroem | Earth-fault current | Isolated networks |
| Slukkespole | Petersen coil / arc-suppression coil | |
| Ladestrroem | Charging current | Cable capacitance |
| Nulkapacitans | Zero-sequence capacitance | C0 per phase |
| Isoleret net | Isolated (ungrounded) network | |
| Fluktuationsprocent | Fluctuation percentage | Motor starting dip |
| Spaendingsdyk | Voltage dip | At motor start |
| PEX-M-A1 / PEX-S-A1 / APB-A1 / NOBH-Cu | Cable type designations | Various |
| Luftledning | Overhead line | |
| Kobberledere / Al-ledere | Copper / Aluminium conductors | |

### E.7 Lighting Terms

| Danish Term | English | Context |
|-------------|---------|---------|
| Lysstrroem | Luminous flux | Phi [lm] |
| Lysstyrke | Luminous intensity | I [cd] |
| Belysningsstyrke | Illuminance | E [lux] |
| Luminans | Luminance | L [cd/m2] |
| Rumvinkel | Solid angle | Omega [sr] |
| Sfaerisk middellysstyrke | Mean spherical intensity | |
| Lysfordelingskurve | Light distribution curve | Polar diagram |
| Lysudbytte | Luminous efficacy | lm/W |
| Armaturvirkningsgrad | Luminaire efficiency | |
| Belysningsvirkningsgrad | Utilization factor | CU |
| Rumfaktor | Room index | k = l*b/(hm*(l+b)) |
| Forringelsesfaktor | Maintenance/depreciation factor | MF |
| Reflektanser / reflektionsfaktorer | Reflectances | Ceiling/wall/floor |
| Lysroer / lysstofrroer | Fluorescent tube | |
| Projektroer | Projector/floodlight | |
| ISOLUX-diagram | Isolux diagram | Outdoor lighting |
| Gloedelampe | Incandescent lamp | |
| Halogenlampe | Halogen lamp | |
| Panikbelysning | Emergency/panic lighting | |
| Fotometerbaenk | Photometer bench | |
| Fotometerhoved | Photometer head | |

### E.8 Heating Terms

| Danish Term | English | Context |
|-------------|---------|---------|
| Varmeledningstal | Thermal conductivity | lambda [W/(m*K)] |
| Transmissionstal / U-vaerdi | Thermal transmittance | U [W/(m2*K)] |
| Isolans / varmeresistans | Thermal resistance | R [m2*K/W] |
| Overgangsisolanser (Ri, Ru) | Surface resistances (internal/external) | |
| Dielektrikum | Dielectric material | epsilon_r |
| Luftskiftefrekvens | Air change rate | Ventilation heat loss |
| Transmissionstab | Transmission heat loss | Q = U*A*deltaT |

### E.9 Measurement / Instrument Terms

| Danish Term | English | Context |
|-------------|---------|---------|
| Drejespoleinstrument | Moving-coil instrument | DC only |
| Bloedtjernsinstrument | Moving-iron instrument | AC/DC |
| Skalaomraade | Scale range | Full-scale |
| Klasseaaerkning | Accuracy class | kl. 0.5, 1, 1.5, 2.5 |
| Fuldt udslag | Full-scale deflection | |
| Skalafaktor | Scale factor | W/div |
| Elektricietsmaaleler | Energy meter | kWh meter |
| Maaletransformer | Instrument transformer | CT/VT |
| Stroemtransformer | Current transformer | kn = Ip/Is |
| Spaendinstransformer | Voltage transformer | |
| Wheatstone bro / maalebro | Wheatstone bridge | Resistance measurement |
| Maxwell bro | Maxwell bridge | L measurement |
| Telefonmaalebro | Telephone bridge | AC bridge |
| Normalmodstand / dekademodstand | Standard/decade resistance | |
| Maaletraad | Measuring wire | Bridge element |
| Sand spaening / sand stroem | True voltage / true current | Instrument connection |
| Maaleusikkerhed | Measurement uncertainty | |
| Procentisk usikkerhed | Percentage uncertainty | |

---

## F) Recommendations for the App

### F.1 Mapping Exercises to Required Calculation Modules

| Exercise Category | Existing Module in App? | Recommendation |
|-------------------|------------------------|----------------|
| **Ohm's law / basic resistance** (Ch. 1) | Partial (cable sizing uses R=rho*l/S) | **Needs: Basic Ohm's Law calculator** with temperature correction |
| **DC circuit analysis** (Ch. 2) | No dedicated module | **Needs: DC Circuit Solver** (series/parallel/Kirchhoff) |
| **DC power/energy** (Ch. 3) | Partial (power calc exists) | Extend with efficiency chain, energy cost calc |
| **Capacitance/RC circuits** (Ch. 4) | No | **Needs: Capacitor/RC calculator** (charging curves, time constant) |
| **Magnetic circuits** (Ch. 5) | No | **Needs: Magnetic circuit calculator** (reluctance, inductance, induction) |
| **AC impedance (single-phase)** (Ch. 6) | Partial (power factor exists) | **Needs: AC Impedance Calculator** (RLC series/parallel, resonance) |
| **Three-phase systems** (Ch. 7) | YES - existing 3-phase module | Extend to handle asymmetric loads and broken-neutral scenarios |
| **Instrument calculations** (Ch. 8) | No | Lower priority - not needed for autorisation exam |
| **Transformers** (Ch. 9) | YES - existing transformer module | Verify parallel operation and vector group calculations |
| **DC machines** (Ch. 10) | No | Lower priority for modern installations; consider starter design module |
| **AC machines (motors)** (Ch. 11) | Partial (motor starting exists) | **Needs: Motor slip/torque/efficiency calculator**, starter sizing |
| **Lighting design** (Ch. 12) | No | **Needs: Lumen method calculator** (room factor, utilization, maintenance) |
| **Room heating** (Ch. 13) | No | **Needs: U-value / heat loss calculator** |
| **HV transmission** (Ch. 14) | No (specialized) | Lower priority |
| **10 kV distribution** (Ch. 15) | Partial (voltage drop exists) | **Needs: Extended voltage drop** for MV networks, cable thermal limits |
| **Protection coordination** (Ch. 16) | No | **Needs: Time-current selectivity checker** |
| **LV distribution** (Ch. 17) | YES - core functionality | Already covered (voltage drop, Ik, motor starting dip) |
| **Mixed / system design** (Ch. 18) | Partial | Covered by combining existing modules |

### F.2 Priority Ranking for New Modules

Based on relevance to the Danish el-autorisationsprove:

1. **HIGH PRIORITY** (directly tested in autorisation exam):
   - AC Impedance Calculator (single-phase RLC) - covers Ch. 6
   - Extended 3-phase asymmetric load handler - covers Ch. 7
   - Motor starting/slip calculator - covers Ch. 11
   - Protection selectivity tool - covers Ch. 16
   - Cable thermal short-circuit verification (K*S formula) - covers Ch. 15

2. **MEDIUM PRIORITY** (foundational knowledge):
   - Basic Ohm's Law + resistivity calculator with temperature - covers Ch. 1
   - DC circuit solver (series/parallel/dividers) - covers Ch. 2
   - Transformer parallel operation / load sharing - covers Ch. 9
   - Lighting lumen method calculator - covers Ch. 12

3. **LOWER PRIORITY** (specialized or legacy):
   - Magnetic circuit calculator - covers Ch. 5
   - DC machine analysis - covers Ch. 10
   - Capacitor/RC time constant - covers Ch. 4
   - Room heating U-value calculator - covers Ch. 13
   - Instrument/bridge calculations - covers Ch. 8

### F.3 Material Constants Required

The app should include these material constants from Bilag B:

| Material | Resistivity (Ohm*mm2/m) | Temp. Coeff (deg C^-1) | Density (kg/m3) |
|----------|------------------------|----------------------|-----------------|
| Kobber (Cu) | 0.0175 | 4.0 * 10^-3 | 8900 |
| Aluminium (Al) | 0.029 | 3.7 * 10^-3 | 2700 |
| Jern (Fe) | 0.140 | 6.4 * 10^-3 | 7800 |
| Konstantan | 0.488 | 5 * 10^-6 | 8900 |
| Kromnikkel | 1.05 | 0.13 * 10^-3 | 8400 |
| Wolfram (W) | 0.055 | 4.0 * 10^-3 | 19300 |
| Kul (C) | 40 | -0.4 * 10^-3 | 1600 |
| Kanthal A1 | 1.45 | ~0 | 7100 |
| Soelv (Ag) | 0.0158 | 4.0 * 10^-3 | 10500 |

### F.4 K-values for Conductor Dimensioning (from Bilag C)

Already partially in the app. The book confirms:

| Conductor Type | K | T2 (deg C) | T1 (deg C) |
|---------------|---|------------|------------|
| Cu + PVC/halogenfri | 115 | 160 | 70 |
| Cu + PEX/EPR | 143 | 250 | 90 |
| Cu + gummi | 141 | 200 | 60 |
| Al + PVC/halogenfri | 76 | 160 | 70 |
| Al + PEX | 94 | 250 | 90 |
| Al + butylgummi | 89 | 220 | 85 |
| Cu uisoleret | 5000 | 200 | 65 |
| Al uisoleret | 11200 | 200 | 65 |

---

## G) Extraction Notes

### Issues Encountered:
1. **PDF OCR quality:** The PDF is an OCR scan from a specialized accessibility edition (SU-styrelsen/Studiebogservice). The OCR note warns that mathematical symbols may not be perfectly recognized. Most formulas extracted correctly, but some complex expressions may have minor artifacts.
2. **.doc extraction:** The Word 97-2003 .doc format was not extractable with available tools (no catdoc/antiword installed). The `strings -e l` command extracted text but with corrupted Danish characters (ae/oe/aa lost). The PDF was the authoritative source.
3. **Missing answers:** The facitliste explicitly omits answers for parts of Chapter 15 and all of Chapters 16 and 17, as "many results depend on component data and other factors making multiple solutions possible."
4. **Figures/diagrams:** Approximately 80+ circuit diagrams, vector diagrams, and tables are referenced but not extractable as text. These would need image-based extraction for full problem reproduction.

### Summary Statistics:
- **Total exercises found:** ~430+ (numbered, across 18 chapters)
- **Total answers in facitliste:** ~350+ numerical results
- **Key subject areas:** Ohm's law, DC circuits, AC theory (RLC), 3-phase, transformers, machines (DC+AC), lighting, heating, MV/LV distribution, protection
- **Unique technical vocabulary identified:** ~180+ terms not typically found in autorisation exam vocabulary
- **Formulas catalogued:** 40 core formulas covering all exercise types

---

*End of study document.*
