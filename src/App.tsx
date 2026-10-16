// THESIS: A person in a changing world makes coupled consequences visible.
// FORM: Owner-selected Life Theatre B; simultaneous edits and recorded playback.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LifeTheatre } from "./components/LifeTheatre";
import { ModelNotes } from "./components/ModelNotes";
import { explainWorkloadChange } from "./model/diagnosis";
import type { Experiment } from "./model/history";
import {
  exportExperiments,
  HISTORY_KEY,
  importExperiments,
  mergeExperiments,
  newExperiment,
  parseExperiments,
  sameConfiguration,
} from "./model/history";
import type { Configuration, SimulationResult, SystemId } from "./model/simulator";
import {
  BASE_CONFIGURATION,
  BASE_RESULT,
  CHALLENGE,
  CONTEXT,
  compareResults,
  PARAMETERS,
  parseConfiguration,
  parseContext,
  SYSTEMS,
  simulate,
} from "./model/simulator";
import { DEFAULT_TIMELINE, sameTimelineSettings, type TimelineSettings } from "./model/timeline";

type View = "lab" | "history" | "leaderboard" | "notes";
interface Entry {
  id: string;
  name: string;
  configuration: Configuration;
  score: number;
  digest: string;
  createdAt: string;
  context: typeof CONTEXT;
}
const signed = (v: number, d = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;
const label = (id: SystemId) => SYSTEMS.find((x) => x.id === id)?.name ?? id;
function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return { experiments: raw ? parseExperiments(JSON.parse(raw)) : [], problem: "" };
  } catch {
    return {
      experiments: [],
      problem:
        "Saved history could not be read. The original data is preserved. Export recovery data before saving new experiments.",
    };
  }
}
function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function api<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed. Try again.");
  return data as T;
}

