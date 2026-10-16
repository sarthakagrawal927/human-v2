export const MODEL_VERSION = "energy-balance-1.0.0";
export const BASELINE_VERSION = "baseline-1.0.0";
export const CHALLENGE_ID = "sustainable-workload-1";
export const ENVIRONMENT = Object.freeze({
  id: "temperate-1",
  temperatureC: 22,
  humidityPercent: 40,
});
export type SystemId = "heart" | "lungs" | "circulation" | "muscles" | "cooling";
export const SYSTEMS: readonly { id: SystemId; name: string; description: string }[] = [
  {
    id: "heart",
    name: "Heart",
    description:
      "Pumps oxygen-carrying blood. More pumping capacity only helps while delivery is the limit.",
  },
  {
    id: "lungs",
    name: "Lungs",
    description:
      "An assumed gas-exchange ceiling. This edit does not specify larger lungs, faster breathing, or a change to lung tissue.",
  },
  {
    id: "circulation",
    name: "Circulation",
    description:
      "Caps transport and pressure-safe flow. This model scales the pressure-safe allowance with the square of circulation capacity.",
  },
  {
    id: "muscles",
    name: "Muscles",
    description:
      "Turns metabolic energy into work and heat. Efficiency and mechanical capacity are separate properties.",
  },
  {
    id: "cooling",
    name: "Cooling",
    description:
      "Removes resting and exertion heat. More delivered energy can reveal this bottleneck.",
  },
];
export const PARAMETERS = [
  {
    id: "pumping",
    system: "heart",
    label: "Pumping capacity",
    min: -30,
    max: 50,
    massCost: 3,
    restCost: 10,
  },
  {
    id: "exchange",
    system: "lungs",
    label: "Oxygen-exchange capacity",
    min: -30,
    max: 50,
    massCost: 2,
    restCost: 10,
  },
  {
    id: "transport",
    system: "circulation",
    label: "Circulation capacity",
    min: -30,
    max: 50,
    massCost: 3,
    restCost: 10,
  },
  {
    id: "power",
    system: "muscles",
    label: "Muscle work capacity",
    min: -30,
    max: 50,
    massCost: 15,
    restCost: 25,
  },
  {
    id: "efficiency",
    system: "muscles",
    label: "Muscle efficiency",
    min: -20,
    max: 20,
    massCost: 1,
    restCost: 10,
  },
  {
    id: "cooling",
    system: "cooling",
    label: "Cooling capacity",
    min: -30,
    max: 50,
    massCost: 2,
    restCost: 5,
  },
] as const;
export type ParameterId = (typeof PARAMETERS)[number]["id"];
export type Configuration = Record<ParameterId, number>;
export const BASE_CONFIGURATION: Readonly<Configuration> = Object.freeze({
  pumping: 0,
  exchange: 0,
  transport: 0,
  power: 0,
  efficiency: 0,
  cooling: 0,
});
export const BASELINE = Object.freeze({
  version: BASELINE_VERSION,
  massKg: 70,
  restingW: 100,
  pumpingW: 1000,
  exchangeW: 1200,
  transportW: 1300,
  pressureSafeW: 1250,
  efficiency: 0.25,
  muscleWorkW: 300,
  coolingW: 800,
});
export const CHALLENGE = Object.freeze({
  id: CHALLENGE_ID,
  name: "Sustainable workload",
  maxModifications: 3,
  maxMassChangePercent: 5,
  maxRestChangePercent: 5,
  standardWorkW: 180,
});
export const CONTEXT = Object.freeze({
  modelVersion: MODEL_VERSION,
  baselineVersion: BASELINE_VERSION,
  challengeId: CHALLENGE_ID,
  environment: ENVIRONMENT,
});
export type RunContext = typeof CONTEXT;
export const PRESETS: readonly {
  id: string;
  name: string;
  analogy: string;
  changes: Partial<Configuration>;
}[] = [
  {
    id: "endurance",
    name: "Endurance-inspired",
    analogy:
      "A bigger delivery reserve: an abstract analogy to endurance adaptations, not a species prediction.",
    changes: { pumping: 20 },
  },
  {
    id: "heat",
    name: "Heat-adapted",
    analogy:
      "Extra heat-removal capacity: a desert-animal-inspired abstraction, not a skin or gland transplant.",
    changes: { cooling: 20 },
  },
  {
    id: "economy",
    name: "Efficient mover",
    analogy:
      "More work per energy unit: an abstract animal-locomotion analogy, not a claim about a particular species.",
    changes: { efficiency: 10 },
  },
];
export class InputError extends Error {}
export function objectInput(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new InputError("Expected an object.");
  return value as Record<string, unknown>;
}
export function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new InputError("Missing or unexpected fields.");
}
export function parseConfiguration(value: unknown): Configuration {
  const input = objectInput(value);
  exactKeys(
    input,
    PARAMETERS.map((p) => p.id),
  );
  const result = { ...BASE_CONFIGURATION };
  for (const p of PARAMETERS) {
    const v = input[p.id];
    if (
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      !Number.isInteger(v) ||
      v % 5 !== 0 ||
      v < p.min ||
      v > p.max
    )
      throw new InputError(`${p.label} must be ${p.min}% to +${p.max}% in steps of 5%.`);
    result[p.id] = Object.is(v, -0) ? 0 : v;
  }
  return result;
}
export function parseContext(value: unknown): RunContext {
  const input = objectInput(value);
  exactKeys(input, ["modelVersion", "baselineVersion", "challengeId", "environment"]);
  const environment = objectInput(input.environment);
  exactKeys(environment, ["id", "temperatureC", "humidityPercent"]);
  if (
    input.modelVersion !== MODEL_VERSION ||
    input.baselineVersion !== BASELINE_VERSION ||
    input.challengeId !== CHALLENGE_ID ||
    environment.id !== ENVIRONMENT.id ||
    environment.temperatureC !== ENVIRONMENT.temperatureC ||
    environment.humidityPercent !== ENVIRONMENT.humidityPercent
  )
    throw new InputError(
      "This experiment uses a different simulator, baseline, challenge, or environment. Its original context cannot be silently changed.",
    );
  return CONTEXT;
}
export function canonicalConfiguration(configuration: Configuration) {
  const c = parseConfiguration(configuration);
  return JSON.stringify({ context: CONTEXT, configuration: c });
}
export function countModifications(c: Configuration) {
  return PARAMETERS.filter((p) => c[p.id] !== 0).length;
}
export function applyPreset(c: Configuration, id: string): Configuration {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new InputError("Unknown preset.");
  return parseConfiguration({ ...c, ...preset.changes });
}
export const percent = (value: number, baseline: number) => (value / baseline - 1) * 100;
const f = (v: number) => v.toFixed(2);
export interface Ceiling {
  id: string;
  system: SystemId;
  label: string;
  workW: number;
  equation: string;
}
export interface Violation {
  id: string;
  label: string;
  actual: number;
  limit: number;
  message: string;
}
export function simulate(configuration: Configuration, context: RunContext = CONTEXT) {
  parseContext(context);
  const c = parseConfiguration(configuration);
  const massKg = BASELINE.massKg + PARAMETERS.reduce((n, p) => n + (c[p.id] / 100) * p.massCost, 0);
  const restingW =
    BASELINE.restingW + PARAMETERS.reduce((n, p) => n + (c[p.id] / 100) * p.restCost, 0);
  const efficiency = BASELINE.efficiency * (1 + c.efficiency / 100);
  const pumpingW = BASELINE.pumpingW * (1 + c.pumping / 100);
  const exchangeW = BASELINE.exchangeW * (1 + c.exchange / 100);
  const transportW = BASELINE.transportW * (1 + c.transport / 100);
  const pressureSafeW = BASELINE.pressureSafeW * (1 + c.transport / 100) ** 2;
  const coolingW = BASELINE.coolingW * (1 + c.cooling / 100);
  const muscleWorkW = BASELINE.muscleWorkW * (1 + c.power / 100);
  const ceilings: Ceiling[] = [
    {
      id: "pumping",
      system: "heart",
      label: "Heart delivery",
      workW: efficiency * (pumpingW - restingW),
      equation: `η × (heart − rest) = ${efficiency.toFixed(4)} × (${f(pumpingW)} − ${f(restingW)})`,
    },
    {
      id: "exchange",
      system: "lungs",
      label: "Lung exchange",
      workW: efficiency * (exchangeW - restingW),
      equation: `η × (lungs − rest) = ${efficiency.toFixed(4)} × (${f(exchangeW)} − ${f(restingW)})`,
    },
    {
      id: "transport",
      system: "circulation",
      label: "Circulatory transport",
      workW: efficiency * (transportW - restingW),
      equation: `η × (transport − rest) = ${efficiency.toFixed(4)} × (${f(transportW)} − ${f(restingW)})`,
    },
    {
      id: "pressure",
      system: "circulation",
      label: "Pressure-safe flow",
      workW: efficiency * (pressureSafeW - restingW),
      equation: `η × (1250 × circulation² − rest) = ${efficiency.toFixed(4)} × (${f(pressureSafeW)} − ${f(restingW)})`,
    },
    {
      id: "cooling",
      system: "cooling",
      label: "Heat removal",
      workW: (efficiency * (coolingW - restingW)) / (1 - efficiency),
      equation: `η × (cooling − rest) / (1 − η) = ${efficiency.toFixed(4)} × (${f(coolingW)} − ${f(restingW)}) / ${(1 - efficiency).toFixed(4)}`,
    },
    {
      id: "power",
      system: "muscles",
      label: "Mechanical capacity",
      workW: muscleWorkW,
      equation: `300 × muscle multiplier = ${f(muscleWorkW)}`,
    },
  ];
  const workloadW = Math.max(0, Math.min(...ceilings.map((x) => x.workW)));
  const limiting = ceilings.filter((x) => Math.abs(x.workW - workloadW) < 1e-8);
  const metabolicW = restingW + workloadW / efficiency;
  const heatW = restingW + workloadW * (1 / efficiency - 1);
  const demandW = restingW + CHALLENGE.standardWorkW / efficiency;
  const exertionHeatW = restingW + CHALLENGE.standardWorkW * (1 / efficiency - 1);
  const oxygenAvailableW = Math.min(pumpingW, exchangeW, transportW);
  const oxygenRatio = demandW / oxygenAvailableW;
  const heatRatio = exertionHeatW / coolingW;
  const pressureRatio = demandW / pressureSafeW;
  const modifications = countModifications(c);
  const massChangePercent = percent(massKg, BASELINE.massKg);
  const restChangePercent = percent(restingW, BASELINE.restingW);
  const violations: Violation[] = [];
  const check = (id: string, label: string, actual: number, limit: number, message: string) => {
    if (actual > limit + 1e-9) violations.push({ id, label, actual, limit, message });
  };
  check(
    "modifications",
    "Modification budget",
    modifications,
    CHALLENGE.maxModifications,
    `${modifications} changed parameters; maximum ${CHALLENGE.maxModifications}.`,
  );
  check(
    "mass",
    "Body mass budget",
    Math.abs(massChangePercent),
    5,
    `Body mass changed ${f(massChangePercent)}%; allowed range −5% to +5%.`,
  );
  check(
    "rest",
    "Resting energy budget",
    Math.abs(restChangePercent),
    5,
    `Resting energy changed ${f(restChangePercent)}%; allowed range −5% to +5%.`,
  );
  check(
    "oxygen",
    "Exertion oxygen limit",
    oxygenRatio,
    1,
    `At ${CHALLENGE.standardWorkW} W, oxygen demand exceeds supply (${f(oxygenRatio * 100)}%).`,
  );
  check(
    "heat",
    "Exertion heat limit",
    heatRatio,
    1,
    `At ${CHALLENGE.standardWorkW} W, heat production exceeds cooling (${f(heatRatio * 100)}%).`,
  );
  check(
    "pressure",
    "Exertion pressure limit",
    pressureRatio,
    1,
    `At ${CHALLENGE.standardWorkW} W, flow exceeds the pressure-safe allowance (${f(pressureRatio * 100)}%).`,
  );
  check(
    "mechanical",
    "Exertion mechanical limit",
    CHALLENGE.standardWorkW / muscleWorkW,
    1,
    "The mechanical ceiling cannot support the standardized exertion test.",
  );
  check(
    "rest-oxygen",
    "Rest oxygen limit",
    restingW / oxygenAvailableW,
    1,
    "The configuration cannot support resting oxygen demand.",
  );
  check(
    "rest-heat",
    "Rest heat limit",
    restingW / coolingW,
    1,
    "The configuration cannot remove resting heat.",
  );
  const trace = [
    ...PARAMETERS.filter((p) => c[p.id] !== 0).map((p) => ({
      id: p.id,
      system: p.system,
      title: `${p.label}: ${c[p.id] > 0 ? "+" : ""}${c[p.id]}%`,
      detail: `Mass ${f((c[p.id] / 100) * p.massCost)} kg; resting energy ${f((c[p.id] / 100) * p.restCost)} W. Resting energy changes the oxygen and heat ceilings. Mass is checked against the challenge budget; it does not enter workload equations.`,
    })),
    {
      id: "delivery",
      system: "heart" as SystemId,
      title: "Oxygen supply is coupled",
      detail: `min(heart ${f(pumpingW)}, lungs ${f(exchangeW)}, circulation ${f(transportW)}) = ${f(oxygenAvailableW)} W-equivalent. Sustainable work must also respect pressure-safe flow.`,
    },
    {
      id: "balance",
      system: "muscles" as SystemId,
      title: "Work and heat share an energy budget",
      detail: `At ${f(workloadW)} W work: metabolic demand = ${f(restingW)} + ${f(workloadW)} / ${efficiency.toFixed(4)} = ${f(metabolicW)} W. Heat = ${f(heatW)} W; removal capacity = ${f(coolingW)} W.`,
    },
    {
      id: "limiter",
      system: limiting[0]?.system ?? "muscles",
      title: `Current limit: ${limiting.map((x) => x.label).join(" + ")}`,
      detail: `Sustainable workload is the minimum of the six calculated capacity ceilings: ${f(workloadW)} W. Normalized score = ${f(workloadW)} / 225 × 100.`,
    },
  ];
  return {
    modelVersion: MODEL_VERSION,
    context: CONTEXT,
    configuration: c,
    massKg,
    restingW,
    efficiency,
    massChangePercent,
    restChangePercent,
    modifications,
    workloadW,
    score: (workloadW / 225) * 100,
    ceilings,
    limiting,
    metabolicW,
    heatW,
    coolingW,
    trace,
    violations,
    valid: violations.length === 0,
    rest: {
      energyW: restingW,
      economyScore: (BASELINE.restingW / restingW) * 100,
      oxygenRatio: restingW / oxygenAvailableW,
      heatRatio: restingW / coolingW,
    },
    exertion: {
      workW: CHALLENGE.standardWorkW,
      metabolicW: demandW,
      heatW: exertionHeatW,
      oxygenRatio,
      heatRatio,
      pressureRatio,
      sustainable: workloadW + 1e-9 >= CHALLENGE.standardWorkW,
    },
  };
}
export type SimulationResult = ReturnType<typeof simulate>;
export const BASE_RESULT = simulate({ ...BASE_CONFIGURATION });
export function compareResults(result: SimulationResult, reference: SimulationResult) {
  return {
    workloadPercent: percent(result.workloadW, reference.workloadW),
    restPercent: percent(result.restingW, reference.restingW),
    massPercent: percent(result.massKg, reference.massKg),
    limitChanged:
      result.limiting.map((x) => x.id).join(",") !== reference.limiting.map((x) => x.id).join(","),
    ceilings: result.ceilings.map((x) => ({
      ...x,
      deltaW: x.workW - (reference.ceilings.find((y) => y.id === x.id)?.workW ?? 0),
    })),
  };
}
