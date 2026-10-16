# Animated sandbox direction review

Owner rejected the current static workbench and asked to set many things together,
simulate them, and show animations. This is an overhaul proposal, not a completed
product change. The previous receipt is preserved at
`.fleet/design-review-before-animated-overhaul.json`.

All three directions help curious learners understand coupled biological
tradeoffs by jointly configuring a bounded simulated body and replaying recorded
consequences. Their screen job is configure → simulate → inspect → iterate.
Quantities use the existing deterministic energy-balance and heat-fluid models.
SVG activity motion is illustrative, not clinical organ frequency.

| Direction | Visual system | Interaction and signature | Deliberate risk |
| --- | --- | --- | --- |
| A Systems Cockpit | Sage/warm lab, sans typography, traits/body/telemetry columns, environment strip and replay below. Green actions, coral heat, blue fluid. | Simultaneous sliders beside the large connected body; play/scrub drives the same recorded state and chart. | Most precise and familiar, but can retain the dashboard feel the owner rejected. |
| B Life Theatre | Warm environmental stage, serif scene heading, sans controls, trait console across the page, earthy actions with heat/fluid semantics. | The body lives in the scenario; combined edits and daily recovery become a visible story. Recommended. | Environmental art can imply realism beyond the model; scene state and quantities must remain explicit. |
| C Causal Studio | Dark technical canvas, monospace headings, dependency graph as the main stage, compact body inset, mint actions. | Animated links expose energy → work → heat → cooling → fluid, including feedback; synchronized time/chart. | Graph reading has a higher learning cost and makes the person secondary. |

The previews support all six simultaneous trait changes, scenario presets,
workload, activity/recovery water, days, play/pause/restart/speed/scrubbing.
Environment and daily phase structure remain fixed presets in the current model.
Editable phases and ambient conditions are proposed in owning GitHub issue #1,
not represented as finished features here. Baseline output is not extrapolated
past its boundary; no lifespan or survival predictions.

Chrome prototype checks: each lane's playback advances, pause holds time,
multiple edits remain combined, changing scenario and water recomputes recorded
results, no page errors, no document overflow at 1440/768/390. Screenshots for
every width accompany the probes. Product source is unchanged; this does not
replace the existing model or full product qualification.

Standard controls preserve project-native range/select patterns. No runtime
dependency added. Existing receipt records Preline range/tab/table provenance.
The referenced optional design-inspiration helper is absent at both installed
and Fleet skill paths; direction definitions follow design-workflow's explicit
direction-set requirements directly. No external design claims or assets used.

Local preview: http://127.0.0.1:44620/ (own Python static server session 45282).
Rebuild bundle: `pnpm exec esbuild artifacts/design/animated-directions/probe.js --bundle --format=esm --outfile=artifacts/design/animated-directions/bundle.js`.
Owner direction selection is pending. No completed-overhaul review scores claimed.
