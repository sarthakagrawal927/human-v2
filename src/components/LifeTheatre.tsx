import { useEffect, useMemo, useRef, useState } from "react";
import { playbackPhase, playbackState } from "../model/playback";
import {
  applyPreset,
  BASE_CONFIGURATION,
  type Configuration,
  PARAMETERS,
  PRESETS,
  type SystemId,
  simulate,
} from "../model/simulator";
import {
  compareTimelines,
  type DailyPhase,
  dailyPhases,
  editableRoutine,
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
  type TimelineResult,
  type TimelineSettings,
} from "../model/timeline";
import { LivingPerson } from "./LivingPerson";

interface Props {
  configuration: Configuration;
  recordedConfiguration: Configuration;
  reference: Configuration;
  referenceName: string;
  settings: TimelineSettings;
  recordedSettings: TimelineSettings;
  stale: boolean;
  running: boolean;
  selected: SystemId;
  onChange: (c: Configuration) => void;
  onSelect: (id: SystemId) => void;
  onSettings: (s: TimelineSettings) => void;
  onRun: () => void;
  onNotes: () => void;
  onSaveReveal: () => void;
  onImport: (replay: ReturnType<typeof importTimelineReplay>) => void;
}
function BoundedNumber({
  value,
  min,
  max,
  step = 1,
  label,
  id,
  disabled = false,
  onValue,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  label?: string;
  id?: string;
  disabled?: boolean;
  onValue: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      id={id}
      aria-label={label}
      type="number"
      min={min}
      max={max}
      step={step}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value.trim() && e.target.validity.valid) onValue(Number(e.target.value));
      }}
      onBlur={() => setText(String(value))}
    />
  );
}
const formatClock = (time: number) => {
  const min = Math.floor(time / 60);
  return `Day ${Math.floor(min / 1440) + 1} · ${String(Math.floor((min % 1440) / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
};
const delta = (v: number, unit: string) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)} ${unit}`;
function chartPath(run: TimelineResult, from: number, to: number, metric: "heat" | "fluid") {
  const first = Math.max(0, run.points.findIndex((p) => p.elapsedSeconds >= from) - 1);
  const after = run.points.findIndex((p) => p.elapsedSeconds > to);
  const points = run.points.slice(first, after < 0 ? undefined : after + 1);
  return points
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${(((p.elapsedSeconds - from) / (to - from)) * 1000).toFixed(2)},${(110 - (metric === "heat" ? p.heatEquivalentC / 2 : p.fluidDeficitPercent / 4) * 100).toFixed(2)}`,
    )
    .join(" ");
}
export function LifeTheatre(props: Props) {
  const { configuration, recordedConfiguration, reference, settings, recordedSettings, stale } =
    props;
  const [seconds, setSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(3600);
  const [systems, setSystems] = useState(true);
  const [phaseIndex, setPhaseIndex] = useState(1);
  const [metric, setMetric] = useState<"heat" | "fluid">("heat");
  const [overview, setOverview] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [problem, setProblem] = useState("");
  const [exampleUndo, setExampleUndo] = useState<{
    configuration: Configuration;
    settings: TimelineSettings;
  } | null>(null);
  const autoPlay = useRef(false);
  const [undoRoutine, setUndoRoutine] = useState<
    { settings: TimelineSettings; phaseIndex: number }[]
  >([]);
  const file = useRef<HTMLInputElement>(null);
  const { run, baseline, comparison } = useMemo(() => {
    const run = simulateTimeline(recordedConfiguration, recordedSettings);
    const baseline = simulateTimeline(reference, recordedSettings);
    return { run, baseline, comparison: compareTimelines(run, baseline) };
  }, [recordedConfiguration, reference, recordedSettings]);
  const removed = useMemo(
    () =>
      showRemoved
        ? removeOneReplays(recordedConfiguration, recordedSettings).map((r) => ({
            ...r,
            matched: compareTimelines(run, r.result),
          }))
        : [],
    [showRemoved, recordedConfiguration, recordedSettings, run],
  );
  useEffect(() => {
    setSeconds(
      Math.min(
        run.elapsedSeconds,
        run.phases.find((p) => p.phase === "activity")?.startSeconds ?? 0,
      ),
    );
    setPlaying(autoPlay.current);
    autoPlay.current = false;
  }, [run]);
  useEffect(() => {
    if (stale) setPlaying(false);
  }, [stale]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);
  useEffect(() => {
    if (!playing || stale) return;
    let frame = 0;
    let last = performance.now();
    let rendered = last;
    const tick = (now: number) => {
      if (now - rendered >= 50) {
        const dt = Math.min((now - last) / 1000, 0.25) * speed;
        last = now;
        rendered = now;
        setSeconds((t) => Math.min(run.elapsedSeconds, t + dt));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, run.elapsedSeconds, stale]);
  const watchedRun = useRef(run);
  useEffect(() => {
    if (watchedRun.current !== run) {
      watchedRun.current = run;
      return;
    }
    if (seconds >= run.elapsedSeconds) setPlaying(false);
  }, [seconds, run]);
  const state = playbackState(run, seconds) ?? playbackState(run, 0);
  const baseState = playbackState(baseline, seconds);
  const phase = playbackPhase(recordedSettings, seconds);
  const phases = dailyPhases(settings);
  const selectedPhase = phases[Math.min(phaseIndex, phases.length - 1)];
  const draft = simulate(configuration);
  const active = state ? state.deliveredWorkW > 0 : false;
  const localHour = (seconds / 3600) % 24;
  const night = localHour < 6 || localHour >= 19;
  const chartFrom = overview ? 0 : Math.floor(Math.max(0, seconds - 0.0001) / 86400) * 86400;
  const chartTo = overview
    ? run.requestedSeconds
    : Math.min(run.requestedSeconds, chartFrom + 86400);
  const chartPaths = useMemo(
    () => ({
      run: chartPath(run, chartFrom, chartTo, metric),
      baseline: chartPath(baseline, chartFrom, chartTo, metric),
    }),
    [run, baseline, chartFrom, chartTo, metric],
  );
  const atBoundary = !!run.boundary && seconds >= run.elapsedSeconds;
  function setPhase(patch: Partial<DailyPhase>) {
    const index = Math.min(phaseIndex, phases.length - 1);
    const next = phases.map((p) => ({ ...p }));
    if (patch.hours !== undefined) {
      const neighbour = index === next.length - 1 ? index - 1 : index + 1;
      const hours =
        Math.round(
          Math.max(0.25, Math.min(next[index].hours + next[neighbour].hours - 0.25, patch.hours)) *
            4,
        ) / 4;
      next[neighbour].hours += next[index].hours - hours;
      patch = { ...patch, hours };
    }
    next[index] = { ...next[index], ...patch };
    if (next[index].kind !== "activity") next[index].requestedWorkW = 0;
    setUndoRoutine((previous) => [...previous.slice(-49), { settings, phaseIndex }]);
    props.onSettings(editableRoutine(settings, next));
  }
  function addPhase() {
    const index = Math.min(phaseIndex, phases.length - 1);
    const next = phases.map((p) => ({ ...p }));
    const hours = Math.min(2, Math.floor(next[index].hours * 2) / 4);
    next[index].hours -= hours;
    next.splice(index + 1, 0, {
      id: `phase-${Array.from({ length: 9 }, (_, i) => i + 1).find((n) => !phases.some((p) => p.id === `phase-${n}`))}`,
      kind: "recovery",
      hours,
      temperatureC: 22,
      humidityPercent: 40,
      requestedWorkW: 0,
      drinkLPerHour: 0.25,
    });
    setUndoRoutine((previous) => [...previous.slice(-49), { settings, phaseIndex }]);
    props.onSettings(editableRoutine(settings, next));
    setPhaseIndex(index + 1);
  }
  function removePhase() {
    const index = Math.min(phaseIndex, phases.length - 1);
    const next = phases.map((p) => ({ ...p }));
    const neighbour = index > 0 ? index - 1 : 1;
    next[neighbour].hours += next[index].hours;
    next.splice(index, 1);
    setUndoRoutine((previous) => [...previous.slice(-49), { settings, phaseIndex }]);
    props.onSettings(editableRoutine(settings, next));
    setPhaseIndex(Math.max(0, index - 1));
  }
  function runNow() {
    setPlaying(false);
    autoPlay.current = true;
    props.onRun();
  }
  function downloadReplay() {
    const content = exportTimelineReplay(recordedConfiguration, recordedSettings, reference);
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "human-v2-life-replay.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="life-theatre" aria-label="Life Theatre simulation">
      <div className="experiment-guide">
        <ol>
          <li>
            <button
              type="button"
              onClick={() => {
                document
                  .getElementById("trait-heading")
                  ?.scrollIntoView({ block: "start", behavior: "instant" });
                document.getElementById("range-pumping")?.focus({ preventScroll: true });
              }}
            >
              <b>01</b> Set inputs
            </button>
          </li>
          <li>
            <span>
              <b>02</b> Run the simulation
            </span>
          </li>
          <li>
            <span>
              <b>03</b> Compare results
            </span>
          </li>
        </ol>
        <details className="guided-example">
          <summary>Try a coupled experiment</summary>
          <p>
            Cooling +20% · 30°C / 50% humidity · 180 W activity · 7 repeated days. Compare heat
            relief with actual sweat loss.
          </p>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setExampleUndo({ configuration: { ...configuration }, settings });
              props.onChange({ ...BASE_CONFIGURATION, cooling: 20 });
              props.onSettings(editableRoutine(scenarioSettings("hot-shift", 7, 180)));
              setPhaseIndex(1);
            }}
          >
            Load cooling in a hot world
          </button>
          {exampleUndo && <p role="status">Example loaded. Undo restores your previous inputs.</p>}
          {exampleUndo && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                props.onChange(exampleUndo.configuration);
                props.onSettings(exampleUndo.settings);
                setExampleUndo(null);
              }}
            >
              Undo example
            </button>
          )}
        </details>
      </div>
      <div className="theatre-toolbar">
        <div>
          <span className="section-kicker">SIMULATION</span>
          <p>Heat, fluid and workload over time.</p>
        </div>
        <div className="theatre-primary-actions">
          <button
            type="button"
            className="text-button save-reveal"
            disabled={stale}
            onClick={props.onSaveReveal}
          >
            Name & save
          </button>
          <button
            type="button"
            className="button run-simulation"
            disabled={props.running}
            onClick={runNow}
          >
            {props.running ? "Simulating…" : stale ? "Simulate changes" : "Run simulation"}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
      <div
        id="life-stage"
        className={`theatre-scene ${night ? "night" : "daylight"} ${phase.temperatureC >= 28 ? "hot-world" : ""} ${playing && !stale ? "is-playing" : ""}`}
        style={
          {
            "--cooling-activity": String(Math.min(1, (state?.evaporativeLossW ?? 0) / 600)),
          } as React.CSSProperties
        }
      >
        <div className="scene-world">
          <div className="world-orb" />
          <div className="world-cloud cloud-one" />
          <div className="world-cloud cloud-two" />
          <svg
            className="world-hills"
            viewBox="0 0 1000 300"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M0 145Q130 78 350 143T1000 80V300H0Z" fill="var(--hill-far)" />
            <path d="M0 210Q300 86 620 205T1000 180V300H0Z" fill="var(--hill-near)" />
            <path d="M0 255Q430 196 1000 265V300H0Z" fill="var(--hill-ground)" />
          </svg>
          <div className="scene-clock">
            <span className="scene-label">VIEWING REPLAY</span>
            <strong data-testid="playback-clock">
              {seconds >= run.requestedSeconds
                ? `End of day ${recordedSettings.days}`
                : formatClock(seconds)}
            </strong>
            <span className="scene-phase">
              {phase.kind === "activity"
                ? "Working"
                : phase.kind === "recovery"
                  ? "Recovering"
                  : "Resting"}{" "}
              · {phase.requestedWorkW} W requested
            </span>
          </div>
          <fieldset className="body-view-switch" aria-label="Person view">
            <button type="button" aria-pressed={!systems} onClick={() => setSystems(false)}>
              Person
            </button>
            <button type="button" aria-pressed={systems} onClick={() => setSystems(true)}>
              Systems
            </button>
          </fieldset>
          <LivingPerson
            active={active}
            systems={systems}
            selected={props.selected}
            heat={state?.heatEquivalentC ?? 0}
            onSelect={(id) => {
              props.onSelect(id);
              if (window.matchMedia("(max-width: 600px)").matches) {
                const parameter = PARAMETERS.find((p) => p.system === id);
                document
                  .getElementById(`range-${parameter?.id}`)
                  ?.scrollIntoView({ block: "center", behavior: "instant" });
              }
            }}
          />
          <div className="world-conditions">
            <strong>
              {phase.temperatureC}
              <span>°C</span>
            </strong>
            <div>
              {phase.humidityPercent}% humidity
              <br />
              {phase.drinkLPerHour.toFixed(2)} L/h offered replacement
            </div>
          </div>
          <p className="scene-fidelity">Abstract activity animation · not measured organ rates</p>
          {stale && (
            <div className="scene-stale" data-testid="timeline-stale">
              <span>Draft changed</span>Playback shows your previous run. Simulate changes to update
              it.
            </div>
          )}
          {atBoundary && (
            <div className="scene-boundary">
              <span>Model boundary reached</span>
              {run.boundary?.kind === "heat" ? "Stored heat" : "Fluid deficit"} reached its assumed
              limit. Later state is unknown.
            </div>
          )}
        </div>
        <aside className="scene-telemetry" aria-label="Recorded simulation state">
          <div className="telemetry-heading">
            <span className="section-kicker">AT THIS MOMENT</span>
            <span className="recorded-badge">{stale ? "Previous run" : "Recorded replay"}</span>
          </div>
          <div className="state-stat work-stat">
            <span>
              Useful work <small className="stat-definition">Output delivered to the task</small>
            </span>
            <strong data-testid="live-work">
              {(state?.deliveredWorkW ?? 0).toFixed(0)}
              <small> W</small>
            </strong>
            <div className="state-meter">
              <i style={{ width: `${((state?.deliveredWorkW ?? 0) / 300) * 100}%` }} />
            </div>
            <p>
              {baseState
                ? `${props.referenceName}: ${baseState.deliveredWorkW.toFixed(0)} W`
                : `${props.referenceName}: later state unknown`}
            </p>
          </div>
          <div className="state-stat heat-stat">
            <span>
              Stored heat <small className="stat-definition">Production minus heat removed</small>
            </span>
            <strong data-testid="live-heat">
              +{(state?.heatEquivalentC ?? 0).toFixed(2)}
              <small> °C equiv.</small>
            </strong>
            <div className="state-meter">
              <i
                style={{ width: `${Math.min(100, ((state?.heatEquivalentC ?? 0) / 2) * 100)}%` }}
              />
            </div>
            <p>
              Whole-body equivalent, not core temperature.
              <br />
              Model boundary: +2°C equivalent.
            </p>
          </div>
          <div className="state-stat fluid-stat">
            <span>
              Unreplaced sweat fluid{" "}
              <small className="stat-definition">Sweat lost minus fluid replaced</small>
            </span>
            <strong data-testid="live-fluid">
              {(state?.fluidDeficitL ?? 0).toFixed(2)}
              <small> L</small>
            </strong>
            <div className="state-meter">
              <i
                style={{
                  width: `${Math.min(100, ((state?.fluidDeficitPercent ?? 0) / 4) * 100)}%`,
                }}
              />
            </div>
            <p>
              {baseState
                ? `${props.referenceName}: ${baseState.fluidDeficitL.toFixed(2)} L`
                : `${props.referenceName}: later state unknown`}
              <br />
              Model boundary: 4% of initial mass.
            </p>
          </div>
          <div className="live-limiter">
            <span className="section-kicker">RECORDED LIMIT</span>
            <strong>{state?.limiting}</strong>
            <p>
              {state?.limiting === "Heat removal"
                ? "Heat production exceeds modeled heat loss in this rate interval."
                : state?.limiting === "Task demand"
                  ? "The requested task sets work. Extra capacity is reserve."
                  : "The requested task exceeds a modeled work ceiling."}
            </p>
          </div>
        </aside>
      </div>
      <div className="replay-console">
        <div className="replay-transport">
          <button
            type="button"
            className="play-button"
            disabled={stale}
            onClick={() => {
              if (seconds >= run.elapsedSeconds) setSeconds(0);
              setPlaying(!playing);
            }}
          >
            {playing ? "Ⅱ Pause" : "▶ Play"}
          </button>
          <button
            type="button"
            className="text-button restart-replay"
            disabled={stale}
            onClick={() => {
              setPlaying(false);
              setSeconds(0);
            }}
          >
            Restart
          </button>
          <label htmlFor="replay-speed">Speed</label>
          <select
            id="replay-speed"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            <option value={900}>15 min / sec</option>
            <option value={3600}>1 hour / sec</option>
            <option value={14400}>4 hours / sec</option>
            <option value={86400}>1 day / sec</option>
          </select>
          <span className="replay-ending" data-testid="timeline-ending">
            {run.boundary
              ? `${run.boundary.kind === "heat" ? "Heat" : "Fluid"} model boundary at ${elapsedLabel(run.elapsedSeconds)}`
              : `Computed ${recordedSettings.days} repeated days`}
          </span>
        </div>
        <label className="replay-scrubber" htmlFor="replay-time">
          <span>
            Replay time{" "}
            <b>
              {elapsedLabel(seconds)} / {elapsedLabel(run.elapsedSeconds)}
            </b>
          </span>
          <input
            id="replay-time"
            type="range"
            min={0}
            max={run.elapsedSeconds}
            step="any"
            value={seconds}
            disabled={stale}
            onChange={(e) => {
              setPlaying(false);
              const value = Number(e.target.value);
              // Native range serialization can round a fractional max by a few ulps.
              setSeconds(
                run.elapsedSeconds - value < 1e-6
                  ? run.elapsedSeconds
                  : Math.min(run.elapsedSeconds, value),
              );
            }}
          />
        </label>
        <fieldset className="recorded-phase-track" aria-label="Recorded daily routine">
          {dailyPhases(recordedSettings).map((p, i) => (
            <button
              type="button"
              key={p.id}
              disabled={stale}
              className={i === phase.index ? "current" : ""}
              style={{ flex: p.hours }}
              onClick={() => {
                const start =
                  dailyPhases(recordedSettings)
                    .slice(0, i)
                    .reduce((s, p) => s + p.hours * 3600, 0) +
                  Math.floor(Math.min(seconds, run.elapsedSeconds - 0.001) / 86400) * 86400;
                setPlaying(false);
                setSeconds(Math.min(run.elapsedSeconds, start));
              }}
            >
              <span>{p.kind}</span>
              <small>{p.hours}h</small>
            </button>
          ))}
        </fieldset>
      </div>
      <div className="theatre-config">
        <section className="trait-console" aria-labelledby="trait-heading">
          <div className="section-heading">
            <div>
              <span className="section-kicker">01 / BODY</span>
              <h2 id="trait-heading">Body traits</h2>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() => props.onChange({ ...BASE_CONFIGURATION })}
            >
              Reset all traits
            </button>
          </div>
          <p className="console-help">Each trait changes assumed mass and resting energy.</p>
          <div className="joint-traits">
            {PARAMETERS.map((p) => (
              <div
                className={`joint-trait ${props.selected === p.system ? "focused-system" : ""}`}
                key={p.id}
              >
                <div className="range-heading">
                  <label htmlFor={`range-${p.id}`}>{p.label}</label>
                  <output htmlFor={`range-${p.id}`}>
                    {configuration[p.id] > 0 ? "+" : ""}
                    {configuration[p.id]}%
                  </output>
                </div>
                <input
                  id={`range-${p.id}`}
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={5}
                  value={configuration[p.id]}
                  onFocus={() => props.onSelect(p.system)}
                  onChange={(e) =>
                    props.onChange({ ...configuration, [p.id]: Number(e.target.value) })
                  }
                />
                <div className="range-scale">
                  <span>{p.min}%</span>
                  <span>baseline 0%</span>
                  <span>+{p.max}%</span>
                </div>
                <p className="trait-cost">
                  {delta((configuration[p.id] / 100) * p.massCost, "kg")} ·{" "}
                  {delta((configuration[p.id] / 100) * p.restCost, "W rest")}
                </p>
              </div>
            ))}
          </div>
          <div className="body-budget">
            <span>
              Body mass <strong>{draft.massKg.toFixed(2)} kg</strong>
            </span>
            <span>
              Resting energy <strong>{draft.restingW.toFixed(1)} W</strong>
            </span>
            <span>
              Changes <strong>{draft.modifications} / 6</strong>
            </span>
          </div>
          <details className="trait-presets">
            <summary>Start from an animal-inspired abstraction</summary>
            <div>
              {PRESETS.map((p) => (
                <button
                  type="button"
                  className="preset-button"
                  key={p.id}
                  onClick={() => props.onChange(applyPreset(configuration, p.id))}
                >
                  <strong>{p.name}</strong>
                  <small>
                    {Object.entries(p.changes)
                      .map(([k, v]) => `${k} +${v}%`)
                      .join(", ")}
                  </small>
                </button>
              ))}
            </div>
            <p>Explicit parameter edits, not predictions of transplant compatibility.</p>
          </details>
          <p className="trait-coverage" data-testid="lung-coverage">
            Lung exchange is a capacity ceiling, not lung size or breathing rate. CO₂, tissue injury
            and chronic effects are unsupported. Costs are uncalibrated assumptions.{" "}
            <button type="button" className="text-button" onClick={props.onNotes}>
              Lung mechanisms & evidence ↗
            </button>
          </p>
        </section>
        <section className="routine-console" aria-labelledby="routine-heading">
          <div className="section-heading">
            <div>
              <span className="section-kicker">02 / WORLD & ROUTINE</span>
              <h2 id="routine-heading">Build their day.</h2>
            </div>
            <span className="routine-total">24 hours</span>
          </div>
          <div className="routine-top">
            <label htmlFor="timeline-scenario">
              Starting routine
              <select
                id="timeline-scenario"
                aria-label="Starting routine"
                value={settings.scenarioId}
                onChange={(e) => {
                  setUndoRoutine((previous) => [...previous.slice(-49), { settings, phaseIndex }]);
                  props.onSettings(
                    editableRoutine(
                      scenarioSettings(
                        e.target.value as TimelineSettings["scenarioId"],
                        settings.days,
                        settings.requestedWorkW,
                      ),
                    ),
                  );
                  setPhaseIndex(1);
                }}
              >
                {SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="timeline-days">
              Repeat for
              <select
                id="timeline-days"
                aria-label="Repeat for"
                value={settings.days}
                onChange={(e) => {
                  setUndoRoutine((previous) => [...previous.slice(-49), { settings, phaseIndex }]);
                  props.onSettings({ ...settings, days: Number(e.target.value) });
                }}
              >
                {[...new Set([1, 7, 30, 90, settings.days])]
                  .sort((a, b) => a - b)
                  .map((d) => (
                    <option key={d} value={d}>
                      {d} days
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <fieldset className="phase-composer" aria-label="Edit daily phases">
            {phases.map((p, i) => (
              <button
                type="button"
                key={p.id}
                aria-pressed={phaseIndex === i}
                onClick={() => setPhaseIndex(i)}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                <b>{p.kind}</b>
                <small>
                  {p.hours}h · {p.temperatureC}°C
                </small>
              </button>
            ))}
          </fieldset>
          <fieldset className="phase-fields" key={selectedPhase.id}>
            <legend>Phase {Math.min(phaseIndex, phases.length - 1) + 1} settings</legend>
            <label>
              Activity
              <select
                aria-label="Phase activity"
                value={selectedPhase.kind}
                onChange={(e) => setPhase({ kind: e.target.value as DailyPhase["kind"] })}
              >
                <option value="rest">Rest</option>
                <option value="activity">Activity</option>
                <option value="recovery">Recovery</option>
              </select>
            </label>
            <label htmlFor="phase-duration">
              Duration (hours)
              <BoundedNumber
                id="phase-duration"
                label="Phase duration (hours)"
                min={0.25}
                max={23.75}
                step={0.25}
                value={selectedPhase.hours}
                onValue={(v) => setPhase({ hours: v })}
              />
            </label>
            <label htmlFor="phase-temperature">
              Temperature (°C)
              <BoundedNumber
                id="phase-temperature"
                label="Phase temperature (°C)"
                min={10}
                max={40}
                value={selectedPhase.temperatureC}
                onValue={(v) => setPhase({ temperatureC: v })}
              />
            </label>
            <label htmlFor="phase-humidity">
              Humidity (%)
              <BoundedNumber
                id="phase-humidity"
                label="Phase humidity (%)"
                min={10}
                max={90}
                value={selectedPhase.humidityPercent}
                onValue={(v) => setPhase({ humidityPercent: v })}
              />
            </label>
            <label htmlFor="timeline-work">
              Workload (W)
              <BoundedNumber
                id="timeline-work"
                min={0}
                max={300}
                disabled={selectedPhase.kind !== "activity"}
                value={selectedPhase.requestedWorkW}
                onValue={(v) => setPhase({ requestedWorkW: v })}
              />
            </label>
            <label htmlFor="phase-replacement">
              Replacement (L/h)
              <BoundedNumber
                id="phase-replacement"
                label="Phase replacement (L/h)"
                min={0}
                max={1.5}
                step={0.01}
                value={selectedPhase.drinkLPerHour}
                onValue={(v) => setPhase({ drinkLPerHour: v })}
              />
            </label>
          </fieldset>
          <div className="phase-actions">
            <button
              type="button"
              className="text-button"
              disabled={phases.length >= 8 || selectedPhase.hours < 0.5}
              onClick={addPhase}
            >
              + Add phase
            </button>
            <button
              type="button"
              className="text-button"
              disabled={phases.length <= 2}
              onClick={removePhase}
            >
              Remove selected phase
            </button>
          </div>
          {undoRoutine.length > 0 && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const previous = undoRoutine[undoRoutine.length - 1];
                props.onSettings(previous.settings);
                setUndoRoutine((history) => history.slice(0, -1));
                setPhaseIndex(
                  Math.min(previous.phaseIndex, dailyPhases(previous.settings).length - 1),
                );
              }}
            >
              Undo routine edit
            </button>
          )}
          <p className="console-help">
            Changing duration transfers time to the adjacent phase. Adding a phase takes up to two
            hours from the selected phase. Heat and unreplaced sweat fluid carry across phases and
            days. Input bounds are model assumptions, not safe exposure limits.
          </p>
          <button
            type="button"
            className="button routine-run"
            disabled={props.running}
            onClick={runNow}
          >
            Simulate this person & routine <span aria-hidden="true">→</span>
          </button>
        </section>
      </div>
      <section className="trajectory-panel" aria-labelledby="trajectory-heading">
        <div className="section-heading">
          <div>
            <span className="section-kicker">03 / CONSEQUENCES</span>
            <h2 id="trajectory-heading">See where the paths diverge.</h2>
          </div>
          <div className="chart-controls">
            <fieldset className="metric-tabs" aria-label="Chart quantity">
              <button
                type="button"
                aria-pressed={metric === "heat"}
                onClick={() => setMetric("heat")}
              >
                Heat
              </button>
              <button
                type="button"
                aria-pressed={metric === "fluid"}
                onClick={() => setMetric("fluid")}
              >
                Fluid
              </button>
            </fieldset>
            <label htmlFor="chart-window" className="sr-only">
              Chart time window
            </label>
            <select
              id="chart-window"
              value={overview ? "full" : "day"}
              onChange={(e) => setOverview(e.target.value === "full")}
            >
              <option value="day">Replay day</option>
              <option value="full">Full run</option>
            </select>
          </div>
        </div>
        <div className="chart-legend">
          <span>
            <i />
            Modified body
          </span>
          <span>
            <i className="reference-line" />
            {props.referenceName}
          </span>
          <span className="chart-unit">
            {metric === "heat"
              ? "Stored heat · °C whole-body equivalent"
              : "Unreplaced sweat fluid · % of initial mass"}
          </span>
        </div>
        <div className="trajectory-chart">
          <span className="chart-boundary-label">
            {metric === "heat" ? "+2°C equiv." : "4%"} model boundary
          </span>
          <svg
            viewBox="0 0 1000 120"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${metric} trajectory compared under identical recorded conditions; reference stops at its model boundary`}
          >
            <path className="chart-reference" d={chartPaths.baseline} />
            <path className="chart-person" d={chartPaths.run} />
            <line
              className="chart-cursor"
              x1={((seconds - chartFrom) / (chartTo - chartFrom)) * 1000}
              x2={((seconds - chartFrom) / (chartTo - chartFrom)) * 1000}
              y1="0"
              y2="120"
            />
          </svg>
          <span className="chart-zero">0</span>
        </div>
        <div className="trajectory-axis">
          <span>{elapsedLabel(chartFrom)}</span>
          <span>{elapsedLabel(chartTo)}</span>
        </div>
        <p className="sample-note">
          State between recorded samples is interpolated for display. Rate values use the recorded
          interval {elapsedLabel(state?.ratesWindowStartSeconds ?? 0)}–
          {elapsedLabel(state?.ratesWindowEndSeconds ?? 0)}. Curves stop at model boundaries; no
          state is extrapolated.
        </p>
        <div className="learner-takeaway">
          <span className="section-kicker">WHAT CHANGED</span>
          <p>
            Compared with {props.referenceName.toLowerCase()} over the same{" "}
            {elapsedLabel(comparison.sharedSeconds)},{" "}
            {Math.abs(
              comparison.sharedRun.final.excessHeatJ - comparison.sharedReference.final.excessHeatJ,
            ) > 1
              ? `this body stores ${comparison.sharedRun.final.excessHeatJ < comparison.sharedReference.final.excessHeatJ ? "less" : "more"} heat`
              : "stored heat is the same"}
            {Math.abs(comparison.sharedRun.sweatL - comparison.sharedReference.sweatL) > 0.001
              ? ` and loses ${comparison.sharedRun.sweatL < comparison.sharedReference.sweatL ? "less" : "more"} sweat water`
              : " and sweat water loss is the same"}
            .
          </p>
          <small>
            {run.boundary
              ? "This run reaches an assumed model boundary. Later state stays unknown."
              : baseline.boundary
                ? "The reference reaches its model boundary sooner. Its later state stays unknown."
                : "Capacity can remain unused when the task does not demand it. Compare the recorded energy balance below."}
          </small>
        </div>
        <div className="consequence-cards">
          <div>
            <span className="section-kicker">ON THE SAME ELAPSED INTERVAL</span>
            <h3 data-testid="timeline-comparison">
              {elapsedLabel(comparison.sharedSeconds)} shared
            </h3>
            <p>
              Stored heat:{" "}
              <b>
                {delta(
                  comparison.sharedRun.final.excessHeatJ / 1000 -
                    comparison.sharedReference.final.excessHeatJ / 1000,
                  "kJ",
                )}
              </b>
              <br />
              Sweat loss:{" "}
              <b>{delta(comparison.sharedRun.sweatL - comparison.sharedReference.sweatL, "L")}</b>
            </p>
          </div>
          <div>
            <span className="section-kicker">WHY IT HAPPENED</span>
            <ul>
              {explainTimeline(run)
                .slice(0, 2)
                .map((t) => (
                  <li key={t}>{t}</li>
                ))}
            </ul>
          </div>
        </div>
        <details className="temporal-details">
          <summary>Calculation, recovery & model limits</summary>
          <ul>
            {explainTimeline(run)
              .slice(2)
              .map((t) => (
                <li key={t}>{t}</li>
              ))}
          </ul>
          <p data-testid="timeline-coverage">
            No aging, chronic damage, adaptation or lifespan prediction. Elapsed simulation time has
            no validated biological predictive horizon. Whole-body heat equivalent is not core
            temperature; these boundaries are not injury or survival decisions.
          </p>
          <p>
            Heat production = resting energy + work / efficiency − work. Stored heat integrates
            production − dry loss − evaporative loss. Sweat loss is evaporative energy divided by
            latent heat and assumed evaporation efficiency; replacement is capped at the actual
            deficit. Unreplaced fluid lowers an assumed evaporative ceiling.
          </p>
          <p>
            At the displayed recorded rate interval: production{" "}
            {(state?.producedHeatW ?? 0).toFixed(2)} W − dry {(state?.dryLossW ?? 0).toFixed(2)} W −
            evaporation {(state?.evaporativeLossW ?? 0).toFixed(2)} W ={" "}
            {(
              (state?.producedHeatW ?? 0) -
              (state?.dryLossW ?? 0) -
              (state?.evaporativeLossW ?? 0)
            ).toFixed(2)}{" "}
            W stored. These rates are not the interpolated state.
          </p>
          <details className="temporal-assumptions">
            <summary>Chosen coefficients & physical provenance</summary>
            <dl>
              {Object.entries(TIMELINE_ASSUMPTIONS).map(([name, value]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <ul>
              {TIMELINE_SOURCES.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title} ↗
                  </a>{" "}
                  — {source.scope}
                </li>
              ))}
            </ul>
            <p>
              Mechanistic sources do not calibrate these coefficients or validate this simulated
              person.
            </p>
          </details>
          <section
            className="ledger-scroll"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: The named ledger must support keyboard scrolling.
            tabIndex={0}
            aria-label="Phase energy and fluid ledger"
          >
            <table>
              <caption>First day and final day phase balances; energy in kJ, water in L</caption>
              <thead>
                <tr>
                  <th>Day / phase</th>
                  <th>Heat made</th>
                  <th>Heat removed</th>
                  <th>End stored</th>
                  <th>Sweat lost</th>
                  <th>Replaced</th>
                  <th>End deficit</th>
                </tr>
              </thead>
              <tbody>
                {run.phases
                  .filter((p) => p.day === 1 || p.day === run.phases.at(-1)?.day)
                  .map((p) => (
                    <tr key={p.startSeconds}>
                      <th scope="row">
                        {p.day} / {p.phase}
                      </th>
                      <td>{(p.producedHeatJ / 1000).toFixed(1)}</td>
                      <td>{(p.removedHeatJ / 1000).toFixed(1)}</td>
                      <td>{(p.end.excessHeatJ / 1000).toFixed(1)}</td>
                      <td>{p.sweatL.toFixed(2)}</td>
                      <td>{p.replacedL.toFixed(2)}</td>
                      <td>{p.end.fluidDeficitL.toFixed(2)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
          <button
            type="button"
            className="text-button"
            onClick={() => setShowRemoved(!showRemoved)}
          >
            {showRemoved ? "Hide" : "Calculate"} remove-one-edit replays
          </button>
          {showRemoved && removed.length === 0 && <p>No changed traits to remove.</p>}
          {showRemoved && (
            <ul>
              {removed.map((r) => (
                <li key={r.parameter}>
                  {r.parameter} removed: {elapsedLabel(r.result.elapsedSeconds)} recorded; at{" "}
                  {elapsedLabel(r.matched.sharedSeconds)} shared, stored heat difference{" "}
                  {delta(
                    (r.matched.sharedRun.final.excessHeatJ -
                      r.matched.sharedReference.final.excessHeatJ) /
                      1000,
                    "kJ",
                  )}{" "}
                  on the matched interval.
                </li>
              ))}
            </ul>
          )}
        </details>
        <div className="replay-files">
          <span>Keep the whole experiment reproducible.</span>
          <button
            type="button"
            className="button secondary"
            disabled={stale}
            onClick={downloadReplay}
          >
            Export timeline replay
          </button>
          <button type="button" className="button secondary" onClick={() => file.current?.click()}>
            Import timeline replay
          </button>
          <input
            type="file"
            ref={file}
            hidden
            accept="application/json,.json"
            aria-label="Import timeline replay JSON"
            onChange={async (e) => {
              const picked = e.target.files?.[0];
              e.target.value = "";
              if (!picked) return;
              try {
                if (picked.size > 25000000) throw new Error("Replay exceeds 25 MB.");
                const replay = importTimelineReplay(await picked.text());
                setProblem("");
                setPlaying(false);
                props.onImport(replay);
              } catch (error) {
                setProblem(
                  `This file could not be imported as a compatible timeline replay. ${error instanceof Error ? error.message : "The replay could not be read."} Your experiment is unchanged. Export a timeline replay from Human V2 and try again.`,
                );
              }
            }}
          />
        </div>
        {problem && (
          <p role="alert" className="error-banner">
            {problem}
          </p>
        )}
      </section>
    </section>
  );
}
