import { useMemo, useRef, useState } from "react";
import type { Configuration } from "../model/simulator";
import {
  compareTimelines,
  elapsedLabel,
  explainTimeline,
  exportTimelineReplay,
  importTimelineReplay,
  removeOneReplays,
  SCENARIOS,
  scenarioSettings,
  simulateTimeline,
  TIMELINE_ASSUMPTIONS,
  TIMELINE_SOURCES,
  type TimelineSettings,
} from "../model/timeline";

interface Props {
  configuration: Configuration;
  reference: Configuration;
  settings: TimelineSettings;
  recordedSettings: TimelineSettings;
  stale: boolean;
  running: boolean;
  onSettings: (settings: TimelineSettings) => void;
  onRun: () => void;
  onImport: (replay: ReturnType<typeof importTimelineReplay>) => void;
}
const n = (v: number, decimals = 2) => v.toFixed(decimals);
const signed = (v: number, unit: string) => `${v >= 0 ? "+" : "−"}${n(Math.abs(v))} ${unit}`;
export function LifeTimeline(props: Props) {
  const { configuration, reference, settings, recordedSettings, stale } = props;
  const [problem, setProblem] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const analysis = useMemo(() => {
    const run = simulateTimeline(configuration, recordedSettings);
    const baseline = simulateTimeline(reference, recordedSettings);
    return {
      run,
      baseline,
      comparison: compareTimelines(run, baseline),
    };
  }, [configuration, reference, recordedSettings]);
  const { run, baseline, comparison } = analysis;
  const removed = useMemo(
    () =>
      showRemoved
        ? removeOneReplays(configuration, recordedSettings).map((r) => ({
            ...r,
            matched: compareTimelines(run, r.result),
          }))
        : [],
    [showRemoved, configuration, recordedSettings, run],
  );
  const { sharedRun, sharedReference } = comparison;
  const selected = SCENARIOS.find((s) => s.id === settings.scenarioId);
  const recordedScenario = SCENARIOS.find((s) => s.id === recordedSettings.scenarioId);
  const ending = (r: typeof run) =>
    r.boundary
      ? `${r.boundary.kind === "heat" ? "Heat" : "Fluid"} model boundary at ${elapsedLabel(r.elapsedSeconds)}`
      : `Completed ${r.settings.days} repeated days`;
  const phases = run.phases.filter((p) => p.day <= 2 || p.day === run.phases.at(-1)?.day);
  return (
    <details className="life-timeline" open>
      <summary>Follow this body over time</summary>
      <div className="timeline-content">
        <p>
          A short test is one moment. Repeat the same day and follow heat, lost fluid and recovery.
          The model carries stored heat and unreplaced sweat fluid into tomorrow.
        </p>
        <div className="timeline-controls">
          <div>
            <label htmlFor="timeline-scenario">Daily conditions</label>
            <select
              id="timeline-scenario"
              value={settings.scenarioId}
              onChange={(e) =>
                props.onSettings(
                  scenarioSettings(
                    e.target.value as TimelineSettings["scenarioId"],
                    settings.days,
                    settings.requestedWorkW,
                  ),
                )
              }
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="timeline-days">Repeated days</label>
            <select
              id="timeline-days"
              value={settings.days}
              onChange={(e) => props.onSettings({ ...settings, days: Number(e.target.value) })}
            >
              {[
                1,
                7,
                30,
                90,
                ...(![1, 7, 30, 90].includes(settings.days) ? [settings.days] : []),
              ].map((days) => (
                <option key={days} value={days}>
                  {days} days
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="timeline-work">Activity workload (W)</label>
            <input
              id="timeline-work"
              type="number"
              min={0}
              max={300}
              step={1}
              value={settings.requestedWorkW}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isInteger(value) && value >= 0 && value <= 300)
                  props.onSettings({ ...settings, requestedWorkW: value });
              }}
            />
          </div>
          <div>
            <label htmlFor="timeline-activity-fluid">Fluid during activity (L/h)</label>
            <input
              id="timeline-activity-fluid"
              type="number"
              min={0}
              max={1.5}
              step={0.05}
              value={settings.activityDrinkLPerHour}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value) && value >= 0 && value <= 1.5)
                  props.onSettings({ ...settings, activityDrinkLPerHour: value });
              }}
            />
          </div>
          <div>
            <label htmlFor="timeline-recovery-fluid">Fluid at rest / recovery (L/h)</label>
            <input
              id="timeline-recovery-fluid"
              type="number"
              min={0}
              max={1.5}
              step={0.05}
              value={settings.recoveryDrinkLPerHour}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value) && value >= 0 && value <= 1.5)
                  props.onSettings({ ...settings, recoveryDrinkLPerHour: value });
              }}
            />
          </div>
        </div>
        <p className="small-copy">
          {selected?.description} Activity: {selected?.temperatureC}°C · {selected?.humidityPercent}
          % humidity. Rest/recovery: 22°C · 40%.
        </p>
        <p className="small-copy">
          Each day: 8 h rest → 4 h activity → 12 h recovery. Fluid controls describe offered
          replacement for sweat losses; they are not drinking recommendations.
        </p>
        <button
          type="button"
          className="button secondary"
          onClick={props.onRun}
          disabled={props.running}
        >
          Run repeated-day scenario
        </button>
        {stale && (
          <p role="status" className="stale-inline" data-testid="timeline-stale">
            Draft changed. Results below belong to the previous body and daily conditions. Run again
            before saving or exporting.
          </p>
        )}
        <p className="small-copy" data-testid="timeline-coverage">
          No aging, chronic damage, adaptation or lifespan prediction. Repeating 90 days does not
          validate 90-day biology. These are illustrative heat/fluid equations, with no validated
          predictive horizon.
        </p>
        <p className="timeline-scroll-hint">
          Scroll tables horizontally to compare →. Quantity labels stay visible.
        </p>
        <section
          className="table-scroll" // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the named table region.
          tabIndex={0}
          aria-label="Timeline trajectory comparison"
        >
          <table data-testid="timeline-comparison" id="timeline-results">
            <caption>
              Recorded {recordedScenario?.name} · {recordedSettings.requestedWorkW} W task ·
              identical daily conditions
            </caption>
            <thead>
              <tr>
                <th scope="col">Trajectory</th>
                <th scope="col">Reference body</th>
                <th scope="col">Recorded body</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Modeled outcome</th>
                <td>{ending(baseline)}</td>
                <td data-testid="timeline-outcome">{ending(run)}</td>
              </tr>
              <tr>
                <th scope="row">Peak heat equivalent</th>
                <td>{n(baseline.peakHeatEquivalentC)}°C</td>
                <td>{n(run.peakHeatEquivalentC)}°C</td>
              </tr>
              <tr>
                <th scope="row">Peak sweat-fluid deficit</th>
                <td>{n(baseline.peakFluidDeficitPercent)}% mass</td>
                <td>{n(run.peakFluidDeficitPercent)}% mass</td>
              </tr>
            </tbody>
          </table>
        </section>
        <p className="small-copy">
          Heat equivalent = stored heat ÷ assumed whole-body heat capacity. It is not core
          temperature. Trajectories may end at different times; resource differences below use the
          same elapsed interval.
        </p>
        {run.boundary && (
          <p className="timeline-boundary" data-testid="timeline-boundary">
            {run.boundary.message} The remaining{" "}
            {elapsedLabel(run.requestedSeconds - run.elapsedSeconds)} is unknown; the simulation
            stops instead of inventing an outcome.
          </p>
        )}
        <p data-testid="timeline-cause">
          {comparison.firstDivergence
            ? `First recorded divergence at ${elapsedLabel(comparison.firstDivergence.elapsedSeconds)}. ${comparison.firstDivergence.detail}`
            : "No modeled divergence under these conditions. Extra reserve need not improve or harm this task."}
        </p>
        <section
          className="table-scroll"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the named table region.
          tabIndex={0}
          aria-label="Matched timeline resource comparison"
        >
          <table data-testid="timeline-matched">
            <caption>
              Matched interval: start → {elapsedLabel(comparison.sharedSeconds)} · recorded body
              minus reference
            </caption>
            <thead>
              <tr>
                <th scope="col">Recorded quantity</th>
                <th scope="col">Reference</th>
                <th scope="col">Body</th>
                <th scope="col">Difference</th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "Delivered work",
                  sharedReference.deliveredWorkJ / 1000000,
                  sharedRun.deliveredWorkJ / 1000000,
                  "MJ",
                ],
                [
                  "Metabolic energy",
                  sharedReference.metabolicJ / 1000000,
                  sharedRun.metabolicJ / 1000000,
                  "MJ",
                ],
                [
                  "Stored heat at interval end",
                  sharedReference.final.excessHeatJ / 1000,
                  sharedRun.final.excessHeatJ / 1000,
                  "kJ",
                ],
                ["Sweat water used", sharedReference.sweatL, sharedRun.sweatL, "L"],
                [
                  "Fluid deficit at interval end",
                  sharedReference.final.fluidDeficitL,
                  sharedRun.final.fluidDeficitL,
                  "L",
                ],
              ].map(([title, ref, body, unit]) => (
                <tr key={title}>
                  <th scope="row">{title}</th>
                  <td>
                    {n(ref as number)} {unit}
                  </td>
                  <td>
                    {n(body as number)} {unit}
                  </td>
                  <td>{signed((body as number) - (ref as number), unit as string)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <div className="timeline-causal-trace" data-testid="timeline-delayed-cause">
          <h3>What accumulates, and why</h3>
          {explainTimeline(run).map((detail) => (
            <p key={detail}>{detail}</p>
          ))}
        </div>
        <details>
          <summary>Accumulation and recovery ledger</summary>
          <p className="small-copy">
            First two days and final simulated day shown. Full hourly records and every phase ledger
            are in the replay export. Phase and day transitions retain heat and fluid state. Each
            point labels the interval supplying its rates; at an interval end, rates describe the
            preceding step and state describes the resulting instant.
          </p>
          <section
            className="table-scroll"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the named table region.
            tabIndex={0}
            aria-label="Accumulation and recovery ledger table"
          >
            <table data-testid="timeline-ledger">
              <caption>Recorded body · phase boundaries · heat / sweat-fluid deficit</caption>
              <thead>
                <tr>
                  <th scope="col">Day / phase</th>
                  <th scope="col">Start</th>
                  <th scope="col">End</th>
                  <th scope="col">Heat produced / removed</th>
                </tr>
              </thead>
              <tbody>
                {phases.map((p) => (
                  <tr key={`${p.day}-${p.phase}`}>
                    <th scope="row">
                      Day {p.day} · {p.phase}
                    </th>
                    <td>
                      {n(p.start.excessHeatJ / 1000)} kJ / {n(p.start.fluidDeficitL)} L
                    </td>
                    <td>
                      {n(p.end.excessHeatJ / 1000)} kJ / {n(p.end.fluidDeficitL)} L
                    </td>
                    <td>
                      {n(p.producedHeatJ / 1000)} / {n(p.removedHeatJ / 1000)} kJ
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </details>
        <details onToggle={(e) => setShowRemoved(e.currentTarget.open)}>
          <summary>What if you remove one modification?</summary>
          <p className="small-copy">
            Each replay keeps the other edits and identical conditions. Conditional contributions
            overlap; do not add them together.
          </p>
          {removed.length === 0 ? (
            <p>No modifications to remove.</p>
          ) : (
            removed.map((r) => {
              const matched = r.matched;
              return (
                <p key={r.parameter}>
                  <strong>Without {r.label.toLowerCase()}:</strong> {ending(r.result)}. Keeping this
                  edit changes work by{" "}
                  {signed(
                    (matched.sharedRun.deliveredWorkJ - matched.sharedReference.deliveredWorkJ) /
                      1000000,
                    "MJ",
                  )}{" "}
                  and sweat by{" "}
                  {signed(matched.sharedRun.sweatL - matched.sharedReference.sweatL, "L")} over
                  their shared {elapsedLabel(matched.sharedSeconds)}.
                </p>
              );
            })
          )}
        </details>
        <details>
          <summary>Equations, assumptions and evidence</summary>
          <p>
            Heat produced = rest + delivered work × (1 / efficiency − 1). Delivered work respects
            oxygen, pressure and mechanical ceilings. Cooling can temporarily fall short; the energy
            difference accumulates.
          </p>
          <p>
            Stored heat change = (heat produced − actual dry loss − actual evaporative loss) ×
            seconds. Fluid deficit change = sweat lost − replacement used. Extra offered fluid is
            not stored.
          </p>
          <p>
            Assumed dry capacity = (160 / 13) × (35 − air temperature) W. Assumed evaporated
            fraction = clamp((100 − humidity%) / 60, 0.1, 1). Assumed evaporative ceiling = (cooling
            capacity − 160) × evaporated fraction × fluid factor. Fluid factor declines linearly
            from 1 at 1% deficit to 0 at 4%. These curves are uncalibrated game assumptions.
          </p>
          <p>
            Cooling target = current heat production + stored heat / 1800 seconds; actual removal is
            bounded by available capacity. Rest uses the same equations, allowing recovery. No
            scripted reset or damage meter.
          </p>
          <p>
            Heat capacity: {TIMELINE_ASSUMPTIONS.heatCapacityJPerKgC} J/kg/°C, held constant for the
            configured body. Sweat conversion: {TIMELINE_ASSUMPTIONS.latentHeatJPerL / 1000000} MJ/L
            evaporated. Water density is approximated as 1 kg/L. Skin temperature is assumed
            constant; clothing, wind, sunlight, renal losses, electrolyte balance and drinking
            absorption delay are absent.
          </p>
          <p>
            The 2°C whole-body heat-equivalent and 4% sweat-fluid limits bound this illustration;
            they do not diagnose injury or establish safety. Model {recordedSettings.modelVersion},
            scenario {recordedSettings.scenarioVersion}, 60-second steps. Shorter-step convergence
            is tested, which checks numerics rather than biological accuracy.
          </p>
          <ul>
            {TIMELINE_SOURCES.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title} ↗
                </a>{" "}
                — {s.scope}
              </li>
            ))}
          </ul>
        </details>
        <div className="timeline-actions">
          <button
            type="button"
            className="button secondary"
            disabled={stale}
            onClick={() => {
              const text = exportTimelineReplay(configuration, recordedSettings, reference);
              const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
              const link = document.createElement("a");
              link.href = url;
              link.download = "human-v2-timeline.json";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Export timeline replay
          </button>
          <button type="button" className="button secondary" onClick={() => file.current?.click()}>
            Import timeline replay
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            aria-label="Timeline replay file"
            hidden
            onChange={async (e) => {
              const selectedFile = e.target.files?.[0];
              e.target.value = "";
              if (!selectedFile) return;
              try {
                if (selectedFile.size > 5000000)
                  throw new Error("Timeline replay is too large (maximum 5 MB).");
                props.onImport(importTimelineReplay(await selectedFile.text()));
                setProblem("");
              } catch (error) {
                setProblem(
                  error instanceof Error ? error.message : "Replay could not be imported.",
                );
              }
            }}
          />
        </div>
        {problem && <p role="alert">{problem}</p>}
        <p className="small-copy">
          Save experiment above to keep the body and recorded daily conditions together. Challenge
          rankings continue to use the pinned steady-state test; this timeline is a separate
          experiment.
        </p>
      </div>
    </details>
  );
}
