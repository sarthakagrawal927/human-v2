import { useEffect, useRef, useState } from "react";
import { LivingPerson } from "./components/LivingPerson";
import { ANNUAL_SOURCE, type AnnualRun, annualReplay, simulateAnnual } from "./model/annual";
import {
  BASE_CONFIGURATION,
  type Configuration,
  PARAMETERS,
  type SystemId,
} from "./model/simulator";
import "./home.css";

const experiments = [
  ["baseline", "Baseline — annual population reference"],
  ["lungs", "Lung exchange +20% — annual outcome unknown"],
  ["heart", "Heart pumping +20% — annual outcome unknown"],
  ["cooling", "Cooling +20% — annual outcome unknown"],
  ["custom", "Custom changes — annual outcome unknown"],
] as const;

export default function AnnualHome() {
  const [experiment, setExperiment] = useState("");
  const [configuration, setConfiguration] = useState<Configuration>({ ...BASE_CONFIGURATION });
  const [age, setAge] = useState(20);
  const [years, setYears] = useState(60);
  const [selected, setSelected] = useState<SystemId>("heart");
  const [run, setRun] = useState<AnnualRun | null>(null);
  const [year, setYear] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState("");
  const result = useRef<HTMLElement>(null);
  const simulateButton = useRef<HTMLButtonElement>(null);
  const modified = Object.values(configuration).some((value) => value !== 0);
  const point = run?.points[year];
  const stale =
    !!run &&
    (run.startAge !== age ||
      run.years !== years ||
      JSON.stringify(run.configuration) !== JSON.stringify(configuration));
  useEffect(() => {
    if (!playing || !run || stale) return;
    const timer = window.setInterval(
      () => setYear((current) => Math.min(current + 1, run.years)),
      450,
    );
    return () => window.clearInterval(timer);
  }, [playing, run, stale]);
  useEffect(() => {
    if (run && year >= run.years) setPlaying(false);
  }, [year, run]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);
  function choose(id: string) {
    setExperiment(id);
    const next = { ...BASE_CONFIGURATION };
    if (id === "lungs") {
      next.exchange = 20;
      setSelected("lungs");
    }
    if (id === "heart") {
      next.pumping = 20;
      setSelected("heart");
    }
    if (id === "cooling") {
      next.cooling = 20;
      setSelected("cooling");
    }
    if (id !== "custom") setConfiguration(next);
    setPlaying(false);
    setNotice("");
  }
  function simulate() {
    const next = simulateAnnual(age, years, configuration);
    setRun(next);
    setYear(0);
    setPlaying(
      next.status === "population-reference" &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    setNotice(
      next.status === "population-reference"
        ? "Annual population reference calculated."
        : "Annual outcomes for this modification are not supported by the published data.",
    );
    requestAnimationFrame(() => {
      result.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
      result.current?.focus({ preventScroll: true });
    });
  }
  function exportRun() {
    if (!run || stale) return;
    const url = URL.createObjectURL(new Blob([annualReplay(run)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "human-v2-annual-reference.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const path =
    run?.points
      .map((p, i) => `${i ? "L" : "M"}${(p.year / run.years) * 600},${150 - p.survival * 140}`)
      .join(" ") ?? "";
  return (
    <main className="human-home">
      <header className="home-header">
        <a href="#home">Human V2</a>
        <span>Body experiments</span>
      </header>
      <div id="home" className="home-experiment">
        <section className="home-body" aria-label="Human body">
          <LivingPerson
            active={false}
            systems
            selected={selected}
            heat={0}
            onSelect={setSelected}
            showCallouts={false}
          />
          <p>{point && !stale ? `Age ${point.age} · Year ${point.year}` : "Body illustration"}</p>
          <small>Static anatomy illustration; organ aging is not measured.</small>
        </section>
        <section className="home-inputs" aria-labelledby="home-heading">
          <h1 id="home-heading">Choose an experiment.</h1>
          <label htmlFor="experiment">Experiment</label>
          <select id="experiment" value={experiment} onChange={(e) => choose(e.target.value)}>
            <option value="" disabled>
              Select an experiment
            </option>
            {experiments.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          {modified && (
            <p className="home-notice">
              Annual effects of these changes are unknown. Simulate will explain the evidence gap;
              it will not generate a lifespan.
            </p>
          )}
          <div className="home-age-inputs">
            <label>
              Starting age
              <select
                aria-label="Starting age"
                value={age}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setAge(next);
                  setYears(Math.min(years, 100 - next));
                  setPlaying(false);
                }}
              >
                {Array.from({ length: 71 }, (_, i) => i + 20).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Years
              <select
                aria-label="Years"
                value={years}
                onChange={(e) => {
                  setYears(Number(e.target.value));
                  setPlaying(false);
                }}
              >
                {Array.from({ length: 100 - age }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <details className="home-settings">
            <summary>Body changes</summary>
            {PARAMETERS.map((p) => (
              <label key={p.id} htmlFor={`home-${p.id}`}>
                <span>
                  {p.label}
                  <output>
                    {configuration[p.id] > 0 ? "+" : ""}
                    {configuration[p.id]}%
                  </output>
                </span>
                <input
                  id={`home-${p.id}`}
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={5}
                  value={configuration[p.id]}
                  onChange={(e) => {
                    setConfiguration({ ...configuration, [p.id]: Number(e.target.value) });
                    setSelected(p.system);
                    setExperiment("custom");
                    setPlaying(false);
                  }}
                />
              </label>
            ))}
            <button type="button" className="home-secondary" onClick={() => choose("baseline")}>
              Reset body
            </button>
          </details>
          <button
            type="button"
            className="home-simulate"
            ref={simulateButton}
            disabled={!experiment}
            onClick={simulate}
          >
            Simulate
          </button>
          <p className="home-scope">
            Annual reference: U.S. population, 2023 mortality rates. Modified-organ outcomes are not
            calibrated.
          </p>
          {stale && <p role="status">Inputs changed. Simulate again.</p>}
          {!stale && notice && (
            <p className="home-notice" role="status">
              {notice}
            </p>
          )}
        </section>
      </div>
      {run && (
        <section
          ref={result}
          tabIndex={-1}
          className={`home-result ${stale ? "home-stale" : ""}`}
          aria-label="Simulation results"
        >
          {stale ? (
            <p>The previous result is hidden until you simulate these inputs.</p>
          ) : run.status === "unsupported-modification" ? (
            <section className="home-unknown">
              <h2>Yearly outcome unknown</h2>
              <p>
                No validated model is implemented here for annual organ deterioration or mortality
                after these changes.
              </p>
              <h3>Fatal points cannot be calculated</h3>
              <p>
                The available life table measures population deaths. It has no modified-organ data
                or individual causes of death. Applying it to an upgraded body would invent an
                effect.
              </p>
              <button
                className="home-secondary"
                type="button"
                onClick={() => {
                  choose("baseline");
                  setRun(null);
                  simulateButton.current?.scrollIntoView({ block: "center", behavior: "instant" });
                  simulateButton.current?.focus({ preventScroll: true });
                }}
              >
                Choose baseline reference
              </button>
            </section>
          ) : (
            point && (
              <>
                <div className="home-result-heading">
                  <h2>
                    Year {year} <span>Age {point.age}</span>
                  </h2>
                  <span>Population reference</span>
                </div>
                <div className="home-transport">
                  <button
                    className="home-secondary"
                    type="button"
                    onClick={() => {
                      if (year === run.years) setYear(0);
                      setPlaying(!playing);
                    }}
                  >
                    {playing ? "Pause" : "Play"}
                  </button>
                  <button
                    className="home-secondary"
                    type="button"
                    onClick={() => {
                      setYear(0);
                      setPlaying(false);
                    }}
                  >
                    Restart
                  </button>
                  <label>
                    Year
                    <input
                      aria-label="Timeline year"
                      type="range"
                      min={0}
                      max={run.years}
                      step={1}
                      value={year}
                      onChange={(e) => {
                        setYear(Number(e.target.value));
                        setPlaying(false);
                      }}
                    />
                  </label>
                </div>
                <div className="home-statistics">
                  <div>
                    <span>Surviving to this age</span>
                    <strong>{(point.survival * 100).toFixed(1)}%</strong>
                    <p>Conditional on being alive at age {run.startAge}.</p>
                  </div>
                  <div>
                    <span>Death probability in the next year</span>
                    <strong>
                      {point.nextYearDeathProbability === null
                        ? "Not available"
                        : `${(point.nextYearDeathProbability * 100).toFixed(2)}%`}
                    </strong>
                    <p>
                      {point.age === 100
                        ? "Age 100+ is an open-ended interval."
                        : `Age ${point.age} to ${point.age + 1}, all causes.`}
                    </p>
                  </div>
                </div>
                <div className="home-chart-container">
                  <div className="home-chart-scale" aria-hidden="true">
                    <span>100%</span>
                    <span>50%</span>
                    <span>0%</span>
                  </div>
                  <div className="home-chart-plot">
                    <svg
                      className="home-chart"
                      viewBox="0 0 600 160"
                      preserveAspectRatio="none"
                      role="img"
                      aria-label="Population survival across the selected years"
                    >
                      <path d="M0 10V150H600" fill="none" className="home-chart-axis" />
                      <path d={path} fill="none" className="home-chart-line" strokeWidth="3" />
                      <line
                        x1={(year / run.years) * 600}
                        x2={(year / run.years) * 600}
                        y1={10}
                        y2={150}
                        className="home-chart-cursor"
                        strokeWidth="2"
                      />
                    </svg>
                    <div className="home-chart-ages">
                      <span>Age {run.startAge}</span>
                      <span>Age {run.startAge + run.years}</span>
                    </div>
                  </div>
                </div>
                <p className="home-year-summary" role="status" aria-live="polite">
                  {playing
                    ? "Playing annual population reference."
                    : `Year ${year}, age ${point.age}. ${(point.survival * 100).toFixed(1)}% population survival from starting age.`}
                </p>
                <section className="home-reason">
                  <h3>Why the risk changes</h3>
                  <p>
                    Each year uses the published death probability for that age. Survival carries
                    forward: previous survival × (1 − annual death probability).
                  </p>
                  <p>
                    This is a hypothetical population exposed to 2023 rates throughout life. It does
                    not predict future medical advances or a particular person's death.
                  </p>
                  <h3>Fatal points</h3>
                  <p>
                    No individual fatal year or failing organ can be identified from this data.
                    Organ progression and modification effects remain unknown.
                  </p>
                </section>
              </>
            )
          )}
          {!stale && (
            <details className="home-evidence">
              <summary>Data and limitations</summary>
              <p>{ANNUAL_SOURCE.population}. Published July 15, 2025.</p>
              <a href={ANNUAL_SOURCE.report} target="_blank" rel="noreferrer">
                CDC/NCHS life tables — Table 1
              </a>
              <p>
                Source age-specific probabilities are preserved. No organ-failure, personal-risk or
                intervention coefficients are added. The dataset does not provide personal
                uncertainty intervals. All-sex U.S. population estimates may not describe a
                particular person or other population.
              </p>
              <p>Version: {run.version}</p>
              <button className="home-secondary" type="button" onClick={exportRun}>
                Export recorded result
              </button>
            </details>
          )}
        </section>
      )}
    </main>
  );
}
