# Pulse qualification

Native qualification and local acute integration; not a lifetime model or deployed production service.
Engine: Pulse 4.4.0, REL_4_4_0, SHA 5e29e5b13710a08cec90874be7d36ecb192ebcda. Upstream Apache 2.0 source: https://gitlab.kitware.com/physiology/engine.

Runtime built with AppleClang 21 and CMake in ignored `.local/pulse-build`; Python 3.14 isolated in `.local/pulse-venv`. Existing Homebrew OpenJDK 27 generated upstream runtime data from the release Data.xlsx in the fresh ignored `.local/pulse-runtime`. No production dependencies, credential changes, deployment, at qualification time. The subsequent local integration is described below.

All cases initialize the same male reference: age 44 years, height 180.34 cm, weight 77.1107 kg; remaining values follow engine defaults. `baseline.patient.json` records the resolved upstream patient values. Modified cases read reference surface/volume values but initialize the original patient inputs, changing only the named mechanism. Engine initialization must converge within its normal bounds; no bounds are disabled. Logs preserve convergence and warnings.

`probe.py` records twelve coupled outputs in initial runs and thirteen including blood pH in later runs every ten simulated seconds, active events and failure of time advancement. Raw output units and exact run arguments are in each JSON. Wall time includes stabilization; timestamps and wall timings are not used in reproducibility comparison. Fatal/lifetime predictions are not inferred.

Replay from `.local/pulse-runtime` with PYTHONPATH pointing to the absolute install/python and install/bin directories:

```sh
../pulse-venv/bin/python ../../artifacts/research/pulse/probe.py --case baseline --out ../../artifacts/research/pulse/baseline-replay.json --seconds 180
```

Then pass `--reference ../../artifacts/research/pulse/baseline.patient.json` and one or more of `--surface 1.2`, `--volume 1.2`, `--breathing 2`, `--exercise 0.3`, `--pressure 525`. Surface changes gas-exchange area; volume changes total capacity; breathing multiplies the endogenous respiratory rate. They are distinct abstractions, not anatomical surgery or universal real-world response predictions.

Qualification assertions: identical cases must have identical rows and stabilization outputs; only named patient fields may differ; requests must be finite; initialization/action rejection must fail visibly. No test requires a universal penalty or an improvement. Differences must be reported from raw output.

Scope: published adult patient methodology is 18–65 years. Independent age snapshots are not longitudinal progression. Custom modification outcomes need experiment-specific validation before a scientific-calibration claim.


## Observed qualification results

Sixteen recorded runs complete with finite outputs. An identical baseline repeats all 19 ten-second rows and all stabilized outputs exactly; an identical sudden-breathing case also reproduces its full 1,500-point dense trajectory exactly. Dense 30-second means independently reproduce to at most 1.888e-11 absolute floating-point summation difference. `python3 artifacts/research/pulse/audit.py` rechecks the recorded runs.

The following are engine outputs averaged over seconds 180–210, not clinical predictions:

| Experiment | Baseline oxygen saturation | Changed oxygen saturation | Observation |
|---|---:|---:|---|
| Exchange surface +20%, rest | 97.56% | 97.65% | Small change near resting saturation plateau. |
| Exchange surface +20%, exercise intensity 0.3 | 90.60% | 92.23% | Larger oxygen difference; heart rate remains at the model's 177.2/min ceiling. |
| Total lung capacity +20%, same exercise | 90.60% | 92.12% | Different CO2/ventilation response from the exchange-only edit. |
| Exchange surface +20%, pressure 525 mmHg | 92.07% | 92.62% | Improvement does not resolve the modeled hypoxia flag. |
| Combined surface +20%, volume +20%, sudden rate multiplier 2, same exercise | 90.60% | 92.92% | Coupled result, not sum of independent bonuses; heart ceiling and hypoxia remain. |

At rest, sudden breathing-rate multiplier 2 lowers mean arterial CO2 from 37.8875 to 36.5088 mmHg; endogenous feedback gives approximately 17.6 breaths/min rather than a permanent forced 24/min. RespiratoryAlkalosis becomes active after a modeled transient. The event uses cardiac-cycle pH >7.45 and CO2 <37 mmHg for entry, then pH <=7.43 **and** CO2 >39 for clearance (RespiratoryModel.cpp lines 3223–3233). Its continued activity is a hysteretic engine classification, not proof of current injury or death; pH is approximately 7.42 at 180 seconds.

