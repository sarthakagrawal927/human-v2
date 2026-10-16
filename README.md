# Human V2

One homepage: a human body, experiment selector and Simulate.

The current home runs matched acute Pulse4.4.0 physiology experiments locally.
Combine six mechanism controls, activity and air pressure, then play recorded
results and compare pressure, flow, oxygen, CO₂, pH and energy. Export preserves
both raw runs and their versioned inputs. First new comparisons can take up to
three minutes; repeat inputs reuse the completed result in that server process.

Custom organ changes are not independently clinically calibrated. The model does
not predict annual deterioration, individual fatal years or failing organs.
Native engine flags are not injury or survival decisions. No damage is invented
just to ensure every edit has a downside.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Development: http://localhost:5317. Production preview:
`pnpm build && pnpm preview`, http://127.0.0.1:44173/.

`pnpm test`, `pnpm check`, `pnpm build`, `pnpm test:e2e` verify the active
surface and retained model/API. The browser suite includes a real native combined
run plus recorded-fixture UI checks. A qualified native runtime is required for
the real run; it is never replaced with mock scores. `python3 scripts/audit-annual.py` verifies all
100 annual rows against the preserved official workbook and conditional
survival against published survivors. Age100+ is open-ended and excluded as
an annual probability. The annual source/model remain preserved; this population reference is not
converted to modified-body effects.

Previous workbench and heat/fluid engine remain in source; former20 browser
scenarios are retained under tests/legacy-browser and are not active-homepage
checks. Existing browser history and local D1 data remain untouched.
No commit, push or deployment. Tracking:
https://github.com/Significant-Hobbies/human-v2/issues/1.

## Native runtime

This checkout has an isolated local Pulse build and Python environment; no new
browser/production package was added. Runtime paths are ignored:
`.local/pulse-build/install/{python,bin}`, `.local/pulse-venv/bin/python`, and
`.local/pulse-runtime`. The source is Apache2.0, release REL_4_4_0 at
5e29e5b13710a08cec90874be7d36ecb192ebcda. The engine reports its short SHA5e29e5b.
Adapter checks the release/hash before accepting outputs. A missing runtime
returns503 with no substitute score. Build/setup qualification and replay
commands are in artifacts/research/pulse/README.md. There is not yet an automated
fresh-machine native bootstrap or a production native service.

`/api/physiology` is a local Node endpoint, not deployed Worker functionality.
It accepts only bounded mechanism settings and fixed environment/activity
choices; one native comparison runs at a time. Identical requests deduplicate,
completed comparisons cache in memory (12 entries), and raw runs/logs persist
in ignored .local/physiology-* directories. Those files are useful for replay
audit; retention cleanup is not automated. Each native child has a90-second
timeout; convergence/rejection/timeout never produces a valid comparison.

Recorded native integration and exact replay evidence:
artifacts/research/pulse/combined-integrated.json and integration-replay-audit.json.
