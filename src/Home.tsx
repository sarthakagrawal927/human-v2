import { useEffect, useRef, useState } from "react";
import { LivingPerson } from "./components/LivingPerson";
import { ANNUAL_SOURCE } from "./model/annual";
import {
  BASE_BODY,
  BODY_CONTROLS,
  comparisonTrace,
  OUTPUTS,
  outputText,
  type PhysiologyComparison,
  type PhysiologyConfiguration,
} from "./model/physiology";
import type { SystemId } from "./model/simulator";
import "./home.css";

const presets = [
  ["baseline", "Unmodified body"],
  ["exchange", "More exchange area · +20%"],
  ["capacity", "Larger lungs · +20%"],
  ["breathing", "Faster breathing drive · +100%"],
  ["combined", "Exchange + heart · exertion"],
  ["custom", "Custom experiment"],
] as const;
const systemNotes: Record<SystemId, string> = {
  lungs:
    "Air → exchange → blood oxygen. Volume, exchange area and breathing drive are separate controls.",
  heart: "The heart drives blood flow. Contraction, rate, resistance and oxygen delivery interact.",
  circulation:
    "Vessel resistance links pressure and flow. Brain inflow is compared using a dense 30-second mean.",
  muscles:
    "Exercise increases metabolic demand. This experiment changes activity, not muscle anatomy or efficiency.",
  cooling:
    "Core temperature is recorded. Cooling-system redesign and its long-term costs are not supported here.",
};
function same(a: PhysiologyConfiguration, b: PhysiologyConfiguration) {
  return JSON.stringify(a) === JSON.stringify(b);
}
export default function Home() {
  const [experiment, setExperiment] = useState("baseline");
  const [config, setConfig] = useState<PhysiologyConfiguration>({ ...BASE_BODY });
  const [selected, setSelected] = useState<SystemId>("lungs");
  const [run, setRun] = useState<PhysiologyComparison | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [metric, setMetric] = useState("OxygenSaturation");
  const result = useRef<HTMLElement>(null);
  const requestId = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const currentConfig = useRef(config);
  currentConfig.current = config;
  const stale = !!run && !same(run.configuration, config);
  const point = run && !stale ? run.modified.rows[index] : undefined;
  const changed = BODY_CONTROLS.filter((p) => config[p.id] !== 0).length;
  useEffect(() => {
    if (!playing || !run || stale) return;
    const timer = window.setInterval(
      () => setIndex((n) => Math.min(n + 1, run.modified.rows.length - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [playing, run, stale]);
  useEffect(() => {
    if (run && index >= run.modified.rows.length - 1) setPlaying(false);
  }, [index, run]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduce = () => {
      if (media.matches) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    media.addEventListener("change", reduce);
    return () => {
      document.removeEventListener("visibilitychange", pause);
      media.removeEventListener("change", reduce);
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (run) {
      result.current?.scrollIntoView({ block: "start", behavior: "instant" });
      result.current?.focus({ preventScroll: true });
    }
  }, [run]);
  function change(next: PhysiologyConfiguration) {
    requestId.current += 1;
    abort.current?.abort();
    setBusy(false);
    setPlaying(false);
    setConfig(next);
    setError("");
  }
  function choose(id: string) {
    let next = { ...BASE_BODY };
    if (id === "custom") next = { ...config };
    if (id === "exchange") next.surface = 20;
    if (id === "capacity") next.volume = 20;
    if (id === "breathing") next.breathing = 100;
    if (id === "combined") {
      next.surface = 20;
      next.stroke = 20;
      next.exercise = 0.3;
    }
    change(next);
    setExperiment(id);
    setSelected(id === "combined" ? "heart" : "lungs");
  }
  async function simulate() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const id = ++requestId.current;
    const submitted = { ...config };
    setBusy(true);
    setError("");
    setPlaying(false);
    try {
      const response = await fetch("/api/physiology", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitted),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The simulation did not complete.");
      if (id !== requestId.current || !same(currentConfig.current, submitted)) return;
      setRun(data);
      setIndex(0);
      setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      if (id === requestId.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Simulation unavailable. Try again.");
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }
  function exportRun() {
    if (!run || stale) return;
    const payload = {
      schema: "human-v2-acute-replay-1",
      run,
      explanation: comparisonTrace(run),
      scope: "Acute engine output; no annual progression or fatal prediction.",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "human-v2-physiology.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const plotted =
    run && !stale ? [...run.baseline.rows, ...run.modified.rows].map((p) => p.values[metric]) : [];
  const low = plotted.length ? Math.min(...plotted) : 0;
  const high = plotted.length ? Math.max(...plotted) : 1;
  const span = high - low || Math.max(Math.abs(high) * 0.02, 0.01);
  const chartPath = (rows: PhysiologyComparison["baseline"]["rows"]) =>
    rows
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${(p.elapsed_s / 180) * 600},${145 - ((p.values[metric] - low) / span) * 120}`,
      )
      .join(" ");
  return (
    <main className="human-home">
      <header className="home-header">
        <a href="#home">Human V2</a>
        <span>Body experiments</span>
      </header>
      <div id="home" className="home-experiment">
        <section
          className={`home-body ${playing && !stale ? "is-playing" : ""}`}
          aria-label="Human body"
        >
          <LivingPerson
            active={!!point && config.exercise > 0}
            systems
            compactCallouts
            selected={selected}
            heat={point ? Math.max(0, point.values.CoreTemperature - 37) : 0}
            onSelect={setSelected}
            measuredRates={
              point
                ? { heart: point.values.HeartRate, breathing: point.values.RespirationRate }
                : undefined
            }
          />
          <p>
            {point
              ? `${point.elapsed_s} seconds · ${outputText("HeartRate", point.values.HeartRate)} heart · ${outputText("RespirationRate", point.values.RespirationRate)} breathing`
              : "Reference adult · 44 years · male"}
          </p>
          <small>
            {point
              ? "Illustrated pulses use recorded rates. Timeline plays ten simulated seconds per second."
              : "Select a system to inspect its connections."}
          </small>
          <p className="home-system-note">{systemNotes[selected]}</p>
        </section>
        <div className="home-workbench">
          <section className="home-inputs" aria-labelledby="home-heading">
            <h1 id="home-heading">
              Change the body.
              <br />
              See what follows.
            </h1>
            <label htmlFor="experiment">Experiment</label>
            <select id="experiment" value={experiment} onChange={(e) => choose(e.target.value)}>
              {presets.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <div className="home-age-inputs">
              <label>
                Activity
                <select
                  aria-label="Activity"
                  value={config.exercise}
                  onChange={(e) => change({ ...config, exercise: Number(e.target.value) })}
                >
                  <option value={0}>Rest</option>
                  <option value={0.1}>0.1 · Exercise intensity</option>
                  <option value={0.2}>0.2 · Exercise intensity</option>
                  <option value={0.3}>0.3 · Exercise intensity</option>
                </select>
              </label>
              <label>
                Air pressure
                <select
                  aria-label="Air pressure"
                  value={config.pressure}
                  onChange={(e) => change({ ...config, pressure: Number(e.target.value) })}
                >
                  <option value={760}>760 mmHg · reference</option>
                  <option value={650}>650 mmHg · reduced</option>
                  <option value={525}>525 mmHg · reduced</option>
                </select>
              </label>
            </div>
            <details className="home-settings">
              <summary>
                Body changes <span>{changed ? `${changed} together` : "None"}</span>
              </summary>
              {BODY_CONTROLS.map((p) => (
                <label key={p.id} htmlFor={`home-${p.id}`}>
                  <span>
                    {p.label}
                    <output>
                      {config[p.id] > 0 ? "+" : ""}
                      {config[p.id]}%
                    </output>
                  </span>
                  <input
                    id={`home-${p.id}`}
                    type="range"
                    min={p.min}
                    max={p.max}
                    step={5}
                    value={config[p.id]}
                    onChange={(e) => {
                      change({ ...config, [p.id]: Number(e.target.value) });
                      setSelected(p.system);
                      setExperiment("custom");
                    }}
                  />
                  <small>{p.detail}</small>
                </label>
              ))}
              <button type="button" className="home-secondary" onClick={() => choose("baseline")}>
                Reset body
              </button>
            </details>
            <button type="button" className="home-simulate" disabled={busy} onClick={simulate}>
              {busy ? "Simulating…" : "Simulate"}
            </button>
            {busy && (
              <p role="status" className="home-notice">
                Running the unmodified and changed body under identical conditions. First runs can
                take up to three minutes.
              </p>
            )}
            {error && (
              <p role="alert" className="home-error">
                {error}
              </p>
            )}
            {stale && (
              <p role="status" className="home-notice">
                Inputs changed. Simulate again to compare this body.
              </p>
            )}
            <p className="home-scope">
              3 minutes of coupled physiology, followed by a 30-second measurement window. Yearly
              decline and fatal outcomes remain uncalibrated. Custom redesigns are not clinically
              calibrated.
            </p>
          </section>
          {run && (
            <section
              ref={result}
              tabIndex={-1}
              className="home-result"
              aria-label="Simulation results"
            >
              {stale ? (
                <p>Previous results hidden: the body or conditions changed.</p>
              ) : (
                <>
                  <div className="home-result-heading">
                    <h2>
                      {point?.elapsed_s} seconds <span>Recorded playback</span>
                    </h2>
                    <span>Pulse 4.4.0 · acute experiment</span>
                  </div>
                  <section
                    className={`home-playback-body ${playing ? "is-playing" : ""}`}
                    aria-label="Playback body"
                  >
                    <LivingPerson
                      active={!!point && config.exercise > 0}
                      systems
                      selected={selected}
                      heat={point ? Math.max(0, point.values.CoreTemperature - 37) : 0}
                      onSelect={setSelected}
                      showCallouts={false}
                      measuredRates={
                        point
                          ? {
                              heart: point.values.HeartRate,
                              breathing: point.values.RespirationRate,
                            }
                          : undefined
                      }
                    />
                    <p>
                      {point
                        ? `${outputText("HeartRate", point.values.HeartRate)} heart · ${outputText("RespirationRate", point.values.RespirationRate)} breathing`
                        : "Recorded body rates"}
                    </p>
                  </section>
                  <div className="home-transport">
                    <button
                      className="home-secondary"
                      type="button"
                      onClick={() => {
                        if (index === 18) setIndex(0);
                        setPlaying(!playing);
                      }}
                    >
                      {playing ? "Pause" : "Play"}
                    </button>
                    <button
                      className="home-secondary"
                      type="button"
                      onClick={() => {
                        setIndex(0);
                        setPlaying(false);
                      }}
                    >
                      Restart
                    </button>
                    <label>
                      Time
                      <input
                        aria-label="Timeline seconds"
                        type="range"
                        min={0}
                        max={180}
                        step={10}
                        value={index * 10}
                        onChange={(e) => {
                          setIndex(Number(e.target.value) / 10);
                          setPlaying(false);
                        }}
                      />
                    </label>
                  </div>
                  <div className="home-chart-container">
                    <div className="home-chart-scale" aria-hidden="true">
                      <span>{outputText(metric, low + span)}</span>
                      <span>{outputText(metric, low + span / 2)}</span>
                      <span>{outputText(metric, low)}</span>
                    </div>
                    <div className="home-chart-plot">
                      <label className="home-chart-select">
                        Trace
                        <select
                          aria-label="Chart measurement"
                          value={metric}
                          onChange={(e) => setMetric(e.target.value)}
                        >
                          {OUTPUTS.filter((o) => o[0] !== "CerebralBloodFlow").map((o) => (
                            <option key={o[0]} value={o[0]}>
                              {o[1]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <svg
                        className="home-chart"
                        viewBox="0 0 600 160"
                        preserveAspectRatio="none"
                        role="img"
                        aria-label={`${OUTPUTS.find((o) => o[0] === metric)?.[1]}: dashed unmodified and solid changed body, instantaneous samples every ten seconds.`}
                      >
                        <path
                          d={chartPath(run.baseline.rows)}
                          fill="none"
                          className="home-chart-baseline"
                          strokeWidth="3"
                        />
                        <path
                          d={chartPath(run.modified.rows)}
                          fill="none"
                          className="home-chart-line"
                          strokeWidth="3"
                        />
                        <line
                          x1={(index / 18) * 600}
                          x2={(index / 18) * 600}
                          y1={10}
                          y2={150}
                          className="home-chart-cursor"
                          strokeWidth="2"
                        />
                      </svg>
                      <div className="home-chart-ages">
                        <span>0 seconds</span>
                        <span>180 seconds</span>
                      </div>
                      <p className="home-chart-legend">
                        <span>Dashed: unmodified</span>
                        <span>Solid: changed</span>
                      </p>
                    </div>
                  </div>
                  <p className="home-year-summary" role="status">
                    {playing
                      ? "Playing recorded samples."
                      : `At ${index * 10} seconds: unmodified ${outputText(metric, run.baseline.rows[index].values[metric])}; changed ${outputText(metric, run.modified.rows[index].values[metric])}.`}{" "}
                    The table compares dense means from seconds 180–210; chart samples are
                    instantaneous.
                  </p>
                  <p className="home-takeaway">
                    Oxygen saturation:{" "}
                    {outputText(
                      "OxygenSaturation",
                      run.baseline.trailing_30s_mean.OxygenSaturation,
                    )}{" "}
                    →{" "}
                    {outputText(
                      "OxygenSaturation",
                      run.modified.trailing_30s_mean.OxygenSaturation,
                    )}
                    . Mean arterial pressure:{" "}
                    {outputText(
                      "MeanArterialPressure",
                      run.baseline.trailing_30s_mean.MeanArterialPressure,
                    )}{" "}
                    →{" "}
                    {outputText(
                      "MeanArterialPressure",
                      run.modified.trailing_30s_mean.MeanArterialPressure,
                    )}
                    . These are combined outcomes, not a health score.
                  </p>
                  <p className="home-scroll-cue">Scroll the table sideways for differences.</p>
                  <section
                    className="home-comparison"
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the wide comparison table.
                    tabIndex={0}
                    aria-label="All comparison measurements"
                  >
                    <table>
                      <caption>Same conditions, same reference adult · 30-second means</caption>
                      <thead>
                        <tr>
                          <th scope="col">Measurement</th>
                          <th scope="col">Unmodified</th>
                          <th scope="col">Changed</th>
                          <th scope="col">Difference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {OUTPUTS.map(([key, label, unit, factor]) => {
                          const a = run.baseline.trailing_30s_mean[key];
                          const b = run.modified.trailing_30s_mean[key];
                          const rawDelta = (b - a) * factor;
                          const delta =
                            Math.abs(rawDelta) < (key === "BloodPH" ? 0.0005 : 0.005)
                              ? 0
                              : rawDelta;
                          return (
                            <tr key={key}>
                              <th scope="row">{label}</th>
                              <td>{outputText(key, a)}</td>
                              <td>{outputText(key, b)}</td>
                              <td>
                                {delta > 0 ? "+" : ""}
                                {delta.toFixed(key === "BloodPH" ? 3 : 2)}{" "}
                                {key === "OxygenSaturation" ? "pp" : unit}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </section>
                  <section className="home-reason">
                    <h3>What changed, and why</h3>
                    {comparisonTrace(run).map((reason) => (
                      <p key={reason}>{reason}</p>
                    ))}
                    <h3>Threshold crossings</h3>
                    <p>
                      Engine classifications, not injury or fatal points. Entry and clearance use
                      hysteresis.
                    </p>
                    {(
                      [
                        ["Unmodified", run.baseline],
                        ["Changed", run.modified],
                      ] as const
                    ).map(([label, record]) => (
                      <div key={label}>
                        <h4>{label}</h4>
                        {record.events.length ? (
                          record.events.map((event) => (
                            <p key={event.event}>
                              {event.event === "Hypoxia"
                                ? "Low-oxygen flag"
                                : "Respiratory-alkalosis flag"}{" "}
                              entered at {event.elapsed_s.toFixed(2)} s. Sample at{" "}
                              {event.sample_elapsed_s.toFixed(2)} s: arterial O₂{" "}
                              {event.values.ArterialOxygenPressure.toFixed(2)} mmHg; CO₂{" "}
                              {event.values.ArterialCarbonDioxidePressure.toFixed(2)} mmHg; pH{" "}
                              {event.values.BloodPH.toFixed(3)}.{" "}
                              {event.event === "Hypoxia"
                                ? "Pulse enters at cycle-averaged O₂ ≤65 mmHg, clears above 68."
                                : "Pulse enters at cycle-averaged pH >7.45 and CO₂ <37, clears at pH ≤7.43 and CO₂ >39."}{" "}
                              These are the nearest subsequent retained readings, not the exact
                              cardiac-cycle averages that triggered the event.
                            </p>
                          ))
                        ) : (
                          <p>
                            No source-audited oxygen or respiratory-alkalosis flag was observed in
                            this run.
                          </p>
                        )}
                      </div>
                    ))}
                    <h3>Over the years</h3>
                    <p>
                      This model has no calibrated aging trajectory for these organ edits. We cannot
                      identify a fatal year, failing organ or delayed injury. More efficient lungs
                      do not automatically make normal oxygen environments dangerous; that effect
                      must be modeled and evidenced.
                    </p>
                  </section>
                  <details className="home-evidence">
                    <summary>Model, assumptions and recorded data</summary>
                    <p>
                      Reference: male, 44 years, 180.34 cm, input mass 77.1107 kg. Exercise
                      intensity is a fraction of the engine’s maximum metabolic rate, not a
                      percentage of heart rate. Oxygen fraction remains unchanged when atmospheric
                      pressure changes.
                    </p>
                    <p>
                      Capacity and exchange area change at initialization; rate, contraction and
                      resistance modifiers apply suddenly after stabilization. Heart contraction’s
                      upstream modifier acts on elastance; factors above one are squared. Mass,
                      added tissue, chest space, surgical feasibility, adaptation and chronic damage
                      are not calculated. There is no calibrated sustainable-workload score or
                      lifespan estimate.
                    </p>
                    <p>
                      Only source-audited Hypoxia and RespiratoryAlkalosis events are shown.
                      Upstream moderate/severe hypocapnia flags are excluded because this release
                      compares oxygen rather than CO₂. No flag decides survival.
                    </p>
                    {run.modified.warnings.length > 0 && (
                      <>
                        <h3>Engine warnings</h3>
                        {run.modified.warnings.map((warning) => (
                          <p key={warning}>{warning}</p>
                        ))}
                      </>
                    )}
                    <a
                      href="https://pulse.kitware.com/_patient_methodology.html"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Pulse adult-patient methodology
                    </a>
                    <p>
                      Engine source: {run.sourceSha}. Adapter/reference SHA256: {run.adapterSha}.
                      Experiment version: {run.version}. Custom intervention magnitudes are not
                      independently clinically calibrated.
                    </p>
                    <p>
                      Published annual population evidence is separate: {ANNUAL_SOURCE.population}.
                      It cannot be applied as an organ-upgrade effect.
                    </p>
                    <a href={ANNUAL_SOURCE.report} target="_blank" rel="noreferrer">
                      CDC/NCHS annual life table — population reference only
                    </a>
                    <button type="button" className="home-secondary" onClick={exportRun}>
                      Export recorded result
                    </button>
                  </details>
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
