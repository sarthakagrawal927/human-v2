import type { Configuration, ParameterId } from "./simulator";
import {
  BASE_CONFIGURATION,
  CONTEXT,
  exactKeys,
  InputError,
  objectInput,
  PARAMETERS,
  parseConfiguration,
  parseContext,
  simulate,
} from "./simulator";

export const TIMELINE_VERSION = "heat-fluid-1.0.0";
export const SCENARIO_VERSION = "repeated-day-1.0.0";
// Physical accounting with explicitly assumed person/environment response curves.
// No calibrated predictive horizon, injury, core temperature or aging is claimed.
export const TIMELINE_ASSUMPTIONS = Object.freeze({
  heatCapacityJPerKgC: 2980,
  latentHeatJPerL: 2430000,
  referenceSkinC: 35,
  dryTransferWPerC: 160 / 13,
  referenceDryW: 160,
  recoverySeconds: 1800,
  fluidCoolingOnsetPercent: 1,
  fluidBoundaryPercent: 4,
  heatBoundaryEquivalentC: 2,
  stepSeconds: 60,
});
export const TIMELINE_SOURCES = [
  {
    title: "Partitional calorimetry, 2019",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6397408/",
    scope:
      "Heat storage is production minus heat loss. This does not validate our response curves.",
  },
  {
    title: "Calculated body specific heat, 2022",
    url: "https://doi.org/10.1080/23328940.2022.2088034",
    scope:
      "Tissue-weighted calculation suggests 2.98 kJ/kg/°C; not a measured value for this person.",
  },
  {
    title: "NIOSH heat criteria, 2016",
    url: "https://www.cdc.gov/niosh/docs/2016-106/",
    scope:
      "Heat exchange, evaporation, hydration and work/rest matter. Our limits are not its clinical or occupational guidance.",
  },
] as const;
export const SCENARIOS = [
  {
    id: "temperate",
    name: "Temperate routine",
    temperatureC: 22,
    humidityPercent: 40,
    activityDrinkLPerHour: 0.5,
    recoveryDrinkLPerHour: 0.25,
    description: "Four hours of activity, then a cool recovery with fluid replacement.",
  },
  {
    id: "hot-shift",
    name: "Hot shift",
    temperatureC: 30,
    humidityPercent: 50,
    activityDrinkLPerHour: 1.1,
    recoveryDrinkLPerHour: 0.25,
    description:
      "The same task in warmer, more humid air. Drinking cannot fix a heat-removal limit.",
  },
  {
    id: "scarce-water",
    name: "Scarce water",
    temperatureC: 22,
    humidityPercent: 40,
    activityDrinkLPerHour: 0.5,
    recoveryDrinkLPerHour: 0.02,
    description: "The same temperate task with incomplete fluid replacement between days.",
  },
] as const;
export type ScenarioId = (typeof SCENARIOS)[number]["id"];
export const EDITABLE_SCENARIO_VERSION = "editable-day-2.0.0";
export interface DailyPhase {
  id: string;
  kind: "rest" | "activity" | "recovery";
  hours: number;
  temperatureC: number;
  humidityPercent: number;
  requestedWorkW: number;
  drinkLPerHour: number;
}
export interface TimelineSettings {
  modelVersion: typeof TIMELINE_VERSION;
  scenarioVersion: typeof SCENARIO_VERSION | typeof EDITABLE_SCENARIO_VERSION;
  scenarioId: ScenarioId;
  days: number;
  requestedWorkW: number;
  activityDrinkLPerHour: number;
  recoveryDrinkLPerHour: number;
  phases?: DailyPhase[];
}
export function dailyPhases(s: TimelineSettings): DailyPhase[] {
  if (s.phases) return s.phases.map((p) => ({ ...p }));
  const environment = SCENARIOS.find((p) => p.id === s.scenarioId);
  if (!environment) throw new InputError("Unknown scenario.");
  return [
    {
      id: "rest",
      kind: "rest",
      hours: 8,
      temperatureC: 22,
      humidityPercent: 40,
      requestedWorkW: 0,
      drinkLPerHour: s.recoveryDrinkLPerHour,
    },
    {
      id: "activity",
      kind: "activity",
      hours: 4,
      temperatureC: environment.temperatureC,
      humidityPercent: environment.humidityPercent,
      requestedWorkW: s.requestedWorkW,
      drinkLPerHour: s.activityDrinkLPerHour,
    },
    {
      id: "recovery",
      kind: "recovery",
      hours: 12,
      temperatureC: 22,
      humidityPercent: 40,
      requestedWorkW: 0,
      drinkLPerHour: s.recoveryDrinkLPerHour,
    },
  ];
}
export function editableRoutine(s: TimelineSettings, phases = dailyPhases(s)): TimelineSettings {
  const activity = phases.find((p) => p.kind === "activity");
  const recovery = phases.find((p) => p.kind === "recovery" || p.kind === "rest");
  return parseTimelineSettings({
    ...s,
    scenarioVersion: EDITABLE_SCENARIO_VERSION,
    requestedWorkW: activity?.requestedWorkW ?? 0,
    activityDrinkLPerHour: activity?.drinkLPerHour ?? 0,
    recoveryDrinkLPerHour: recovery?.drinkLPerHour ?? 0,
    phases,
  });
}
export function scenarioSettings(
  id: ScenarioId,
  days = 30,
  requestedWorkW = 180,
): TimelineSettings {
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new InputError("Unknown repeated-day scenario.");
  return {
    modelVersion: TIMELINE_VERSION,
    scenarioVersion: SCENARIO_VERSION,
    scenarioId: id,
    days,
    requestedWorkW,
    activityDrinkLPerHour: scenario.activityDrinkLPerHour,
    recoveryDrinkLPerHour: scenario.recoveryDrinkLPerHour,
  };
}
export const DEFAULT_TIMELINE = Object.freeze(scenarioSettings("temperate"));
export function parseTimelineSettings(value: unknown): TimelineSettings {
  const v = objectInput(value);
  const editable = v.scenarioVersion === EDITABLE_SCENARIO_VERSION;
  exactKeys(v, [...Object.keys(DEFAULT_TIMELINE), ...(editable ? ["phases"] : [])]);
  if (v.modelVersion !== TIMELINE_VERSION || (!editable && v.scenarioVersion !== SCENARIO_VERSION))
    throw new InputError("Unsupported timeline version; it cannot be silently reinterpreted.");
  if (!SCENARIOS.some((s) => s.id === v.scenarioId)) throw new InputError("Unknown scenario.");
  if (typeof v.days !== "number" || !Number.isInteger(v.days) || v.days < 1 || v.days > 90)
    throw new InputError("Repeated days must be an integer from 1 to 90.");
  if (
    typeof v.requestedWorkW !== "number" ||
    !Number.isInteger(v.requestedWorkW) ||
    v.requestedWorkW < 0 ||
    v.requestedWorkW > 300
  )
    throw new InputError("Requested work must be an integer from 0 to 300 W.");
  for (const key of ["activityDrinkLPerHour", "recoveryDrinkLPerHour"] as const) {
    if (typeof v[key] !== "number" || !Number.isFinite(v[key]) || v[key] < 0 || v[key] > 1.5)
      throw new InputError("Fluid replacement must be between 0 and 1.5 L/h.");
  }
  let phases: DailyPhase[] | undefined;
  if (editable) {
    if (!Array.isArray(v.phases) || v.phases.length < 2 || v.phases.length > 8)
      throw new InputError("A routine needs 2–8 phases.");
    const ids = new Set<string>();
    phases = v.phases.map((raw) => {
      const p = objectInput(raw);
      exactKeys(p, [
        "id",
        "kind",
        "hours",
        "temperatureC",
        "humidityPercent",
        "requestedWorkW",
        "drinkLPerHour",
      ]);
      if (typeof p.id !== "string" || !/^[a-zA-Z0-9-]{1,40}$/.test(p.id) || ids.has(p.id))
        throw new InputError("Phase ids must be unique short identifiers.");
      ids.add(p.id);
      if (!["rest", "activity", "recovery"].includes(p.kind as string))
        throw new InputError("Unknown phase kind.");
      const ranges = {
        hours: [0.25, 23.75],
        temperatureC: [10, 40],
        humidityPercent: [10, 90],
        requestedWorkW: [0, 300],
        drinkLPerHour: [0, 1.5],
      };
      for (const [key, [min, max]] of Object.entries(ranges)) {
        const value = p[key];
        if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
          throw new InputError(`Phase ${key} must be between ${min} and ${max}.`);
      }
      if (!Number.isInteger((p.hours as number) * 4) || !Number.isInteger(p.requestedWorkW))
        throw new InputError("Phase duration uses quarter hours and work uses whole watts.");
      if (p.kind !== "activity" && p.requestedWorkW !== 0)
        throw new InputError("Rest and recovery cannot request work.");
      return {
        id: p.id,
        kind: p.kind,
        hours: p.hours,
        temperatureC: p.temperatureC,
        humidityPercent: p.humidityPercent,
        requestedWorkW: p.requestedWorkW,
        drinkLPerHour: p.drinkLPerHour,
      } as DailyPhase;
    });
    if (phases.reduce((sum, p) => sum + p.hours, 0) !== 24)
      throw new InputError("Daily phases must total exactly 24 hours.");
    const activity = phases.find((p) => p.kind === "activity");
    const recovery = phases.find((p) => p.kind === "recovery" || p.kind === "rest");
    if (
      v.requestedWorkW !== (activity?.requestedWorkW ?? 0) ||
      v.activityDrinkLPerHour !== (activity?.drinkLPerHour ?? 0) ||
      v.recoveryDrinkLPerHour !== (recovery?.drinkLPerHour ?? 0)
    )
      throw new InputError("Routine summary does not match its phases.");
  }
  return {
    modelVersion: TIMELINE_VERSION,
    scenarioVersion: editable ? EDITABLE_SCENARIO_VERSION : SCENARIO_VERSION,
    scenarioId: v.scenarioId as ScenarioId,
    days: v.days,
    requestedWorkW: v.requestedWorkW,
    activityDrinkLPerHour: v.activityDrinkLPerHour as number,
    recoveryDrinkLPerHour: v.recoveryDrinkLPerHour as number,
    ...(phases ? { phases } : {}),
  };
}
export function sameTimelineSettings(a: TimelineSettings, b: TimelineSettings) {
  const x = parseTimelineSettings(a);
  const y = parseTimelineSettings(b);
  return JSON.stringify(x) === JSON.stringify(y);
}
export type PhaseId = "rest" | "activity" | "recovery";
export interface PersonState {
  excessHeatJ: number;
  fluidDeficitL: number;
}
export interface TimelinePoint extends PersonState {
  elapsedSeconds: number;
  ratesWindowStartSeconds: number;
  ratesWindowEndSeconds: number;
  day: number;
  phase: PhaseId;
  heatEquivalentC: number;
  fluidDeficitPercent: number;
  producedHeatW: number;
  dryLossW: number;
  evaporativeLossW: number;
  evaporationFraction: number;
  hydrationFactor: number;
  deliveredWorkW: number;
  limiting: string;
}
export interface PhaseRecord {
  day: number;
  phase: PhaseId;
  startSeconds: number;
  endSeconds: number;
  start: PersonState;
  end: PersonState;
  producedHeatJ: number;
  removedHeatJ: number;
  sweatL: number;
  replacedL: number;
  deliveredWorkJ: number;
}
export interface TimelineResult {
  settings: TimelineSettings;
  configuration: Configuration;
  context: typeof CONTEXT;
  massKg: number;
  heatCapacityJPerC: number;
  requestedSeconds: number;
  elapsedSeconds: number;
  status: "completed" | "model-boundary";
  boundary: { kind: "heat" | "fluid"; elapsedSeconds: number; message: string } | null;
  points: TimelinePoint[];
  phases: PhaseRecord[];
  final: PersonState;
  peakHeatEquivalentC: number;
  peakFluidDeficitPercent: number;
  producedHeatJ: number;
  removedHeatJ: number;
  sweatL: number;
  replacedL: number;
  metabolicJ: number;
  requestedWorkJ: number;
  deliveredWorkJ: number;
  oxygenLimiter: string;
}

