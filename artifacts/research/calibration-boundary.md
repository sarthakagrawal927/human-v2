# Calibration boundary — 2026-10-01

Owner requires scientifically calibrated annual progression and fatal outcomes.
Only the population reference is implemented. There is no claim that it
fulfills the modified-body prediction requirement.

| Source reviewed | Supported endpoint | Why it cannot supply the requested modifier prediction |
|---|---|---|
| CDC/NCHS U.S. Life Tables2023, Table1 | Annual all-cause period mortality and conditional population survival | No organ-state measurements, intervention inputs or individual causes; fixed2023 population experience, not a future forecast. |
| NIA Research in Context: Can we slow aging? | Research on aging and organ-specific biological measures | Does not provide calibrated yearly response equations for the six capacity edits. |
| NHLBI Calculating risks for heart disease | Specified cardiovascular event risk within a10-year horizon | Inputs are clinical risk factors; endpoints/horizon are not universal death or arbitrary lung/heart capacity changes. |

Sources:
- https://www.cdc.gov/nchs/data/nvsr/nvsr74/nvsr74-06.pdf
- https://www.nia.nih.gov/news/research-context-can-we-slow-aging
- https://www.nhlbi.nih.gov/news/2022/calculating-risks-heart-disease

The six current sliders do not identify physical interventions. More lung
exchange could describe different structural, ventilation or gas-transfer
mechanisms; the old assumed mass/rest costs do not resolve that ambiguity.
Applying annual mortality multipliers from those sliders would invent a
relationship. Likewise, a short heat/fluid domain boundary cannot become a
fatal diagnosis or be scaled into an annual aging rate.

A defensible next model needs a defined intervention/mechanism, measured inputs
and population, a specified endpoint/time horizon, a calibrated quantitative
response with uncertainty and independent longitudinal validation. Individual
fatal years should remain probabilistic outcomes or unknown, never fabricated
certainty. No source reviewed establishes all those conditions for this product.
The current interface therefore identifies unsupported experiments explicitly.

Data audit: source workbook and SHA256 preserved,100 rows reproduce exactly,
conditional survival matches published lx ratios to2.929e-7 rounding tolerance.
This validates data import and arithmetic only.