export default function App() {
  const [initial] = useState(readHistory);
  const [view, setView] = useState<View>("lab");
  const [selected, setSelected] = useState<SystemId>("heart");
  const [configuration, setConfiguration] = useState<Configuration>({ ...BASE_CONFIGURATION });
  const [run, setRun] = useState<SimulationResult>(BASE_RESULT);
  const [timelineSettings, setTimelineSettings] = useState<TimelineSettings>({
    ...DEFAULT_TIMELINE,
  });
  const [recordedTimelineSettings, setRecordedTimelineSettings] = useState<TimelineSettings>({
    ...DEFAULT_TIMELINE,
  });
  const [replayReference, setReplayReference] = useState<Configuration | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>(initial.experiments);
  const [storageProblem, setStorageProblem] = useState(initial.problem);
  const [referenceId, setReferenceId] = useState("baseline");
  const [forkOf, setForkOf] = useState<string | null>(null);
  const [name, setName] = useState("Experiment 01");
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("Baseline loaded.");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [leaderboardError, setLeaderboardError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const [saving, setSaving] = useState(false);
  const [undoDraft, setUndoDraft] = useState<{
    configuration: Configuration;
    run: SimulationResult;
    name: string;
    forkOf: string | null;
    referenceId: string;
    timelineSettings: TimelineSettings;
    recordedTimelineSettings: TimelineSettings;
    replayReference: Configuration | null;
  } | null>(null);
  const bodyStale = !sameConfiguration(configuration, run.configuration);
  const stale = bodyStale || !sameTimelineSettings(timelineSettings, recordedTimelineSettings);
  const referenceExperiment = experiments.find((e) => e.id === referenceId);
  const reference = useMemo(
    () =>
      referenceExperiment
        ? simulate(referenceExperiment.configuration, referenceExperiment.context)
        : referenceId === "replay" && replayReference
          ? simulate(replayReference)
          : BASE_RESULT,
    [referenceExperiment, referenceId, replayReference],
  );
  const comparison = compareResults(run, reference);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLeaderboardError("");
    try {
      const data = await api<{ entries: Entry[] }>("/api/leaderboard");
      setEntries(data.entries);
    } catch {
      setLeaderboardError(
        "Rankings could not be loaded. Check your connection, then try again. Your experiment is unchanged.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (view === "leaderboard") void refresh();
  }, [view, refresh]);
  function navigate(next: View) {
    setView(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function benchmark() {
    setRunning(true);
    setNotice("Running the pinned benchmarks and repeated-day scenario…");
    requestAnimationFrame(() => {
      const result = simulate(configuration);
      setRun(result);
      setRecordedTimelineSettings({ ...timelineSettings });
      setRunning(false);
      if (window.matchMedia("(max-width: 1030px)").matches)
        requestAnimationFrame(() =>
          document.getElementById("life-stage")?.scrollIntoView({
            block: "start",
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant"
              : "smooth",
          }),
        );
      setNotice(
        result.valid
          ? "Benchmark and repeated-day scenario complete. Inspect the limits, accumulated state and recovery, then save or iterate."
          : "Benchmark complete. This configuration violates the challenge constraints.",
      );
    });
  }
  function change(c: Configuration) {
    setConfiguration(parseConfiguration(c));
    setNotice("Draft changed. Simulate changes to update playback and recorded results.");
  }
  async function persist(next: Experiment[]) {
    if (storageProblem) {
      setNotice(storageProblem);
      return false;
    }
    try {
      if (!navigator.locks)
        throw new Error(
          "Safe saving needs a browser with Web Locks support. Export JSON to preserve your experiment.",
        );
      return await navigator.locks.request(HISTORY_KEY, () => {
        const raw = localStorage.getItem(HISTORY_KEY);
        const latest = raw ? parseExperiments(JSON.parse(raw)) : [];
        const merged = mergeExperiments(latest, next);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(merged));
        setExperiments(merged);
        return true;
      });
    } catch (e) {
      setNotice(
        `History could not be saved. ${e instanceof Error ? e.message : "Browser storage is unavailable."} Existing data is unchanged; export a backup.`,
      );
      return false;
    }
  }
  async function save() {
    setSaving(true);
    const experiment = newExperiment(name, run.configuration, forkOf, recordedTimelineSettings);
    if (await persist([...experiments, experiment])) {
      setForkOf(experiment.id);
      setName(`Experiment ${String(experiments.length + 2).padStart(2, "0")}`);
      setNotice(
        `Saved “${experiment.name}” with its baseline, environment, simulator version and daily scenario.`,
      );
    }
    setSaving(false);
  }
  function restore(e: Experiment, fork: boolean) {
    setConfiguration({ ...e.configuration });
    setRun(simulate(e.configuration, e.context));
    setTimelineSettings({ ...(e.timeline ?? DEFAULT_TIMELINE) });
    setRecordedTimelineSettings({ ...(e.timeline ?? DEFAULT_TIMELINE) });
    setForkOf(e.id);
    setName(fork ? `${e.name} fork` : `${e.name} restored`);
    navigate("lab");
    setNotice(
      `${fork ? "Forked" : "Restored"} “${e.name}”. Its saved snapshot remains unchanged.${e.timeline ? " Daily scenario restored." : " Legacy run has no timeline; a new default scenario is shown separately."}`,
    );
  }
  async function submit() {
    setSubmitting(true);
    setNotice("The server is recomputing this configuration…");
    try {
      const data = await api<{ duplicate: boolean; entry: Entry }>("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, configuration: run.configuration, context: run.context }),
      });
      setNotice(
        data.duplicate
          ? "This exact configuration is already ranked; its original entry is preserved."
          : "Submitted. The server verified all constraints and recomputed the score.",
      );
      navigate("leaderboard");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Submission failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }
  async function replay(entry: Entry) {
    setLoading(true);
    setLeaderboardError("");
    try {
      const data = await api<{ result: SimulationResult; entry: Entry; verified: boolean }>(
        `/api/submissions/${entry.id}`,
      );
      parseContext(data.entry.context);
      const config = parseConfiguration(data.entry.configuration);
      const result = simulate(config, data.entry.context);
      if (!data.verified || result.score !== data.entry.score)
        throw new Error("Replay failed verification.");
      setConfiguration(config);
      setRun(result);
      setTimelineSettings({ ...DEFAULT_TIMELINE });
      setRecordedTimelineSettings({ ...DEFAULT_TIMELINE });
      setForkOf(null);
      setName(`${entry.name} fork`.slice(0, 60));
      navigate("lab");
      setNotice(
        `Reproduced “${entry.name}”: score ${result.score.toFixed(1)}, verified by server and browser.`,
      );
    } catch (e) {
      setLeaderboardError(e instanceof Error ? e.message : "Could not reproduce entry.");
    } finally {
      setLoading(false);
    }
  }
  async function importFile(selectedFile: File) {
    try {
      if (selectedFile.size > 1000000) throw new Error("Import exceeds 1 MB.");
      const incoming = importExperiments(await selectedFile.text());
      if (await persist(mergeExperiments(experiments, incoming)))
        setNotice(
          `Imported ${incoming.length} compatible experiments. Existing history is preserved.`,
        );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Import failed. Existing history is unchanged.");
    }
  }
  function forkBaseline() {
    if (
      !sameConfiguration(configuration, { ...BASE_CONFIGURATION }) ||
      run.modifications > 0 ||
      !sameTimelineSettings(timelineSettings, DEFAULT_TIMELINE) ||
      !sameTimelineSettings(recordedTimelineSettings, DEFAULT_TIMELINE)
    )
      setUndoDraft({
        configuration: { ...configuration },
        run,
        name,
        forkOf,
        referenceId,
        timelineSettings,
        recordedTimelineSettings,
        replayReference,
      });
    setConfiguration({ ...BASE_CONFIGURATION });
    setRun(BASE_RESULT);
    setTimelineSettings({ ...DEFAULT_TIMELINE });
    setRecordedTimelineSettings({ ...DEFAULT_TIMELINE });
    setReplayReference(null);
    setForkOf(null);
    setName(`Experiment ${String(experiments.length + 1).padStart(2, "0")}`);
    setReferenceId("baseline");
    setNotice("Forked the baseline. Set body traits and daily conditions together, then simulate.");
    navigate("lab");
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to experiment
      </a>
      <header className="site-header">
        <a
          href="/"
          className="wordmark"
          onClick={(e) => {
            e.preventDefault();
            navigate("lab");
          }}
        >
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M2 16h7l4-10 5 20 4-10h8" />
          </svg>
          HUMAN <span>V2</span>
        </a>
        <span className="site-register">LIFE THEATRE</span>
        <nav aria-label="Main navigation">
          {(
            [
              ["lab", "Workbench"],
              ["history", "Experiments"],
              ["leaderboard", "Challenge"],
              ["notes", "Model notes"],
            ] as const
          ).map(([id, title]) => (
            <button
              type="button"
              key={id}
              aria-current={view === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              {title}
            </button>
          ))}
        </nav>
        <span className="local-badge">
          <span /> Local prototype
        </span>
      </header>
      <main id="main">
        <div className="challenge-heading">
          <div>
            <p className="challenge-kicker">
              {view === "lab" ? "A COUPLED BODY SIMULATOR" : "HUMAN V2 / EXPERIMENTS"}
            </p>
            <h1>
              {view === "lab"
                ? "Body simulator"
                : view === "history"
                  ? "Experiments"
                  : view === "leaderboard"
                    ? "Challenge rankings"
                    : "Model notes"}
            </h1>
            <p className="intro">
              {view === "lab"
                ? "Set traits and daily conditions, then simulate."
                : view === "history"
                  ? "Saved traits, conditions and model versions."
                  : view === "leaderboard"
                    ? "Valid configurations only. Every score is recomputed by the server under identical conditions."
                    : "Equations, assumptions and unsupported effects."}
            </p>
          </div>
          <button type="button" className="button secondary baseline-button" onClick={forkBaseline}>
            Fork baseline <span aria-hidden="true">↗</span>
          </button>
        </div>
        {view !== "lab" && (
          <div className="challenge-strip">
            <span>
              <strong>3</strong> modifications max
            </span>
            <span>
              <strong>±5%</strong> body mass
            </span>
            <span>
              <strong>±5%</strong> resting energy
            </span>
            <span>
              <strong>22°C</strong> · 40% humidity
            </span>
            <a
              href="/?view=notes"
              onClick={(e) => {
                e.preventDefault();
                navigate("notes");
              }}
            >
              Assumptions & limits ↗
            </a>
          </div>
        )}
        <div className="status-line" role="status" aria-live="polite">
          <span className="status-dot" />
          {notice}
          {undoDraft && (
            <button
              type="button"
              className="undo-reset"
              onClick={() => {
                setConfiguration(undoDraft.configuration);
                setRun(undoDraft.run);
                setName(undoDraft.name);
                setForkOf(undoDraft.forkOf);
                setReferenceId(undoDraft.referenceId);
                setTimelineSettings(undoDraft.timelineSettings);
                setRecordedTimelineSettings(undoDraft.recordedTimelineSettings);
                setReplayReference(undoDraft.replayReference);
                setUndoDraft(null);
                navigate("lab");
                setNotice("Restored your previous draft and benchmark.");
              }}
            >
              Undo baseline reset
            </button>
          )}
        </div>
        {storageProblem && (
          <div role="alert" className="error-banner">
            {storageProblem}
            <button
              type="button"
              onClick={() => {
                try {
                  download("human-v2-recovery.json", localStorage.getItem(HISTORY_KEY) ?? "null");
                  setStorageProblem(
                    "Recovery exported. To use new history, repair or import compatible data in a separate browser profile. Existing stored data remains untouched.",
                  );
                } catch {
                  setNotice("Browser storage is inaccessible; recovery export could not be read.");
                }
              }}
            >
              Export recovery data
            </button>
          </div>
        )}
        {view === "lab" && (
          <>
            <LifeTheatre
              configuration={configuration}
              recordedConfiguration={run.configuration}
              reference={reference.configuration}
              referenceName={
                referenceId === "baseline"
                  ? "Baseline"
                  : referenceId === "replay"
                    ? "Replay reference"
                    : (referenceExperiment?.name ?? "Selected run")
              }
              settings={timelineSettings}
              recordedSettings={recordedTimelineSettings}
              stale={stale}
              running={running}
              selected={selected}
              onChange={change}
              onSelect={setSelected}
              onSettings={(settings) => {
                setTimelineSettings(settings);
                setNotice("Routine changed. Simulate to record these conditions.");
              }}
              onRun={() => benchmark()}
              onNotes={() => navigate("notes")}
              onSaveReveal={() => {
                document
                  .querySelector(".experiment-bar")
                  ?.scrollIntoView({ block: "center", behavior: "instant" });
                document.getElementById("experiment-name")?.focus({ preventScroll: true });
              }}
              onImport={(replay) => {
                setConfiguration(replay.configuration);
                setRun(simulate(replay.configuration));
                setTimelineSettings(replay.settings);
                setRecordedTimelineSettings(replay.settings);
                setReplayReference(replay.reference);
                setReferenceId("replay");
                setForkOf(null);
                setName("Imported life simulation");
                setNotice(
                  "Timeline replay reproduced from versioned inputs. Recorded results were independently checked.",
                );
              }}
            />
            <section className="experiment-bar" aria-label="Save and compare this experiment">
              <div className="experiment-identity">
                {" "}
                <label className="name-label" htmlFor="experiment-name">
                  Experiment name
                </label>
                <input
                  id="experiment-name"
                  className="name-input"
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>{" "}
              <button
                type="button"
                className="button save-button"
                disabled={stale || running || saving || !name.trim() || !!storageProblem}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save experiment"}
              </button>{" "}
              <div className="compare-control">
                <label htmlFor="reference">Compare with</label>
                <select
                  id="reference"
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                >
                  <option value="baseline">Baseline human</option>
                  {replayReference && <option value="replay">Imported replay reference</option>}
                  {experiments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
            </section>
            <details className="steady-benchmark">
              <summary>
                Steady-state challenge, save & compare{" "}
                <span>Baseline = 100 · three edits maximum</span>
              </summary>
              <div className="workbench">
                <section
                  className={`results ${stale ? "stale" : ""}`}
                  aria-labelledby="results-heading"
                >
                  <div className="results-top">
                    <span>BENCHMARK RESULT</span>
                    <span className={`validity ${run.valid ? "valid" : "invalid"}`}>
                      {stale ? "DRAFT CHANGED" : run.valid ? "VALID" : "INVALID"}
                    </span>
                  </div>
                  <h2 id="results-heading" ref={resultHeading} className="result-name">
                    {run.modifications === 0
                      ? "Baseline human"
                      : `${run.modifications}-modification body`}
                  </h2>
                  <div className="score-row">
                    <strong data-testid="workload-score">{run.score.toFixed(1)}</strong>
                    <span>
                      {signed(comparison.workloadPercent)}%
                      <small>vs {referenceId === "baseline" ? "baseline" : "selected run"}</small>
                    </span>
                  </div>
                  <p className="score-caption">Sustainable workload · baseline = 100</p>
                  <p className="score-caption" data-testid="injury-coverage">
                    Model constraints only · organ injury not assessed
                  </p>
                  <p className="work-watts">{run.workloadW.toFixed(2)} W simulated work</p>
                  <div className="limit-summary">
                    <span className="section-kicker">
                      {comparison.limitChanged ? "BOTTLENECK SHIFTED" : "CURRENT LIMIT"}
                    </span>
                    <h3 data-testid="limiting-system">
                      {run.limiting
                        .map((x) => label(x.system))
                        .filter((x, i, a) => a.indexOf(x) === i)
                        .join(" + ")}
                    </h3>
                    <p data-testid="workload-explanation">
                      {explainWorkloadChange(run, reference)}
                    </p>
                  </div>
                  <div className="benchmark-pair">
                    <div>
                      <span>Resting economy</span>
                      <strong>{run.rest.economyScore.toFixed(1)}</strong>
                      <small>Lower energy = higher score</small>
                    </div>
                    <div>
                      <span>Fixed exertion</span>
                      <strong>{run.exertion.sustainable ? "Pass" : "Exceeds limits"}</strong>
                      <small>{CHALLENGE.standardWorkW} W · identical conditions</small>
                    </div>
                  </div>
                  <dl className="result-costs">
                    <div>
                      <dt>Body mass</dt>
                      <dd>
                        {signed(run.massChangePercent)}% <span>/ ±5%</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Resting energy</dt>
                      <dd>
                        {signed(run.restChangePercent)}% <span>/ ±5%</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Modifications</dt>
                      <dd>
                        {run.modifications} <span>/ 3</span>
                      </dd>
                    </div>
                  </dl>
                  {run.violations.length > 0 && (
                    <div className="violations">
                      <h3>Outside challenge constraints</h3>
                      <ul>
                        {run.violations.map((v) => (
                          <li key={v.id}>{v.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {stale && (
                    <p className="stale-message">
                      Showing the previous benchmark. Run again to score this draft.
                    </p>
                  )}
                  <div className="result-actions">
                    <button
                      type="button"
                      className="button submit-button"
                      disabled={stale || !run.valid || running || submitting || !name.trim()}
                      onClick={() => void submit()}
                    >
                      {submitting ? "Verifying…" : "Submit to challenge ↗"}
                    </button>
                  </div>
                </section>
              </div>
              <section className="diagnosis section-surface" aria-labelledby="diagnosis-heading">
                <div className="section-heading">
                  <div>
                    <span className="section-kicker">COMPARE & DIAGNOSE</span>
                    <h2 id="diagnosis-heading">Why this result happened.</h2>
                  </div>
                </div>
                {stale && (
                  <p className="stale-inline">
                    These explanations belong to the previous benchmark, not the changed draft.
                  </p>
                )}
                <div className="diagnosis-columns">
                  <div className="ceiling-list">
                    <h3>Capacity ceilings</h3>
                    <p>The smallest ceiling sets sustainable workload.</p>
                    {comparison.ceilings.map((c) => (
                      <div className="ceiling-row" key={c.id}>
                        <div>
                          <span className={`system-dot ${c.system}`} />
                          <strong>{c.label}</strong>
                          <span>{c.workW.toFixed(1)} W</span>
                        </div>
                        <div className="ceiling-bar">
                          <span
                            style={{
                              width: `${Math.max(0, Math.min(100, (c.workW / 500) * 100))}%`,
                            }}
                            className={run.limiting.some((x) => x.id === c.id) ? "binding" : ""}
                          />
                          <i
                            style={{
                              left: `${Math.min(100, ((reference.ceilings.find((x) => x.id === c.id)?.workW ?? 0) / 500) * 100)}%`,
                            }}
                          />
                        </div>
                        <small>
                          {signed(c.deltaW)} W vs reference{" "}
                          {run.limiting.some((x) => x.id === c.id) ? "· LIMITING" : ""}
                        </small>
                      </div>
                    ))}
                    <p className="small-copy">
                      Marker = reference. Bar = recorded run. Scale 0–500 W; exact values appear
                      above.
                    </p>
                  </div>
                  <div className="causal-trace">
                    <h3>Calculation trace</h3>
                    {run.trace.map((t) => (
                      <details key={t.id} open={t.id === "balance" || t.id === "limiter"}>
                        <summary>
                          <span className={`system-dot ${t.system}`} />
                          {t.title}
                        </summary>
                        <p>{t.detail}</p>
                      </details>
                    ))}
                    <details>
                      <summary>Show every capacity equation</summary>
                      {run.ceilings.map((c) => (
                        <p className="equation" key={c.id}>
                          <strong>{c.label}</strong>
                          <br />
                          <code>
                            {c.equation} = {c.workW.toFixed(2)} W
                          </code>
                        </p>
                      ))}
                    </details>
                  </div>
                </div>
                <div className="thresholds">
                  <h3>Standard exertion thresholds</h3>
                  {[
                    ["Oxygen demand", run.exertion.oxygenRatio],
                    ["Heat removal", run.exertion.heatRatio],
                    ["Pressure-safe flow", run.exertion.pressureRatio],
                  ].map(([title, value]) => (
                    <div key={title}>
                      <span>{title}</span>
                      <strong>
                        {((value as number) * 100).toFixed(1)}% <small>/ 100%</small>
                      </strong>
                    </div>
                  ))}
                </div>
              </section>
            </details>
          </>
        )}
        {view === "history" && (
          <section className="history section-surface">
            <div className="section-heading">
              <div>
                <span className="section-kicker">EXPERIMENT HISTORY</span>
                <h2>Snapshots, not moving targets.</h2>
              </div>
              <div className="history-tools">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    download("human-v2-experiments.json", exportExperiments(experiments))
                  }
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => file.current?.click()}
                >
                  Import JSON
                </button>
                <input
                  type="file"
                  ref={file}
                  accept="application/json,.json"
                  hidden
                  aria-label="Import experiment JSON"
                  onChange={(e) => {
                    const picked = e.target.files?.[0];
                    if (picked) void importFile(picked);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            <p className="small-copy">
              Saved in this browser. Export a backup to move experiments between browsers. Invalid
              configurations can be saved for diagnosis.
            </p>
            {experiments.length === 0 ? (
              <div className="empty-state">
                <span className="empty-branch" aria-hidden="true">
                  ↗
                </span>
                <h3>Your next discovery starts with a fork.</h3>
                <p>
                  Modify the baseline, run a benchmark, and save the result. Your experiments will
                  appear here with their full context.
                </p>
                <button type="button" className="button" onClick={forkBaseline}>
                  Fork baseline →
                </button>
              </div>
            ) : (
              <div className="table-scroll">
                <table>
                  <caption>Saved experiments with reproducible versioned contexts</caption>
                  <thead>
                    <tr>
                      <th scope="col">Experiment</th>
                      <th scope="col">Score</th>
                      <th scope="col">Limit</th>
                      <th scope="col">Costs vs baseline</th>
                      <th scope="col">State</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...experiments].reverse().map((e) => {
                      const r = simulate(e.configuration, e.context);
                      return (
                        <tr key={e.id}>
                          <th scope="row">
                            <strong>{e.name}</strong>
                            <small>
                              {e.forkOf
                                ? `Fork of ${experiments.find((x) => x.id === e.forkOf)?.name ?? "imported ancestor"}`
                                : "Fork of baseline"}
                              <br />
                              {new Date(e.createdAt).toLocaleString()}
                              <br />
                              {e.context.modelVersion} · {e.context.environment.id}
                              <br />
                              {e.timeline
                                ? `${e.timeline.days} repeated days · ${e.timeline.scenarioId} · ${e.timeline.modelVersion}`
                                : "Legacy benchmark · no recorded daily scenario"}
                            </small>
                          </th>
                          <td>{r.score.toFixed(1)}</td>
                          <td>
                            {r.limiting
                              .map((x) => label(x.system))
                              .filter((x, i, a) => a.indexOf(x) === i)
                              .join(" + ")}
                          </td>
                          <td>
                            Mass {signed(r.massChangePercent)}%<br />
                            Rest {signed(r.restChangePercent)}%
                          </td>
                          <td>
                            <span className={`table-validity ${r.valid ? "valid" : "invalid"}`}>
                              {r.valid ? "Valid" : "Invalid"}
                            </span>
                          </td>
                          <td>
                            <div className="table-actions">
                              <button type="button" onClick={() => restore(e, true)}>
                                Fork
                              </button>
                              <button type="button" onClick={() => restore(e, false)}>
                                Restore
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setReferenceId(e.id);
                                  navigate("lab");
                                  setNotice(`Comparing your last benchmark against “${e.name}”.`);
                                }}
                              >
                                Compare
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
        {view === "leaderboard" && (
          <section className="leaderboard section-surface">
            <div className="section-heading">
              <div>
                <span className="section-kicker">CHALLENGE LEADERBOARD</span>
                <h2>Sustainable workload.</h2>
              </div>
              <button
                type="button"
                className="button secondary"
                disabled={loading}
                onClick={() => void refresh()}
              >
                {loading ? "Loading…" : "Refresh rankings"}
              </button>
            </div>
            <p>
              At most three changed parameters. Mass and resting energy within ±5%; standardized
              exertion stays within all model limits. Rank uses full-precision workload, then
              submission time and configuration digest to break ties.
            </p>
            <p className="small-copy">
              Local prototype leaderboard, persisted on this machine. Entry names are labels, not
              verified identities. Identical configurations share one entry.
            </p>
            {leaderboardError ? (
              <div role="alert" className="error-banner">
                {leaderboardError}{" "}
                <button type="button" onClick={() => void refresh()}>
                  Try again
                </button>
              </div>
            ) : loading ? (
              <p role="status">Loading verified entries…</p>
            ) : entries.length === 0 ? (
              <div className="empty-state">
                <span className="empty-branch" aria-hidden="true">
                  ↗
                </span>
                <h3>No submissions yet.</h3>
                <p>
                  Run a valid benchmark, name it, and submit from the workbench. No example entries
                  are ranked.
                </p>
                <button type="button" className="button" onClick={() => navigate("lab")}>
                  Return to workbench →
                </button>
              </div>
            ) : (
              <div className="table-scroll">
                <table>
                  <caption>Server-validated challenge entries</caption>
                  <thead>
                    <tr>
                      <th scope="col">Rank</th>
                      <th scope="col">Configuration</th>
                      <th scope="col">Score</th>
                      <th scope="col">Constraints</th>
                      <th scope="col">Reproduce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => {
                      const r = simulate(e.configuration, e.context);
                      return (
                        <tr key={e.id}>
                          <td className="rank">{String(i + 1).padStart(2, "0")}</td>
                          <th scope="row">
                            <strong>{e.name}</strong>
                            <small>
                              {e.digest.slice(0, 16)} · {e.context.modelVersion}
                            </small>
                            <small>
                              {PARAMETERS.filter((p) => e.configuration[p.id] !== 0)
                                .map((p) => `${p.label} ${signed(e.configuration[p.id], 0)}%`)
                                .join(" · ") || "Baseline"}
                            </small>
                          </th>
                          <td className="table-score">{e.score.toFixed(1)}</td>
                          <td>
                            Mass {signed(r.massChangePercent)}%<br />
                            Rest {signed(r.restChangePercent)}%<br />
                            {r.modifications} / 3 modifications
                          </td>
                          <td>
                            <button
                              type="button"
                              className="button secondary"
                              disabled={loading}
                              onClick={() => void replay(e)}
                            >
                              Reproduce & fork ↗
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
        {view === "notes" && (
          <div id="model-notes">
            <ModelNotes />
          </div>
        )}
        {view === "lab" && stale && (
          <div className="mobile-lab-actions">
            <span>Body & routine changed</span>
            <button type="button" className="button" disabled={running} onClick={() => benchmark()}>
              {running ? "Simulating…" : "Simulate changes →"}
            </button>
          </div>
        )}
        <footer>
          <span>
            <strong>Human V2</strong> · Upgrade your understanding.
          </span>
          <span>Educational simulation · no clinical predictions</span>
          <button type="button" onClick={() => navigate("notes")}>
            Model {CONTEXT.modelVersion} ↗
          </button>
        </footer>
      </main>
    </>
  );
}
