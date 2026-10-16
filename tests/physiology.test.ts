import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BASE_BODY,
  BODY_CONTROLS,
  comparisonTrace,
  PHYSIOLOGY_VERSION,
  type PhysiologyComparison,
  parsePhysiology,
} from "../src/model/physiology";

const record = JSON.parse(
  readFileSync("artifacts/research/pulse/combined-integrated.json", "utf8"),
) as PhysiologyComparison;

describe("native physiology contract", () => {
  it("accepts simultaneous mechanisms while rejecting unknown fields, missing fields, NaN and unsupported steps", () => {
    expect(parsePhysiology(record.configuration)).toEqual(record.configuration);
    for (const bad of [
      null,
      [],
      {},
      { ...BASE_BODY, cooling: 20 },
      { ...BASE_BODY, surface: NaN },
      { ...BASE_BODY, surface: 21 },
      { ...BASE_BODY, exercise: 1 },
      { ...BASE_BODY, pressure: 0 },
    ])
      expect(() => parsePhysiology(bad)).toThrow();
    for (const control of BODY_CONTROLS) {
      expect(() => parsePhysiology({ ...BASE_BODY, [control.id]: control.min - 5 })).toThrow();
      expect(() => parsePhysiology({ ...BASE_BODY, [control.id]: control.max + 5 })).toThrow();
    }
  });
  it("preserves matched conditions, engine version and dense means from recorded samples", () => {
    expect(record.version).toBe(PHYSIOLOGY_VERSION);
    expect(record.baseline.configuration.exercise).toBe(record.configuration.exercise);
    expect(record.baseline.configuration.pressure).toBe(record.configuration.pressure);
    expect(BODY_CONTROLS.every((p) => record.baseline.configuration[p.id] === 0)).toBe(true);
    for (const run of [record.baseline, record.modified]) {
      expect(run.rows).toHaveLength(19);
      expect(run.dense_rows).toHaveLength(1500);
      expect(run.git_hash).toBe("5e29e5b");
      for (const [i, key] of Object.keys(run.property_units).entries()) {
        const mean = run.dense_rows.reduce((sum, row) => sum + row[i + 1], 0) / 1500;
        expect(mean).toBeCloseTo(run.trailing_30s_mean[key], 9);
      }
      expect(run.events.every((e) => ["Hypoxia", "RespiratoryAlkalosis"].includes(e.event))).toBe(
        true,
      );
      expect(run.events.every((e) => e.sample_elapsed_s >= e.elapsed_s)).toBe(true);
    }
  });
  it("reports the actual coupled oxygen change and retained heart constraint without assigning injury or longevity", () => {
    const trace = comparisonTrace(record).join(" ");
    expect(trace).toContain("90.60 % → 92.12 %");
    expect(trace).toContain("Heart-rate ceiling remains");
    expect(trace).toContain("Added tissue mass and chest-space competition are not modeled");
    expect(trace).toContain("does not isolate a single edit");
    expect(trace).not.toMatch(/will die|years longer|healthy score|brain damage/i);
  });
});
