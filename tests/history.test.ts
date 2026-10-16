import { expect, it } from "vitest";
import {
  exportExperiments,
  importExperiments,
  mergeExperiments,
  newExperiment,
  parseExperiments,
} from "../src/model/history";
import { BASE_CONFIGURATION } from "../src/model/simulator";

it("round-trips immutable context, baseline, and fork ancestry", () => {
  const first = newExperiment("First", { ...BASE_CONFIGURATION, pumping: 20 }, null);
  const fork = newExperiment("Fork", { ...first.configuration, cooling: 20 }, first.id);
  expect(importExperiments(exportExperiments([first, fork]))).toEqual([first, fork]);
  expect(mergeExperiments([first], [first, fork])).toHaveLength(2);
});
it("rejects incompatible or tampered baseline, versions, values, and metadata", () => {
  const e = newExperiment("First", { ...BASE_CONFIGURATION }, null);
  for (const bad of [
    { ...e, baseline: { ...e.baseline, massKg: 50 } },
    { ...e, context: { ...e.context, modelVersion: "old" } },
    { ...e, configuration: { ...e.configuration, pumping: 99 } },
    { ...e, createdAt: "invalid" },
    { ...e, id: "<script>" },
  ])
    expect(() => parseExperiments([bad])).toThrow();
  expect(() => importExperiments("not json")).toThrow();
  expect(() => parseExperiments([e, e])).toThrow();
  expect(() => mergeExperiments([e], [{ ...e, name: "Conflicting" }])).toThrow();
  expect(e.name).toBe("First");
});
