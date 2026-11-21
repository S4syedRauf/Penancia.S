# WHO 2021 Semen Analysis Reference Guide (6th Edition)

This document establishes the clinical baseline limits and decision rules implemented inside `Penancia.S.Domain.Rules`.

---

## 1. Lower Reference Limits (5th Centile, 95% Confidence Interval)

Source: *WHO Laboratory Manual for the Examination and Processing of Human Semen, Sixth Edition (2021), Table 2.1*.

| Parameter | 5th Centile Lower Limit | Clinical Units | Implementation Class |
| :--- | :--- | :--- | :--- |
| **Ejaculate Volume** | $\ge 1.4$ | $\text{mL}$ | `Who2021Limits.MinVolumeMl` |
| **pH** | $\ge 7.2$ | Dimensionless | `Who2021Limits.MinPh` |
| **Sperm Concentration** | $\ge 16.0$ | $\times 10^6 \text{ / mL}$ | `Who2021Limits.MinConcentrationMillionPerMl` |
| **Total Sperm Number** | $\ge 39.0$ | $\times 10^6 \text{ / ejaculate}$ | `Who2021Limits.MinTotalSpermCountMillion` |
| **Total Motility (PR + NP)** | $\ge 42.0$ | $\%$ | `Who2021Limits.MinTotalMotilityPercent` |
| **Progressive Motility (PR)** | $\ge 30.0$ | $\%$ | `Who2021Limits.MinProgressiveMotilityPercent` |
| **Vitality (Live Sperm)** | $\ge 54.0$ | $\%$ | `Who2021Limits.MinVitalityPercent` |
| **Normal Forms (Morphology)** | $\ge 4.0$ | $\%$ (Strict Kruger) | `Who2021Limits.MinNormalFormsPercent` |
| **Leukocyte Threshold** | $< 1.0$ | $\times 10^6 \text{ / mL}$ | `Who2021Limits.MaxLeukocytesMillionPerMl` |

---

## 2. Clinical Consistency Invariants

The Domain Rules Engine enforces these biological rules:
1. **Motility vs Vitality**:
   $$\text{Total Motility } (\%) \le \text{Vitality } (\%)$$
   *Dead sperm cannot be motile. A flag `MOTILITY_EXCEEDS_VITALITY` is raised if violated.*
2. **Progressive vs Total Motility**:
   $$\text{Progressive Motility } (\%) \le \text{Total Motility } (\%)$$
3. **Concentration Cross-Check**:
   Discrepancies exceeding $15\%$ between automated video concentration (pycasa) and manual haemocytometer counts trigger `CONCENTRATION_MISMATCH` requiring morphologist review.
   *Note: the 15% threshold is the recorded parameter decision (`ParameterSet.ConcentrationMismatchRel = 0.15m`); code and tests agree on 15%.* 
4. **Completeness Invariant**:
   A missing parameter evaluates to `INCOMPLETE`, never `Normal`.
