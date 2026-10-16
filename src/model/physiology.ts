export const PHYSIOLOGY_VERSION = "pulse-4.4.0-human-v2-acute-1";
export const PULSE_SHA = "5e29e5b13710a08cec90874be7d36ecb192ebcda";
export const BODY_CONTROLS = [
  {
    id: "surface",
    label: "Gas-exchange area",
    min: -20,
    max: 40,
    system: "lungs",
    detail: "Alveolar surface area; does not enlarge total lung capacity.",
  },
  {
    id: "volume",
    label: "Total lung capacity",
    min: -10,
    max: 30,
    system: "lungs",
    detail:
      "Maximum lung volume. Pulse also derives exchange area from volume unless you set area separately.",
  },
  {
    id: "breathing",
    label: "Breathing-rate drive",
    min: -25,
    max: 100,
    system: "lungs",
    detail: "Multiplies respiratory drive; feedback still adjusts the resulting rate.",
  },
  {
    id: "stroke",
    label: "Heart contraction modifier",
    min: -20,
    max: 40,
    system: "heart",
    detail:
      "Pulse stroke-volume modifier changes cardiac elastance; it does not guarantee an equal output increase.",
  },
  {
    id: "heartRate",
    label: "Heart-rate drive",
    min: -20,
    max: 40,
    system: "heart",
    detail: "Multiplies heart-rate drive, with the engine’s feedback and rate bounds retained.",
  },
  {
    id: "resistance",
    label: "Systemic vascular resistance",
    min: -20,
    max: 40,
    system: "circulation",
    detail: "Changes systemic circuit resistance; pressure and flow respond together.",
  },
] as const;
export type BodyControl = (typeof BODY_CONTROLS)[number]["id"];
export interface PhysiologyConfiguration {
  surface: number;
  volume: number;
  breathing: number;
  stroke: number;
  heartRate: number;
  resistance: number;
  exercise: number;
  pressure: number;
}
export const BASE_BODY: PhysiologyConfiguration = {
  surface: 0,
  volume: 0,
  breathing: 0,
  stroke: 0,
  heartRate: 0,
  resistance: 0,
  exercise: 0,
  pressure: 760,
};
export const OUTPUTS = [
  ["OxygenSaturation", "Oxygen saturation", "%", 100],
  ["ArterialCarbonDioxidePressure", "Arterial CO₂", "mmHg", 1],
  ["BloodPH", "Blood pH", "", 1],
  ["HeartRate", "Heart rate", "/min", 1],
  ["RespirationRate", "Breathing rate", "/min", 1],
  ["CardiacOutput", "Cardiac output", "L/min", 1],
  ["MeanArterialPressure", "Mean arterial pressure", "mmHg", 1],
  ["CerebralBloodFlow", "Brain inflow", "mL/min", 1],
  ["TotalPulmonaryVentilation", "Ventilation", "L/min", 1],
  ["CoreTemperature", "Core temperature", "°C", 1],
  ["TotalMetabolicRate", "Metabolic power", "W", 1],
] as const;
export interface EngineEvent {
  event: string;
  elapsed_s: number;
  sample_elapsed_s: number;
  values: Record<string, number>;
}
export interface PhysiologyPoint {
  elapsed_s: number;
  values: Record<string, number>;
  events: string[];
}
export interface PhysiologyRun {
  version: string;
  git_hash: string;
  configuration: PhysiologyConfiguration;
  rows: PhysiologyPoint[];
  dense_rows: number[][];
  property_units: Record<string, string>;
  trailing_30s_mean: Record<string, number>;
  stabilized_values: Record<string, number>;
  events: EngineEvent[];
  patient: Record<string, unknown>;
  stopped: boolean;
  warnings: string[];
  post_actions_engine_time_s: number;
}
export interface PhysiologyComparison {
  version: string;
  sourceSha: string;
  adapterSha: string;
  configuration: PhysiologyConfiguration;
  baseline: PhysiologyRun;
  modified: PhysiologyRun;
}
export function parsePhysiology(value: unknown): PhysiologyConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected body settings.");
  const input = value as Record<string, unknown>;
  const keys = [...BODY_CONTROLS.map((p) => p.id), "exercise", "pressure"];
  if (
    Object.keys(input).length !== keys.length ||
    Object.keys(input).some((k) => !keys.includes(k))
  )
    throw new Error("Use only the supported body and environment settings.");
  for (const p of BODY_CONTROLS) {
    const n = input[p.id];
    if (typeof n !== "number" || !Number.isFinite(n) || n < p.min || n > p.max || n % 5 !== 0)
      throw new Error(`${p.label} is outside its supported steps.`);
  }
  if (typeof input.exercise !== "number" || ![0, 0.1, 0.2, 0.3].includes(input.exercise))
    throw new Error("Unsupported exercise intensity.");
  if (typeof input.pressure !== "number" || ![760, 650, 525].includes(input.pressure))
    throw new Error("Unsupported atmospheric pressure.");
  return Object.fromEntries(keys.map((k) => [k, input[k]])) as unknown as PhysiologyConfiguration;
}
export function outputText(key: string, value: number) {
  const metric = OUTPUTS.find((o) => o[0] === key);
  return `${(value * (metric?.[3] ?? 1)).toFixed(key === "BloodPH" ? 3 : 2)}${metric?.[2] ? ` ${metric[2]}` : ""}`;
}
// These are recorded model observations, never diagnoses or invented damage costs.
export function comparisonTrace(c: PhysiologyComparison): string[] {
  const config = c.configuration;
  const a = c.baseline.trailing_30s_mean;
  const b = c.modified.trailing_30s_mean;
  const trace: string[] = [];
  if (config.volume)
    trace.push(
      `Total lung capacity changed ${config.volume > 0 ? "+" : ""}${config.volume}%. ${config.surface ? "Exchange area was separately specified." : "Pulse also derived exchange area from the changed volume."} Added tissue mass and chest-space competition are not modeled.`,
    );
  if (config.surface || config.volume)
    trace.push(
      `Gas exchange → arterial oxygen: saturation ${outputText("OxygenSaturation", a.OxygenSaturation)} → ${outputText("OxygenSaturation", b.OxygenSaturation)}. This measures the combined experiment; it does not isolate a single edit’s contribution.`,
    );
  if (config.breathing)
    trace.push(
      `Breathing drive → ventilation and CO₂ feedback: ${outputText("TotalPulmonaryVentilation", a.TotalPulmonaryVentilation)} → ${outputText("TotalPulmonaryVentilation", b.TotalPulmonaryVentilation)}; arterial CO₂ ${outputText("ArterialCarbonDioxidePressure", a.ArterialCarbonDioxidePressure)} → ${outputText("ArterialCarbonDioxidePressure", b.ArterialCarbonDioxidePressure)}; pH ${outputText("BloodPH", a.BloodPH)} → ${outputText("BloodPH", b.BloodPH)}. Actual breathing remains feedback-controlled.`,
    );
  if (config.stroke || config.heartRate || config.resistance)
    trace.push(
      `Cardiac mechanics and vessel resistance → coupled pressure/flow: cardiac output ${outputText("CardiacOutput", a.CardiacOutput)} → ${outputText("CardiacOutput", b.CardiacOutput)}, mean arterial pressure ${outputText("MeanArterialPressure", a.MeanArterialPressure)} → ${outputText("MeanArterialPressure", b.MeanArterialPressure)}. The contraction modifier acts on heart elastance; above 1 its factor is squared by Pulse.`,
    );
  const ceiling = c.modified.patient.HeartRateMaximum as
    | { ScalarFrequency?: { Value?: number } }
    | undefined;
  if (ceiling?.ScalarFrequency?.Value && b.HeartRate >= ceiling.ScalarFrequency.Value - 0.2)
    trace.push(
      `Heart-rate ceiling remains: ${outputText("HeartRate", b.HeartRate)} versus the engine’s ${ceiling.ScalarFrequency.Value.toFixed(1)}/min maximum. Better oxygen readings have not removed this constraint. Sustainable workload is not calculated by this fixed-intensity test.`,
    );
  if (!trace.length)
    trace.push(
      "Unmodified body: both trajectories use identical inputs and conditions. No body improvement is claimed.",
    );
  return trace;
}