export function simulateTimeline(
  configuration: Configuration,
  settings: TimelineSettings = DEFAULT_TIMELINE,
  stepSeconds: number = TIMELINE_ASSUMPTIONS.stepSeconds,
): TimelineResult {
  return integrateTimeline(configuration, settings, stepSeconds, Number.POSITIVE_INFINITY);
}
function integrateTimeline(
  configuration: Configuration,
  settings: TimelineSettings,
  stepSeconds: number,
  maxSeconds: number,
): TimelineResult {
  const c = parseConfiguration(configuration);
  const s = parseTimelineSettings(settings);
  if (![15, 30, 60].includes(stepSeconds))
    throw new InputError("Supported time steps are 15, 30 and 60 seconds.");
  const person = simulate(c);
  const scenario = SCENARIOS.find((x) => x.id === s.scenarioId);
  if (!scenario) throw new InputError("Unknown scenario.");
  const a = TIMELINE_ASSUMPTIONS;
  const heatCapacityJPerC = person.massKg * a.heatCapacityJPerKgC;
  const heatBoundJ = heatCapacityJPerC * a.heatBoundaryEquivalentC;
  const fluidBoundL = (person.massKg * a.fluidBoundaryPercent) / 100;
  const capacities = person.ceilings.filter((x) => x.id !== "cooling");
  const workCapW = Math.max(0, Math.min(...capacities.map((x) => x.workW)));
  const oxygenLimiter = capacities
    .filter((x) => Math.abs(x.workW - workCapW) < 1e-8)
    .map((x) => x.label)
    .join(" + ");
  const result: TimelineResult = {
    settings: s,
    configuration: c,
    context: CONTEXT,
    massKg: person.massKg,
    heatCapacityJPerC,
    requestedSeconds: s.days * 86400,
    elapsedSeconds: 0,
    status: "completed",
    boundary: null,
    points: [],
    phases: [],
    final: { excessHeatJ: 0, fluidDeficitL: 0 },
    peakHeatEquivalentC: 0,
    peakFluidDeficitPercent: 0,
    producedHeatJ: 0,
    removedHeatJ: 0,
    sweatL: 0,
    replacedL: 0,
    metabolicJ: 0,
    requestedWorkJ: 0,
    deliveredWorkJ: 0,
    oxygenLimiter,
  };
  let state: PersonState = { excessHeatJ: 0, fluidDeficitL: 0 };
  const routine = dailyPhases(s);
  for (
    let day = 1;
    day <= s.days && !result.boundary && result.elapsedSeconds < maxSeconds;
    day++
  ) {
    for (const phase of routine) {
      if (result.boundary || result.elapsedSeconds >= maxSeconds) break;
      const temperatureC = phase.temperatureC;
      const humidity = phase.humidityPercent;
      const requestedWorkW = phase.requestedWorkW;
      const deliveredWorkW = Math.min(requestedWorkW, workCapW);
      const metabolicW = person.restingW + deliveredWorkW / person.efficiency;
      const heatW = metabolicW - deliveredWorkW;
      const drinkRate = phase.drinkLPerHour;
      const evaporationFraction = Math.max(0.1, Math.min(1, (100 - humidity) / 60));
      const dryCapacityW = a.dryTransferWPerC * (a.referenceSkinC - temperatureC);
      const record: PhaseRecord = {
        day,
        phase: phase.kind,
        startSeconds: result.elapsedSeconds,
        endSeconds: result.elapsedSeconds,
        start: { ...state },
        end: { ...state },
        producedHeatJ: 0,
        removedHeatJ: 0,
        sweatL: 0,
        replacedL: 0,
        deliveredWorkJ: 0,
      };
      let phaseSeconds = 0;
      while (
        phaseSeconds < phase.hours * 3600 &&
        !result.boundary &&
        result.elapsedSeconds < maxSeconds
      ) {
        let dt = Math.min(
          stepSeconds,
          phase.hours * 3600 - phaseSeconds,
          maxSeconds - result.elapsedSeconds,
        );
        const fluidPercent = (state.fluidDeficitL / person.massKg) * 100;
        const hydrationFactor = Math.max(
          0,
          Math.min(
            1,
            1 -
              Math.max(0, fluidPercent - a.fluidCoolingOnsetPercent) /
                (a.fluidBoundaryPercent - a.fluidCoolingOnsetPercent),
          ),
        );
        const removalTargetW = heatW + state.excessHeatJ / a.recoverySeconds;
        const dryLossW = Math.min(removalTargetW, dryCapacityW);
        const evaporativeCapacityW =
          Math.max(0, person.coolingW - a.referenceDryW) * evaporationFraction * hydrationFactor;
        const evaporativeLossW = Math.min(
          Math.max(0, removalTargetW - dryLossW),
          evaporativeCapacityW,
        );
        const heatRateW = heatW - dryLossW - evaporativeLossW;
        const sweatLPerSecond = evaporativeLossW / (a.latentHeatJPerL * evaporationFraction);
        const offeredLPerSecond = drinkRate / 3600;
        // Locate the first boundary within the step, then integrate only to that instant.
        const heatSeconds =
          heatRateW > 0 ? (heatBoundJ - state.excessHeatJ) / heatRateW : Number.POSITIVE_INFINITY;
        const fluidRate = sweatLPerSecond - offeredLPerSecond;
        const fluidSeconds =
          fluidRate > 0
            ? (fluidBoundL - state.fluidDeficitL) / fluidRate
            : Number.POSITIVE_INFINITY;
        const crossing = Math.min(heatSeconds, fluidSeconds);
        if (crossing <= dt) {
          dt = Math.max(0, crossing);
          const kind = heatSeconds <= fluidSeconds ? "heat" : "fluid";
          result.status = "model-boundary";
          result.boundary = {
            kind,
            elapsedSeconds: result.elapsedSeconds + dt,
            message:
              kind === "heat"
                ? "Heat storage reached the assumed 2°C whole-body temperature-equivalent model boundary. Core temperature and injury are unknown."
                : "Sweat-related fluid deficit reached the assumed 4% initial-mass model boundary. Injury and survival are unknown.",
          };
        }
        const sweatL = sweatLPerSecond * dt;
        const replacedL = Math.min(state.fluidDeficitL + sweatL, offeredLPerSecond * dt);
        const producedJ = heatW * dt;
        const removedJ = (dryLossW + evaporativeLossW) * dt;
        const ratesWindowStartSeconds = result.elapsedSeconds;
        const ratesWindowEndSeconds = result.elapsedSeconds + dt;
        const point = (): TimelinePoint => ({
          ...state,
          elapsedSeconds: result.elapsedSeconds,
          ratesWindowStartSeconds,
          ratesWindowEndSeconds,
          day,
          phase: phase.kind,
          heatEquivalentC: state.excessHeatJ / heatCapacityJPerC,
          fluidDeficitPercent: (state.fluidDeficitL / person.massKg) * 100,
          producedHeatW: heatW,
          dryLossW,
          evaporativeLossW,
          evaporationFraction,
          hydrationFactor,
          deliveredWorkW,
          limiting:
            deliveredWorkW < requestedWorkW
              ? oxygenLimiter
              : heatRateW > 1e-8
                ? "Heat removal"
                : "Task demand",
        });
        if (phaseSeconds === 0) result.points.push(point());
        state = {
          excessHeatJ: state.excessHeatJ + producedJ - removedJ,
          fluidDeficitL: state.fluidDeficitL + sweatL - replacedL,
        };
        phaseSeconds += dt;
        result.elapsedSeconds += dt;
        result.producedHeatJ += producedJ;
        result.removedHeatJ += removedJ;
        result.sweatL += sweatL;
        result.replacedL += replacedL;
        result.metabolicJ += metabolicW * dt;
        result.requestedWorkJ += requestedWorkW * dt;
        result.deliveredWorkJ += deliveredWorkW * dt;
        record.producedHeatJ += producedJ;
        record.removedHeatJ += removedJ;
        record.sweatL += sweatL;
        record.replacedL += replacedL;
        record.deliveredWorkJ += deliveredWorkW * dt;
        result.peakHeatEquivalentC = Math.max(
          result.peakHeatEquivalentC,
          state.excessHeatJ / heatCapacityJPerC,
        );
        result.peakFluidDeficitPercent = Math.max(
          result.peakFluidDeficitPercent,
          (state.fluidDeficitL / person.massKg) * 100,
        );
        if (
          phaseSeconds % (s.phases ? 900 : 3600) === 0 ||
          phaseSeconds === phase.hours * 3600 ||
          result.boundary ||
          result.elapsedSeconds === maxSeconds
        )
          result.points.push(point());
      }
      record.endSeconds = result.elapsedSeconds;
      record.end = { ...state };
      result.phases.push(record);
    }
  }
  result.final = state;
  return result;
}

