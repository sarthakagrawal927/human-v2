import type { Configuration } from "./simulator";
import {
  BASELINE,
  CONTEXT,
  canonicalConfiguration,
  exactKeys,
  InputError,
  objectInput,
  parseConfiguration,
  parseContext,
} from "./simulator";
import { parseTimelineSettings, type TimelineSettings } from "./timeline";

export const HISTORY_KEY = "human-v2.experiments.v1";
export interface Experiment {
  id: string;
  name: string;
  createdAt: string;
  forkOf: string | null;
  configuration: Configuration;
  context: typeof CONTEXT;
  baseline: typeof BASELINE;
  timeline?: TimelineSettings;
}
export function newExperiment(
  name: string,
  configuration: Configuration,
  forkOf: string | null,
  timeline?: TimelineSettings,
): Experiment {
  return {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 80) || "Untitled experiment",
    createdAt: new Date().toISOString(),
    forkOf,
    configuration: parseConfiguration(configuration),
    context: CONTEXT,
    baseline: BASELINE,
    ...(timeline ? { timeline: parseTimelineSettings(timeline) } : {}),
  };
}
export function parseExperiments(value: unknown): Experiment[] {
  if (!Array.isArray(value) || value.length > 200)
    throw new InputError("Import must contain at most 200 experiments.");
  const ids = new Set<string>();
  return value.map((item) => {
    const e = objectInput(item);
    exactKeys(e, [
      "id",
      "name",
      "createdAt",
      "forkOf",
      "configuration",
      "context",
      "baseline",
      ...(Object.hasOwn(e, "timeline") ? ["timeline"] : []),
    ]);
    if (typeof e.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(e.id) || ids.has(e.id))
      throw new InputError("Experiments need unique valid identifiers.");
    ids.add(e.id);
    if (
      typeof e.name !== "string" ||
      !e.name.trim() ||
      e.name.length > 80 ||
      typeof e.createdAt !== "string" ||
      !Number.isFinite(Date.parse(e.createdAt)) ||
      (e.forkOf !== null &&
        (typeof e.forkOf !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(e.forkOf)))
    )
      throw new InputError("Invalid experiment metadata.");
    const baseline = objectInput(e.baseline);
    exactKeys(baseline, Object.keys(BASELINE));
    if (Object.keys(BASELINE).some((k) => baseline[k] !== BASELINE[k as keyof typeof BASELINE]))
      throw new InputError("The recorded baseline differs from this simulator.");
    return {
      id: e.id,
      name: e.name,
      createdAt: e.createdAt,
      forkOf: e.forkOf as string | null,
      configuration: parseConfiguration(e.configuration),
      context: parseContext(e.context),
      baseline: BASELINE,
      ...(Object.hasOwn(e, "timeline") ? { timeline: parseTimelineSettings(e.timeline) } : {}),
    };
  });
}
export function exportExperiments(experiments: Experiment[]) {
  return JSON.stringify(
    { format: "human-v2-history-1", experiments: parseExperiments(experiments) },
    null,
    2,
  );
}
export function importExperiments(text: string) {
  if (text.length > 1000000) throw new InputError("Import is too large (maximum 1 MB).");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new InputError("Choose a valid Human V2 JSON export.");
  }
  const v = objectInput(raw);
  exactKeys(v, ["format", "experiments"]);
  if (v.format !== "human-v2-history-1") throw new InputError("Unsupported history format.");
  return parseExperiments(v.experiments);
}
export function mergeExperiments(existing: Experiment[], incoming: Experiment[]) {
  const entries = new Map(existing.map((x) => [x.id, x]));
  for (const e of incoming) {
    const prior = entries.get(e.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(e))
      throw new InputError(
        "Import has a conflicting experiment identifier. Existing history is unchanged.",
      );
    entries.set(e.id, e);
  }
  return parseExperiments([...entries.values()]);
}
export function sameConfiguration(a: Configuration, b: Configuration) {
  return canonicalConfiguration(a) === canonicalConfiguration(b);
}
