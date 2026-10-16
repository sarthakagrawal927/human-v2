import { describe, expect, it } from "vitest";
import { exportExperiments, importExperiments, newExperiment } from "../src/model/history";
import { playbackPhase, playbackState } from "../src/model/playback";
import { BASE_CONFIGURATION, simulate } from "../src/model/simulator";
import {
  compareTimelines,
  dailyPhases,
  editableRoutine,
  exportTimelineReplay,
  importTimelineReplay,
  parseTimelineSettings,
  sameTimelineSettings,
  scenarioSettings,
  simulateTimeline,
} from "../src/model/timeline";

const base = { ...BASE_CONFIGURATION };
describe("editable routine and recorded playback", () => {
  it("preserves legacy outputs and physics when converted to identical explicit phases", () => {
    for (const scenario of ["temperate", "hot-shift", "scarce-water"] as const) {
      const old = scenarioSettings(scenario, 7);
      const legacy = simulateTimeline(base, old);
      const editable = simulateTimeline(base, editableRoutine(old));
      for (const key of [
        "elapsedSeconds",
        "final",
        "phases",
        "producedHeatJ",
        "removedHeatJ",
        "sweatL",
        "replacedL",
        "deliveredWorkJ",
        "boundary",
      ] as const)
        expect(editable[key]).toEqual(legacy[key]);
      expect(simulateTimeline(base, old)).toEqual(legacy);
      expect(sameTimelineSettings(old, editable.settings)).toBe(false);
    }
  });
  it("propagates joint changes in climate, workload, cooling and replacement through carried state", () => {
    const source = scenarioSettings("temperate", 7);
    const phases = dailyPhases(source);
    phases[1] = {
      ...phases[1],
      temperatureC: 30,
      humidityPercent: 60,
      requestedWorkW: 220,
      drinkLPerHour: 0.1,
    };
    const conditions = editableRoutine(source, phases);
    const body = {
      ...base,
      pumping: 20,
      exchange: 20,
      transport: 10,
      power: 5,
      efficiency: 10,
      cooling: 20,
    };
    expect(simulate(body).valid).toBe(false); // Sandbox accepts six traits; challenge does not.
    const run = simulateTimeline(body, conditions);
    expect(run).toEqual(simulateTimeline(body, conditions));
    expect(run.producedHeatJ - run.removedHeatJ).toBeCloseTo(run.final.excessHeatJ, 3);
    expect(run.sweatL - run.replacedL).toBeCloseTo(run.final.fluidDeficitL, 9);
    expect(run.metabolicJ - run.deliveredWorkJ).toBeCloseTo(run.producedHeatJ, 3);
    for (let i = 1; i < run.phases.length; i++)
      expect(run.phases[i].start).toEqual(run.phases[i - 1].end);
    const adequate = editableRoutine(
      source,
      phases.map((p) => ({ ...p, drinkLPerHour: 1.5 })),
    );
    expect(simulateTimeline(body, adequate).final.fluidDeficitL).toBeLessThan(
      run.final.fluidDeficitL,
    );
    const coolAir = editableRoutine(
      source,
      phases.map((p) => ({ ...p, temperatureC: 22, humidityPercent: 40 })),
    );
    expect(simulateTimeline(body, coolAir).elapsedSeconds).toBeGreaterThan(run.elapsedSeconds);
    const tight = simulateTimeline(body, conditions, 15);
    expect(Math.abs(run.elapsedSeconds - tight.elapsedSeconds)).toBeLessThan(120);
    expect(Math.abs(run.final.fluidDeficitL - tight.final.fluidDeficitL)).toBeLessThan(0.02);
  });
  it("rejects malformed or ambiguous phase configurations instead of reinterpreting them", () => {
    const settings = editableRoutine(scenarioSettings("temperate", 1));
    const phases = settings.phases ?? [];
    for (const patch of [
      { hours: 0 },
      { hours: 8.1 },
      { temperatureC: NaN },
      { temperatureC: 41 },
      { humidityPercent: 0 },
      { drinkLPerHour: Infinity },
      { kind: "flight" },
      { requestedWorkW: 1 },
      { id: phases[1].id },
      { extra: 0 },
    ]) {
      expect(() =>
        parseTimelineSettings({
          ...settings,
          phases: [{ ...phases[0], ...patch }, ...phases.slice(1)],
        }),
      ).toThrow();
    }
    expect(() => parseTimelineSettings({ ...settings, requestedWorkW: 99 })).toThrow("summary");
    expect(() => parseTimelineSettings({ ...settings, phases: phases.slice(0, 2) })).toThrow(
      "24 hours",
    );
    expect(() =>
      parseTimelineSettings({ ...settings, scenarioVersion: "repeated-day-1.0.0" }),
    ).toThrow();
    expect(() =>
      parseTimelineSettings({ ...settings, scenarioVersion: "editable-day-3.0.0" }),
    ).toThrow();
  });
  it("persists full editable phases and independently verifies replay outputs", () => {
    const settings = editableRoutine(scenarioSettings("hot-shift", 7));
    const configuration = { ...base, cooling: 20 };
    const experiment = newExperiment("Custom day", configuration, null, settings);
    expect(importExperiments(exportExperiments([experiment]))).toEqual([experiment]);
    const text = exportTimelineReplay(configuration, settings);
    expect(importTimelineReplay(text).run).toEqual(simulateTimeline(configuration, settings));
    const tampered = JSON.parse(text);
    tampered.settings.phases[1].temperatureC = 35;
    expect(() => importTimelineReplay(JSON.stringify(tampered))).toThrow("do not reproduce");
    const run = simulateTimeline(configuration, settings),
      reference = simulateTimeline(base, settings);
    const matched = compareTimelines(run, reference);
    expect(matched.sharedRun.elapsedSeconds).toBe(matched.sharedReference.elapsedSeconds);
  });
  it("interpolates only recorded state, resolves exact phase boundaries, and never extrapolates", () => {
    const settings = editableRoutine(scenarioSettings("hot-shift", 1));
    const run = simulateTimeline(base, settings);
    const a = playbackState(run, 8 * 3600),
      b = playbackState(run, 8 * 3600 + 900);
    expect(a?.phase).toBe("activity");
    expect(playbackPhase(settings, 8 * 3600).kind).toBe("activity");
    const mid = playbackState(run, 8 * 3600 + 450);
    expect(mid?.heatEquivalentC).toBeCloseTo(
      ((a?.heatEquivalentC ?? 0) + (b?.heatEquivalentC ?? 0)) / 2,
      10,
    );
    expect(mid?.interpolated).toBe(true);
    expect(mid?.deliveredWorkW).toBe(a?.deliveredWorkW);
    expect(playbackState(run, run.elapsedSeconds)?.excessHeatJ).toBe(run.final.excessHeatJ);
    for (const t of [-1, NaN, Infinity, run.elapsedSeconds + 1])
      expect(playbackState(run, t)).toBeNull();
    const complete = simulateTimeline({ ...base, cooling: 20 }, settings);
    expect(playbackPhase(settings, complete.elapsedSeconds).kind).toBe("recovery");
    expect(playbackState(complete, complete.elapsedSeconds)?.phase).toBe("recovery");
    expect(playbackState(run, complete.elapsedSeconds)).toBeNull();
  });
});
