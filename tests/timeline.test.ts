import { describe, expect, it } from "vitest";
import { exportExperiments, importExperiments, newExperiment } from "../src/model/history";
import { BASE_CONFIGURATION, simulate } from "../src/model/simulator";
import {
  compareTimelines,
  explainTimeline,
  exportTimelineReplay,
  importTimelineReplay,
  parseTimelineSettings,
  removeOneReplays,
  scenarioSettings,
  simulateTimeline,
  TIMELINE_ASSUMPTIONS,
} from "../src/model/timeline";

const base = { ...BASE_CONFIGURATION };
describe("repeated-day heat/fluid model", () => {
  it("is deterministic, conserves heat, water and metabolic energy, and carries every phase state", () => {
    const settings = scenarioSettings("temperate", 7);
    const run = simulateTimeline(base, settings);
    expect(run).toEqual(simulateTimeline(base, settings));
    expect(run.status).toBe("completed");
    expect(run.phases).toHaveLength(21);
    expect(run.producedHeatJ - run.removedHeatJ).toBeCloseTo(run.final.excessHeatJ, 3);
    expect(run.sweatL - run.replacedL).toBeCloseTo(run.final.fluidDeficitL, 9);
    expect(run.metabolicJ - run.deliveredWorkJ).toBeCloseTo(run.producedHeatJ, 3);
    for (const [i, phase] of run.phases.entries()) {
      expect(phase.end.excessHeatJ - phase.start.excessHeatJ).toBeCloseTo(
        phase.producedHeatJ - phase.removedHeatJ,
        5,
      );
      expect(phase.end.fluidDeficitL - phase.start.fluidDeficitL).toBeCloseTo(
        phase.sweatL - phase.replacedL,
        10,
      );
      if (i) expect(phase.start).toEqual(run.phases[i - 1].end);
    }
    expect(run.points.every((x) => x.excessHeatJ >= -1e-7 && x.fluidDeficitL >= -1e-10)).toBe(true);
    for (const point of run.points) {
      expect(point.ratesWindowEndSeconds - point.ratesWindowStartSeconds).toBeLessThanOrEqual(
        60 + 1e-8,
      );
      expect([point.ratesWindowStartSeconds, point.ratesWindowEndSeconds]).toContain(
        point.elapsedSeconds,
      );
    }
  });
  it("preserves deficits between days and recovery replaces only actual lost fluid", () => {
    const limited = simulateTimeline(base, scenarioSettings("scarce-water", 30));
    expect(limited.boundary).not.toBeNull();
    expect(limited.elapsedSeconds).toBeGreaterThan(86400);
    const recovery = limited.phases.find((x) => x.phase === "recovery");
    expect(recovery).toBeDefined();
    expect(recovery?.end.fluidDeficitL).toBeLessThan(recovery?.start.fluidDeficitL ?? 0);
    expect(limited.phases.find((x) => x.day === 2)?.start).toEqual(recovery?.end);
    expect(explainTimeline(limited).join(" ")).toContain(
      "unreplaced sweat fluid reduced the assumed cooling factor",
    );
    expect(explainTimeline(limited).join(" ")).toContain("production 640.00 W minus dry");
    const hydrated = simulateTimeline(base, {
      ...scenarioSettings("scarce-water", 30),
      recoveryDrinkLPerHour: 0.25,
    });
    expect(hydrated.status).toBe("completed");
    expect(hydrated.final.fluidDeficitL).toBeCloseTo(0, 9);
    const idle = simulateTimeline(base, scenarioSettings("temperate", 1, 0));
    expect(idle.replacedL).toBe(0);
    expect(idle.final.fluidDeficitL).toBe(0);
  });
  it("shows utilized cooling reducing heat while requiring more water over the SAME interval", () => {
    const settings = scenarioSettings("hot-shift", 7);
    const baseline = simulateTimeline(base, settings);
    const cooled = simulateTimeline({ ...base, cooling: 20 }, settings);
    expect(baseline.boundary?.kind).toBe("heat");
    expect(cooled.status).toBe("completed");
    const matched = compareTimelines(cooled, baseline);
    expect(matched.sharedRun.elapsedSeconds).toBeCloseTo(matched.sharedReference.elapsedSeconds, 9);
    expect(matched.sharedRun.final.excessHeatJ).toBeLessThan(
      matched.sharedReference.final.excessHeatJ,
    );
    expect(matched.sharedRun.sweatL).toBeGreaterThan(matched.sharedReference.sweatL);
    expect(matched.firstDivergence?.detail).toContain("Heat production");
    const coolRest = simulateTimeline(
      { ...base, cooling: 20 },
      scenarioSettings("temperate", 1, 0),
    );
    expect(coolRest.sweatL).toBe(0); // Capacity does not force use.
  });
  it("does not force use of spare lung capacity; derives the resting heat cost without scripted harm", () => {
    const settings = scenarioSettings("temperate", 1);
    const baseline = simulateTimeline(base, settings);
    const lungs = simulateTimeline({ ...base, exchange: 20 }, settings);
    expect(lungs.deliveredWorkJ).toBe(baseline.deliveredWorkJ);
    expect(lungs.producedHeatJ - baseline.producedHeatJ).toBeCloseTo(2 * 86400, 4);
    expect(lungs.status).toBe("completed");
    expect(lungs).not.toHaveProperty("injury");
    expect(lungs).not.toHaveProperty("lifespan");
    expect(simulate(base).score).toBe(100);
    expect(simulate({ ...base, exchange: 20 }).score).toBeCloseTo(99.7777777778, 8);
  });
  it("caps delivery by oxygen/mechanical capacities and conserves work/heat with unmet demand", () => {
    const run = simulateTimeline({ ...base, exchange: -30 }, scenarioSettings("temperate", 1, 300));
    expect(run.deliveredWorkJ).toBeLessThan(run.requestedWorkJ);
    expect(run.points.find((x) => x.phase === "activity")?.limiting).toBe("Lung exchange");
    expect(run.metabolicJ - run.deliveredWorkJ).toBeCloseTo(run.producedHeatJ, 3);
  });
  it("stops exactly at its first model bound and converges as steps are reduced", () => {
    for (const scenario of ["hot-shift", "scarce-water"] as const) {
      const settings = scenarioSettings(scenario, 30);
      const a = simulateTimeline(base, settings, 60);
      const b = simulateTimeline(base, settings, 30);
      const c = simulateTimeline(base, settings, 15);
      expect(a.status).toBe("model-boundary");
      expect(a.elapsedSeconds).toBeLessThan(a.requestedSeconds);
      expect(Math.abs(a.elapsedSeconds - c.elapsedSeconds)).toBeLessThan(120);
      expect(Math.abs(b.elapsedSeconds - c.elapsedSeconds)).toBeLessThan(60);
      expect(Math.abs(a.peakHeatEquivalentC - c.peakHeatEquivalentC)).toBeLessThan(0.03);
      expect(Math.abs(a.final.fluidDeficitL - c.final.fluidDeficitL)).toBeLessThan(0.02);
      expect(a.peakHeatEquivalentC).toBeLessThanOrEqual(
        TIMELINE_ASSUMPTIONS.heatBoundaryEquivalentC + 1e-9,
      );
      expect(a.peakFluidDeficitPercent).toBeLessThanOrEqual(
        TIMELINE_ASSUMPTIONS.fluidBoundaryPercent + 1e-9,
      );
    }
  });
  it("rejects malformed settings, unsupported versions, unmatched comparisons and steps", () => {
    const s = scenarioSettings("temperate", 1);
    for (const change of [
      { days: 0 },
      { days: 91 },
      { days: 1.5 },
      { requestedWorkW: 301 },
      { activityDrinkLPerHour: NaN },
      { recoveryDrinkLPerHour: -1 },
      { modelVersion: "future" },
      { scenarioId: "unknown" },
      { extra: 1 },
    ])
      expect(() => parseTimelineSettings({ ...s, ...change })).toThrow();
    expect(() => simulateTimeline(base, s, 600)).toThrow();
    expect(() =>
      compareTimelines(
        simulateTimeline(base, s),
        simulateTimeline(base, scenarioSettings("hot-shift", 1)),
      ),
    ).toThrow();
  });
  it("replays each removed modification conditionally, without treating contributions as additive", () => {
    const c = { ...base, pumping: 20, cooling: 20, efficiency: 10 };
    const s = scenarioSettings("hot-shift", 1, 250);
    const replays = removeOneReplays(c, s);
    expect(replays.map((x) => x.parameter)).toEqual(["pumping", "efficiency", "cooling"]);
    expect(replays[0].result.configuration).toEqual({ ...c, pumping: 0 });
    const matched = compareTimelines(replays[0].result, simulateTimeline(c, s));
    expect(matched.sharedRun.deliveredWorkJ).toBeLessThan(matched.sharedReference.deliveredWorkJ);
  });
  it("exports/imports reproducible inputs and refuses tampered recorded outputs", () => {
    const s = scenarioSettings("temperate", 7);
    const text = exportTimelineReplay({ ...base, exchange: 20 }, s);
    expect(importTimelineReplay(text).run).toEqual(simulateTimeline({ ...base, exchange: 20 }, s));
    const tampered = JSON.parse(text);
    tampered.recorded.run.final.excessHeatJ = 1000000;
    expect(() => importTimelineReplay(JSON.stringify(tampered))).toThrow("do not reproduce");
    const different = JSON.parse(text);
    different.assumptions.stepSeconds = 30;
    expect(() => importTimelineReplay(JSON.stringify(different))).toThrow("assumptions");
  });
  it("roundtrips optional timeline metadata and preserves legacy experiments", () => {
    const old = newExperiment("Legacy", base, null);
    const updated = newExperiment(
      "Repeated days",
      base,
      old.id,
      scenarioSettings("scarce-water", 30),
    );
    const history = importExperiments(exportExperiments([old, updated]));
    expect(history).toEqual([old, updated]);
    expect(history[0]).not.toHaveProperty("timeline");
    const invalid = JSON.parse(exportExperiments([updated]));
    invalid.experiments[0].timeline.modelVersion = "unknown";
    expect(() => importExperiments(JSON.stringify(invalid))).toThrow(
      "Unsupported timeline version",
    );
  });
});
