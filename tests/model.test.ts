import { describe, expect, it } from "vitest";
import {
  applyPreset,
  BASE_CONFIGURATION,
  BASE_RESULT,
  CONTEXT,
  canonicalConfiguration,
  countModifications,
  PARAMETERS,
  parseConfiguration,
  parseContext,
  simulate,
} from "../src/model/simulator";

describe("deterministic coupled physiology", () => {
  it("normalizes the pinned baseline and balances metabolic energy", () => {
    expect(BASE_RESULT.score).toBe(100);
    expect(BASE_RESULT.workloadW).toBe(225);
    expect(BASE_RESULT.limiting[0].system).toBe("heart");
    expect(BASE_RESULT.heatW + BASE_RESULT.workloadW).toBe(BASE_RESULT.metabolicW);
  });
  it("exposes a shifting bottleneck through reproducible iteration", () => {
    const heart = simulate({ ...BASE_CONFIGURATION, pumping: 20 });
    const cooled = simulate({ ...heart.configuration, cooling: 20 });
    const efficient = simulate({ ...cooled.configuration, efficiency: 10 });
    expect([BASE_RESULT, heart, cooled, efficient].map((x) => x.limiting[0].system)).toEqual([
      "heart",
      "cooling",
      "heart",
      "muscles",
    ]);
    expect(heart.score).toBeCloseTo(103.4074074);
    expect(cooled.score).toBeCloseTo(121.8888889);
    expect(efficient.score).toBeCloseTo(133.3333333);
    expect([heart, cooled, efficient].every((x) => x.valid)).toBe(true);
    expect(efficient.restingW).toBe(104);
    expect(efficient.rest.economyScore).toBeLessThan(100);
    expect(simulate(efficient.configuration)).toEqual(efficient);
  });
  it("propagates resource costs even for a non-limiting upgrade", () => {
    const biggerLungs = simulate({ ...BASE_CONFIGURATION, exchange: 20 });
    expect(biggerLungs.score).toBeLessThan(100);
    expect(biggerLungs.limiting[0].system).toBe("heart");
    expect(biggerLungs.massKg).toBeGreaterThan(70);
    expect(biggerLungs.trace.find((x) => x.id === "exchange")?.detail).toContain(
      "resting energy 2.00 W",
    );
  });
  it("rejects a high-score budget violation rather than rewarding it", () => {
    const run = simulate({ ...BASE_CONFIGURATION, pumping: 50, cooling: 50, efficiency: 20 });
    expect(run.score).toBeGreaterThan(100);
    expect(run.valid).toBe(false);
    expect(run.violations.map((x) => x.id)).toContain("rest");
    const overCount = simulate({
      ...BASE_CONFIGURATION,
      pumping: 5,
      exchange: 5,
      cooling: 5,
      efficiency: 5,
    });
    expect(overCount.violations.map((x) => x.id)).toContain("modifications");
  });
  it("enforces both sides of the 5% budget and exertion physiological thresholds", () => {
    const reduced = simulate({ ...BASE_CONFIGURATION, power: -30, pumping: -30, cooling: -30 });
    expect(reduced.violations.map((x) => x.id)).toContain("rest");
    expect(
      simulate({ ...BASE_CONFIGURATION, transport: -30 }).violations.map((x) => x.id),
    ).toContain("pressure");
    expect(simulate({ ...BASE_CONFIGURATION, cooling: -30 }).violations.map((x) => x.id)).toContain(
      "heat",
    );
  });
  it("counts net changes, not clicks, and presets overwrite explicit values", () => {
    const c = applyPreset(applyPreset({ ...BASE_CONFIGURATION }, "endurance"), "endurance");
    expect(countModifications(c)).toBe(1);
    expect(countModifications({ ...c, pumping: 0 })).toBe(0);
  });
  it("canonicalizes order and negative zero and rejects unexpected data", () => {
    expect(canonicalConfiguration({ ...BASE_CONFIGURATION, pumping: -0 })).toBe(
      canonicalConfiguration({ ...BASE_CONFIGURATION }),
    );
    for (const bad of [
      null,
      [],
      { ...BASE_CONFIGURATION, pumping: NaN },
      { ...BASE_CONFIGURATION, pumping: Infinity },
      { ...BASE_CONFIGURATION, pumping: 21 },
      { ...BASE_CONFIGURATION, score: 999 },
      { ...BASE_CONFIGURATION, efficiency: 25 },
    ])
      expect(() => parseConfiguration(bad)).toThrow();
    expect(() =>
      simulate(
        { ...BASE_CONFIGURATION },
        parseContext({ ...CONTEXT, environment: { ...CONTEXT.environment, temperatureC: 30 } }),
      ),
    ).toThrow();
  });
  it("obeys all energy and capacity inequalities across bounded configuration samples", () => {
    for (let i = 0; i < 300; i++) {
      const c = { ...BASE_CONFIGURATION };
      PARAMETERS.forEach((p, j) => {
        const steps = (p.max - p.min) / 5 + 1;
        c[p.id] = p.min + ((i * (j + 3) + j * 7) % steps) * 5;
      });
      const r = simulate(c);
      expect(Number.isFinite(r.score)).toBe(true);
      expect(r.workloadW).toBeGreaterThanOrEqual(0);
      for (const ceiling of r.ceilings)
        expect(r.workloadW).toBeLessThanOrEqual(ceiling.workW + 1e-8);
      expect(r.heatW).toBeLessThanOrEqual(r.coolingW + 1e-8);
      expect(r.heatW + r.workloadW).toBeCloseTo(r.metabolicW, 8);
      expect(simulate(c)).toEqual(r);
    }
  });
});
