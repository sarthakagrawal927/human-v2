import { describe, expect, it } from "vitest";
import { ANNUAL_SOURCE, annualReplay, simulateAnnual } from "../src/model/annual";
import { BASE_CONFIGURATION } from "../src/model/simulator";

describe("published annual population reference", () => {
  it("preserves the published table and reproduces conditional survival", () => {
    expect(ANNUAL_SOURCE.rows).toHaveLength(100);
    const run = simulateAnnual(20, 65);
    expect(run).toEqual(simulateAnnual(20, 65));
    expect(run.points[0].survival).toBe(1);
    // NCHS report example: 42,699 / 98,901 ≈ 43.2% from age20 to85.
    expect(run.points.at(-1)?.survival).toBeCloseTo(0.431725, 4);
    for (const point of run.points) {
      const expected = ANNUAL_SOURCE.rows[point.age].survivors / ANNUAL_SOURCE.rows[20].survivors;
      expect(Math.abs(point.survival - expected)).toBeLessThan(0.000002);
      expect(point.nextYearDeathProbability).toBe(ANNUAL_SOURCE.rows[point.age].deathProbability);
    }
    expect(JSON.parse(annualReplay(run)).sourceSha256).toBe(ANNUAL_SOURCE.sourceSha256);
  });
  it("never invents modification-specific mortality or organ outcomes", () => {
    for (const id of Object.keys(BASE_CONFIGURATION)) {
      const run = simulateAnnual(20, 60, { ...BASE_CONFIGURATION, [id]: 20 });
      expect(run.status).toBe("unsupported-modification");
      expect(run.points).toEqual([]);
    }
  });
  it("excludes the open-ended age100+ interval and forbids extrapolation", () => {
    const run = simulateAnnual(90, 10);
    expect(run.points.at(-1)).toMatchObject({ age: 100, nextYearDeathProbability: null });
    expect(() => simulateAnnual(90, 11)).toThrow();
    expect(() => simulateAnnual(19, 10)).toThrow();
    expect(() => simulateAnnual(20, 1.5)).toThrow();
    expect(() => simulateAnnual(20, 0)).toThrow();
    expect(() => simulateAnnual(Number.NaN, 10)).toThrow();
  });
});