Important: the volume edit also increases default derived alveolar area because the engine relates area to total capacity. This is a specified model dependency, not evidence that every anatomical enlargement creates proportional functional exchange tissue. The exchange-only edit leaves total capacity unchanged. Neither abstraction models surgical feasibility, space competition, added tissue mass or long-term damage. Rest metabolic rate is unchanged across these specific model edits; inventing a cost would be unjustified.

## Integration blockers found

1. The upstream Python `PulseEngine.process_action` discards the native boolean result. The prototype uses the bound native method to preserve rejection detection. A production adapter must not mistake its None return for rejection or acceptance.
2. By default a respiratory modification triggers 600 simulated seconds of hidden restabilization (Controller.cpp 1072–1082). Sudden cases explicitly set incremental=true, avoiding a skipped transient; all runs preserve post-action engine time.
3. CerebralBloodFlow is instantaneous brain inflow (CardiovascularModel.cpp 1361). A single 10-second sample can differ greatly just because of cardiac phase. All reported mean comparisons use 20 ms samples over 30 seconds. Dense raw samples are retained.
4. The source's moderate/severe hypocapnia branch compares arterial **oxygen** with CO2 thresholds 30/15 mmHg (BloodChemistryModel.cpp 512–528). These flags are not trustworthy CO2 diagnoses in this released version. Do not drive fatal points, scoring or explanations from them. No upstream source patch has been made.
5. These runs have not independently validated custom modification response magnitudes. A published engine validation suite does not qualify every new coupled experiment. Acute engine events do not calibrate annual progression or a personal fatal year.

The engine is promising for mechanism-specific short experiments, but it is **not accepted as a scientifically calibrated lifetime simulator**. The local home now displays acute engine results without scores; it still has no calibrated annual/fatal outcomes.

## Local integration — 2026-10-02

Home.tsx uses the local Node /api/physiology endpoint, scripts/physiology.mjs and
physiology.py. Six simultaneous mechanisms are bounded/validated at the API:
exchange area, total capacity, respiratory drive, heart contraction modifier,
heart-rate drive and systemic resistance. Activity/pressure match the unmodified
reference. Original patient initialization and native convergence/rate bounds
remain intact; action success is checked through the exact-release native
binding. New production/browser packages were not added.

combined-integrated.json retains a four-change native comparison;
circulation-integrated.json retains heart drive/resistance +20 at rest;
six-controls-integrated.json retains all six together during exertion.
All include raw19-point trajectories,1500 dense samples/run, 30-second means,
resolved patients, units, inputs, engine/source and adapter/reference hashes.

Independent adapter executions reproduce every physiological row, dense sample,
stabilized value and mean exactly for the reference and four-change body; see
integration-replay-audit.json. Browser verification additionally runs that
comparison through the actual local HTTP endpoint and matches recorded
trajectories/dense samples. Fixture-based UI/a11y checks are labeled separately.
`python3 artifacts/research/pulse/audit.py` audits all22 retained native runs,
including the six runs nested in three integration comparisons.

Additional wrapper defect: Python set_event_handler calls a missing native
keep_event_changes binding in release4.4.0. Integration does not use it. Audited
threshold entry timestamps are read from native logs after the explicit
post-stabilization marker. Displayed values come from the nearest subsequent
retained sample, with sample time separately labeled. It does not claim those
instantaneous readings equal the cardiac-cycle trigger averages.

The native custom-volume warning (“No guarantees of model validity”) remains
in exported data and the model disclosure. Interventions are initialized/model
modifiers, not validated real-world organ engineering. Mass, space, adaptation,
chronic injury, sustainable-workload scores and fatal/annual outcomes stay unknown.

One cold matched comparison takes about100–120 wall seconds on this checkout;
each engine child is capped at90 seconds. Completed inputs cache in one local
server process and same-input simultaneous requests deduplicate.