export const elapsedLabel = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h ${minutes % 60}m`;
};
export function explainTimeline(run: TimelineResult) {
  const last = run.points.at(-1);
  const firstStored = run.points.find((p) => p.excessHeatJ > 1);
  const firstReducedCooling = run.points.find((p) => p.hydrationFactor < 1 - 1e-8);
  const recovery = run.phases.find(
    (p) => p.phase === "recovery" && (p.start.excessHeatJ > 1 || p.start.fluidDeficitL > 1e-8),
  );
  const details = [];
  if (firstReducedCooling)
    details.push(
      `At the recorded ${elapsedLabel(firstReducedCooling.elapsedSeconds)}, unreplaced sweat fluid reduced the assumed cooling factor to ${(firstReducedCooling.hydrationFactor * 100).toFixed(1)}%. This links water loss to available evaporative cooling.`,
    );
  if (firstStored)
    details.push(
      `Stored heat first appears in the sampled timeline at ${elapsedLabel(firstStored.elapsedSeconds)}: production ${firstStored.producedHeatW.toFixed(2)} W minus dry ${(firstStored.dryLossW).toFixed(2)} W and evaporation ${(firstStored.evaporativeLossW).toFixed(2)} W = ${(firstStored.producedHeatW - firstStored.dryLossW - firstStored.evaporativeLossW).toFixed(2)} W entering heat storage.`,
    );
  if (recovery)
    details.push(
      `Day ${recovery.day} recovery carries heat ${(recovery.start.excessHeatJ / 1000).toFixed(2)} → ${(recovery.end.excessHeatJ / 1000).toFixed(2)} kJ and fluid deficit ${recovery.start.fluidDeficitL.toFixed(2)} → ${recovery.end.fluidDeficitL.toFixed(2)} L. Replacement used ${recovery.replacedL.toFixed(2)} L; new sweat loss ${recovery.sweatL.toFixed(2)} L.`,
    );
  if (run.boundary && last)
    details.push(
      `At the model boundary, accumulated heat is ${(last.excessHeatJ / 1000).toFixed(2)} kJ and sweat-fluid deficit is ${last.fluidDeficitL.toFixed(2)} L (${last.fluidDeficitPercent.toFixed(2)}% of initial mass). Later outcomes are not calculated.`,
    );
  if (!details.length)
    details.push(
      "Heat removal meets production and no unreplaced sweat-fluid state persists in this scenario. No delayed penalty is invented.",
    );
  return details;
}
export function compareTimelines(run: TimelineResult, reference: TimelineResult) {
  if (!sameTimelineSettings(run.settings, reference.settings))
    throw new InputError("Comparison requires identical timeline conditions.");
  // Totals from different horizons are not causal comparisons. Integrate both only
  // to the shared first boundary; the final step uses the exact common duration.
  const sharedSeconds = Math.min(run.elapsedSeconds, reference.elapsedSeconds);
  const sharedRun = integrateTimeline(run.configuration, run.settings, 60, sharedSeconds);
  const sharedReference = integrateTimeline(
    reference.configuration,
    reference.settings,
    60,
    sharedSeconds,
  );
  let firstDivergence: { elapsedSeconds: number; detail: string } | null = null;
  for (let i = 0; i < Math.min(run.points.length, reference.points.length); i++) {
    const x = run.points[i];
    const y = reference.points[i];
    if (x.elapsedSeconds !== y.elapsedSeconds) break;
    if (
      Math.abs(x.producedHeatW - y.producedHeatW) > 1e-8 ||
      Math.abs(x.deliveredWorkW - y.deliveredWorkW) > 1e-8 ||
      Math.abs(x.dryLossW + x.evaporativeLossW - y.dryLossW - y.evaporativeLossW) > 1e-8 ||
      Math.abs(x.heatEquivalentC - y.heatEquivalentC) > 1e-8 ||
      Math.abs(x.fluidDeficitL - y.fluidDeficitL) > 1e-8
    ) {
      firstDivergence = {
        elapsedSeconds: x.elapsedSeconds,
        detail: `Heat production ${y.producedHeatW.toFixed(2)} → ${x.producedHeatW.toFixed(2)} W; delivered work ${y.deliveredWorkW.toFixed(2)} → ${x.deliveredWorkW.toFixed(2)} W; dry + evaporative loss ${(y.dryLossW + y.evaporativeLossW).toFixed(2)} → ${(x.dryLossW + x.evaporativeLossW).toFixed(2)} W. These rates apply to the recorded interval ${elapsedLabel(x.ratesWindowStartSeconds)} → ${elapsedLabel(x.ratesWindowEndSeconds)}.`,
      };
      break;
    }
  }
  return { sharedSeconds, firstDivergence, sharedRun, sharedReference };
}
export function removeOneReplays(configuration: Configuration, settings: TimelineSettings) {
  const c = parseConfiguration(configuration);
  return PARAMETERS.filter((p) => c[p.id] !== 0).map((p) => ({
    parameter: p.id as ParameterId,
    label: p.label,
    result: simulateTimeline({ ...c, [p.id]: 0 }, settings),
  }));
}
export function exportTimelineReplay(
  configuration: Configuration,
  settings: TimelineSettings,
  reference: Configuration = { ...BASE_CONFIGURATION },
) {
  const c = parseConfiguration(configuration);
  const s = parseTimelineSettings(settings);
  const r = parseConfiguration(reference);
  return JSON.stringify(
    {
      format: "human-v2-timeline-1",
      context: CONTEXT,
      assumptions: TIMELINE_ASSUMPTIONS,
      configuration: c,
      reference: r,
      settings: s,
      recorded: { run: simulateTimeline(c, s), reference: simulateTimeline(r, s) },
    },
    null,
    2,
  );
}
export function importTimelineReplay(text: string) {
  if (text.length > 25000000) throw new InputError("Timeline replay is too large (maximum 25 MB).");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new InputError("Choose a valid timeline replay JSON.");
  }
  const v = objectInput(raw);
  exactKeys(v, [
    "format",
    "context",
    "assumptions",
    "configuration",
    "reference",
    "settings",
    "recorded",
  ]);
  if (v.format !== "human-v2-timeline-1")
    throw new InputError("Unsupported timeline replay format.");
  parseContext(v.context);
  const assumptions = objectInput(v.assumptions);
  exactKeys(assumptions, Object.keys(TIMELINE_ASSUMPTIONS));
  if (
    Object.keys(TIMELINE_ASSUMPTIONS).some(
      (k) => assumptions[k] !== TIMELINE_ASSUMPTIONS[k as keyof typeof TIMELINE_ASSUMPTIONS],
    )
  )
    throw new InputError("Recorded timeline assumptions do not match this version.");
  const configuration = parseConfiguration(v.configuration);
  const reference = parseConfiguration(v.reference);
  const settings = parseTimelineSettings(v.settings);
  const recorded = objectInput(v.recorded);
  exactKeys(recorded, ["run", "reference"]);
  const run = simulateTimeline(configuration, settings);
  const referenceRun = simulateTimeline(reference, settings);
  // Compare parsed data structurally, so JSON key order is irrelevant. Never trust imported results.
  const equal = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;
    const x = a as Record<string, unknown>;
    const y = b as Record<string, unknown>;
    return (
      Object.keys(x).length === Object.keys(y).length &&
      Object.keys(x).every((key) => Object.hasOwn(y, key) && equal(x[key], y[key]))
    );
  };
  if (!equal(recorded.run, run) || !equal(recorded.reference, referenceRun))
    throw new InputError("Recorded results do not reproduce. Existing experiment is unchanged.");
  return { configuration, reference, settings, run, referenceRun };
}
