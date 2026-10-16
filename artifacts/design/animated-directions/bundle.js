// src/model/simulator.ts
var MODEL_VERSION = "energy-balance-1.0.0";
var BASELINE_VERSION = "baseline-1.0.0";
var CHALLENGE_ID = "sustainable-workload-1";
var ENVIRONMENT = Object.freeze({
  id: "temperate-1",
  temperatureC: 22,
  humidityPercent: 40
});
var PARAMETERS = [
  {
    id: "pumping",
    system: "heart",
    label: "Pumping capacity",
    min: -30,
    max: 50,
    massCost: 3,
    restCost: 10
  },
  {
    id: "exchange",
    system: "lungs",
    label: "Oxygen-exchange capacity",
    min: -30,
    max: 50,
    massCost: 2,
    restCost: 10
  },
  {
    id: "transport",
    system: "circulation",
    label: "Circulation capacity",
    min: -30,
    max: 50,
    massCost: 3,
    restCost: 10
  },
  {
    id: "power",
    system: "muscles",
    label: "Muscle work capacity",
    min: -30,
    max: 50,
    massCost: 15,
    restCost: 25
  },
  {
    id: "efficiency",
    system: "muscles",
    label: "Muscle efficiency",
    min: -20,
    max: 20,
    massCost: 1,
    restCost: 10
  },
  {
    id: "cooling",
    system: "cooling",
    label: "Cooling capacity",
    min: -30,
    max: 50,
    massCost: 2,
    restCost: 5
  }
];
var BASE_CONFIGURATION = Object.freeze({
  pumping: 0,
  exchange: 0,
  transport: 0,
  power: 0,
  efficiency: 0,
  cooling: 0
});
var BASELINE = Object.freeze({
  version: BASELINE_VERSION,
  massKg: 70,
  restingW: 100,
  pumpingW: 1e3,
  exchangeW: 1200,
  transportW: 1300,
  pressureSafeW: 1250,
  efficiency: 0.25,
  muscleWorkW: 300,
  coolingW: 800
});
var CHALLENGE = Object.freeze({
  id: CHALLENGE_ID,
  name: "Sustainable workload",
  maxModifications: 3,
  maxMassChangePercent: 5,
  maxRestChangePercent: 5,
  standardWorkW: 180
});
var CONTEXT = Object.freeze({
  modelVersion: MODEL_VERSION,
  baselineVersion: BASELINE_VERSION,
  challengeId: CHALLENGE_ID,
  environment: ENVIRONMENT
});
var InputError = class extends Error {
};
function objectInput(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new InputError("Expected an object.");
  return value;
}
function exactKeys(value, keys) {
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key)))
    throw new InputError("Missing or unexpected fields.");
}
function parseConfiguration(value) {
  const input = objectInput(value);
  exactKeys(
    input,
    PARAMETERS.map((p) => p.id)
  );
  const result = { ...BASE_CONFIGURATION };
  for (const p of PARAMETERS) {
    const v = input[p.id];
    if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v) || v % 5 !== 0 || v < p.min || v > p.max)
      throw new InputError(`${p.label} must be ${p.min}% to +${p.max}% in steps of 5%.`);
    result[p.id] = Object.is(v, -0) ? 0 : v;
  }
  return result;
}
function parseContext(value) {
  const input = objectInput(value);
  exactKeys(input, ["modelVersion", "baselineVersion", "challengeId", "environment"]);
  const environment2 = objectInput(input.environment);
  exactKeys(environment2, ["id", "temperatureC", "humidityPercent"]);
  if (input.modelVersion !== MODEL_VERSION || input.baselineVersion !== BASELINE_VERSION || input.challengeId !== CHALLENGE_ID || environment2.id !== ENVIRONMENT.id || environment2.temperatureC !== ENVIRONMENT.temperatureC || environment2.humidityPercent !== ENVIRONMENT.humidityPercent)
    throw new InputError(
      "This experiment uses a different simulator, baseline, challenge, or environment. Its original context cannot be silently changed."
    );
  return CONTEXT;
}
function countModifications(c) {
  return PARAMETERS.filter((p) => c[p.id] !== 0).length;
}
var percent = (value, baseline2) => (value / baseline2 - 1) * 100;
var f = (v) => v.toFixed(2);
function simulate(configuration2, context = CONTEXT) {
  parseContext(context);
  const c = parseConfiguration(configuration2);
  const massKg = BASELINE.massKg + PARAMETERS.reduce((n, p) => n + c[p.id] / 100 * p.massCost, 0);
  const restingW = BASELINE.restingW + PARAMETERS.reduce((n, p) => n + c[p.id] / 100 * p.restCost, 0);
  const efficiency = BASELINE.efficiency * (1 + c.efficiency / 100);
  const pumpingW = BASELINE.pumpingW * (1 + c.pumping / 100);
  const exchangeW = BASELINE.exchangeW * (1 + c.exchange / 100);
  const transportW = BASELINE.transportW * (1 + c.transport / 100);
  const pressureSafeW = BASELINE.pressureSafeW * (1 + c.transport / 100) ** 2;
  const coolingW = BASELINE.coolingW * (1 + c.cooling / 100);
  const muscleWorkW = BASELINE.muscleWorkW * (1 + c.power / 100);
  const ceilings = [
    {
      id: "pumping",
      system: "heart",
      label: "Heart delivery",
      workW: efficiency * (pumpingW - restingW),
      equation: `\u03B7 \xD7 (heart \u2212 rest) = ${efficiency.toFixed(4)} \xD7 (${f(pumpingW)} \u2212 ${f(restingW)})`
    },
    {
      id: "exchange",
      system: "lungs",
      label: "Lung exchange",
      workW: efficiency * (exchangeW - restingW),
      equation: `\u03B7 \xD7 (lungs \u2212 rest) = ${efficiency.toFixed(4)} \xD7 (${f(exchangeW)} \u2212 ${f(restingW)})`
    },
    {
      id: "transport",
      system: "circulation",
      label: "Circulatory transport",
      workW: efficiency * (transportW - restingW),
      equation: `\u03B7 \xD7 (transport \u2212 rest) = ${efficiency.toFixed(4)} \xD7 (${f(transportW)} \u2212 ${f(restingW)})`
    },
    {
      id: "pressure",
      system: "circulation",
      label: "Pressure-safe flow",
      workW: efficiency * (pressureSafeW - restingW),
      equation: `\u03B7 \xD7 (1250 \xD7 circulation\xB2 \u2212 rest) = ${efficiency.toFixed(4)} \xD7 (${f(pressureSafeW)} \u2212 ${f(restingW)})`
    },
    {
      id: "cooling",
      system: "cooling",
      label: "Heat removal",
      workW: efficiency * (coolingW - restingW) / (1 - efficiency),
      equation: `\u03B7 \xD7 (cooling \u2212 rest) / (1 \u2212 \u03B7) = ${efficiency.toFixed(4)} \xD7 (${f(coolingW)} \u2212 ${f(restingW)}) / ${(1 - efficiency).toFixed(4)}`
    },
    {
      id: "power",
      system: "muscles",
      label: "Mechanical capacity",
      workW: muscleWorkW,
      equation: `300 \xD7 muscle multiplier = ${f(muscleWorkW)}`
    }
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
  const violations = [];
  const check = (id2, label, actual, limit, message) => {
    if (actual > limit + 1e-9) violations.push({ id: id2, label, actual, limit, message });
  };
  check(
    "modifications",
    "Modification budget",
    modifications,
    CHALLENGE.maxModifications,
    `${modifications} changed parameters; maximum ${CHALLENGE.maxModifications}.`
  );
  check(
    "mass",
    "Body mass budget",
    Math.abs(massChangePercent),
    5,
    `Body mass changed ${f(massChangePercent)}%; allowed range \u22125% to +5%.`
  );
  check(
    "rest",
    "Resting energy budget",
    Math.abs(restChangePercent),
    5,
    `Resting energy changed ${f(restChangePercent)}%; allowed range \u22125% to +5%.`
  );
  check(
    "oxygen",
    "Exertion oxygen limit",
    oxygenRatio,
    1,
    `At ${CHALLENGE.standardWorkW} W, oxygen demand exceeds supply (${f(oxygenRatio * 100)}%).`
  );
  check(
    "heat",
    "Exertion heat limit",
    heatRatio,
    1,
    `At ${CHALLENGE.standardWorkW} W, heat production exceeds cooling (${f(heatRatio * 100)}%).`
  );
  check(
    "pressure",
    "Exertion pressure limit",
    pressureRatio,
    1,
    `At ${CHALLENGE.standardWorkW} W, flow exceeds the pressure-safe allowance (${f(pressureRatio * 100)}%).`
  );
  check(
    "mechanical",
    "Exertion mechanical limit",
    CHALLENGE.standardWorkW / muscleWorkW,
    1,
    "The mechanical ceiling cannot support the standardized exertion test."
  );
  check(
    "rest-oxygen",
    "Rest oxygen limit",
    restingW / oxygenAvailableW,
    1,
    "The configuration cannot support resting oxygen demand."
  );
  check(
    "rest-heat",
    "Rest heat limit",
    restingW / coolingW,
    1,
    "The configuration cannot remove resting heat."
  );
  const trace = [
    ...PARAMETERS.filter((p) => c[p.id] !== 0).map((p) => ({
      id: p.id,
      system: p.system,
      title: `${p.label}: ${c[p.id] > 0 ? "+" : ""}${c[p.id]}%`,
      detail: `Mass ${f(c[p.id] / 100 * p.massCost)} kg; resting energy ${f(c[p.id] / 100 * p.restCost)} W. Resting energy changes the oxygen and heat ceilings. Mass is checked against the challenge budget; it does not enter workload equations.`
    })),
    {
      id: "delivery",
      system: "heart",
      title: "Oxygen supply is coupled",
      detail: `min(heart ${f(pumpingW)}, lungs ${f(exchangeW)}, circulation ${f(transportW)}) = ${f(oxygenAvailableW)} W-equivalent. Sustainable work must also respect pressure-safe flow.`
    },
    {
      id: "balance",
      system: "muscles",
      title: "Work and heat share an energy budget",
      detail: `At ${f(workloadW)} W work: metabolic demand = ${f(restingW)} + ${f(workloadW)} / ${efficiency.toFixed(4)} = ${f(metabolicW)} W. Heat = ${f(heatW)} W; removal capacity = ${f(coolingW)} W.`
    },
    {
      id: "limiter",
      system: limiting[0]?.system ?? "muscles",
      title: `Current limit: ${limiting.map((x) => x.label).join(" + ")}`,
      detail: `Sustainable workload is the minimum of the six calculated capacity ceilings: ${f(workloadW)} W. Normalized score = ${f(workloadW)} / 225 \xD7 100.`
    }
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
    score: workloadW / 225 * 100,
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
      economyScore: BASELINE.restingW / restingW * 100,
      oxygenRatio: restingW / oxygenAvailableW,
      heatRatio: restingW / coolingW
    },
    exertion: {
      workW: CHALLENGE.standardWorkW,
      metabolicW: demandW,
      heatW: exertionHeatW,
      oxygenRatio,
      heatRatio,
      pressureRatio,
      sustainable: workloadW + 1e-9 >= CHALLENGE.standardWorkW
    }
  };
}
var BASE_RESULT = simulate({ ...BASE_CONFIGURATION });

// src/model/timeline.ts
var TIMELINE_VERSION = "heat-fluid-1.0.0";
var SCENARIO_VERSION = "repeated-day-1.0.0";
var TIMELINE_ASSUMPTIONS = Object.freeze({
  heatCapacityJPerKgC: 2980,
  latentHeatJPerL: 243e4,
  referenceSkinC: 35,
  dryTransferWPerC: 160 / 13,
  referenceDryW: 160,
  recoverySeconds: 1800,
  fluidCoolingOnsetPercent: 1,
  fluidBoundaryPercent: 4,
  heatBoundaryEquivalentC: 2,
  stepSeconds: 60
});
var SCENARIOS = [
  {
    id: "temperate",
    name: "Temperate routine",
    temperatureC: 22,
    humidityPercent: 40,
    activityDrinkLPerHour: 0.5,
    recoveryDrinkLPerHour: 0.25,
    description: "Four hours of activity, then a cool recovery with fluid replacement."
  },
  {
    id: "hot-shift",
    name: "Hot shift",
    temperatureC: 30,
    humidityPercent: 50,
    activityDrinkLPerHour: 1.1,
    recoveryDrinkLPerHour: 0.25,
    description: "The same task in warmer, more humid air. Drinking cannot fix a heat-removal limit."
  },
  {
    id: "scarce-water",
    name: "Scarce water",
    temperatureC: 22,
    humidityPercent: 40,
    activityDrinkLPerHour: 0.5,
    recoveryDrinkLPerHour: 0.02,
    description: "The same temperate task with incomplete fluid replacement between days."
  }
];
function scenarioSettings(id2, days = 30, requestedWorkW = 180) {
  const scenario = SCENARIOS.find((s) => s.id === id2);
  if (!scenario) throw new InputError("Unknown repeated-day scenario.");
  return {
    modelVersion: TIMELINE_VERSION,
    scenarioVersion: SCENARIO_VERSION,
    scenarioId: id2,
    days,
    requestedWorkW,
    activityDrinkLPerHour: scenario.activityDrinkLPerHour,
    recoveryDrinkLPerHour: scenario.recoveryDrinkLPerHour
  };
}
var DEFAULT_TIMELINE = Object.freeze(scenarioSettings("temperate"));
function parseTimelineSettings(value) {
  const v = objectInput(value);
  exactKeys(v, Object.keys(DEFAULT_TIMELINE));
  if (v.modelVersion !== TIMELINE_VERSION || v.scenarioVersion !== SCENARIO_VERSION)
    throw new InputError("Unsupported timeline version; it cannot be silently reinterpreted.");
  if (!SCENARIOS.some((s) => s.id === v.scenarioId)) throw new InputError("Unknown scenario.");
  if (typeof v.days !== "number" || !Number.isInteger(v.days) || v.days < 1 || v.days > 90)
    throw new InputError("Repeated days must be an integer from 1 to 90.");
  if (typeof v.requestedWorkW !== "number" || !Number.isInteger(v.requestedWorkW) || v.requestedWorkW < 0 || v.requestedWorkW > 300)
    throw new InputError("Requested work must be an integer from 0 to 300 W.");
  for (const key of ["activityDrinkLPerHour", "recoveryDrinkLPerHour"]) {
    if (typeof v[key] !== "number" || !Number.isFinite(v[key]) || v[key] < 0 || v[key] > 1.5)
      throw new InputError("Fluid replacement must be between 0 and 1.5 L/h.");
  }
  return {
    modelVersion: TIMELINE_VERSION,
    scenarioVersion: SCENARIO_VERSION,
    scenarioId: v.scenarioId,
    days: v.days,
    requestedWorkW: v.requestedWorkW,
    activityDrinkLPerHour: v.activityDrinkLPerHour,
    recoveryDrinkLPerHour: v.recoveryDrinkLPerHour
  };
}
function simulateTimeline(configuration2, settings2 = DEFAULT_TIMELINE, stepSeconds = TIMELINE_ASSUMPTIONS.stepSeconds) {
  return integrateTimeline(configuration2, settings2, stepSeconds, Number.POSITIVE_INFINITY);
}
function integrateTimeline(configuration2, settings2, stepSeconds, maxSeconds) {
  const c = parseConfiguration(configuration2);
  const s = parseTimelineSettings(settings2);
  if (![15, 30, 60].includes(stepSeconds))
    throw new InputError("Supported time steps are 15, 30 and 60 seconds.");
  const person2 = simulate(c);
  const scenario = SCENARIOS.find((x) => x.id === s.scenarioId);
  if (!scenario) throw new InputError("Unknown scenario.");
  const a = TIMELINE_ASSUMPTIONS;
  const heatCapacityJPerC = person2.massKg * a.heatCapacityJPerKgC;
  const heatBoundJ = heatCapacityJPerC * a.heatBoundaryEquivalentC;
  const fluidBoundL = person2.massKg * a.fluidBoundaryPercent / 100;
  const capacities = person2.ceilings.filter((x) => x.id !== "cooling");
  const workCapW = Math.max(0, Math.min(...capacities.map((x) => x.workW)));
  const oxygenLimiter = capacities.filter((x) => Math.abs(x.workW - workCapW) < 1e-8).map((x) => x.label).join(" + ");
  const result = {
    settings: s,
    configuration: c,
    context: CONTEXT,
    massKg: person2.massKg,
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
    oxygenLimiter
  };
  let state = { excessHeatJ: 0, fluidDeficitL: 0 };
  const dailyPhases = [
    { id: "rest", hours: 8 },
    { id: "activity", hours: 4 },
    { id: "recovery", hours: 12 }
  ];
  for (let day = 1; day <= s.days && !result.boundary && result.elapsedSeconds < maxSeconds; day++) {
    for (const phase of dailyPhases) {
      if (result.boundary || result.elapsedSeconds >= maxSeconds) break;
      const activity = phase.id === "activity";
      const temperatureC = activity ? scenario.temperatureC : 22;
      const humidity = activity ? scenario.humidityPercent : 40;
      const requestedWorkW = activity ? s.requestedWorkW : 0;
      const deliveredWorkW = Math.min(requestedWorkW, workCapW);
      const metabolicW = person2.restingW + deliveredWorkW / person2.efficiency;
      const heatW = metabolicW - deliveredWorkW;
      const drinkRate = activity ? s.activityDrinkLPerHour : s.recoveryDrinkLPerHour;
      const evaporationFraction = Math.max(0.1, Math.min(1, (100 - humidity) / 60));
      const dryCapacityW = a.dryTransferWPerC * (a.referenceSkinC - temperatureC);
      const record = {
        day,
        phase: phase.id,
        startSeconds: result.elapsedSeconds,
        endSeconds: result.elapsedSeconds,
        start: { ...state },
        end: { ...state },
        producedHeatJ: 0,
        removedHeatJ: 0,
        sweatL: 0,
        replacedL: 0,
        deliveredWorkJ: 0
      };
      let phaseSeconds = 0;
      while (phaseSeconds < phase.hours * 3600 && !result.boundary && result.elapsedSeconds < maxSeconds) {
        let dt = Math.min(
          stepSeconds,
          phase.hours * 3600 - phaseSeconds,
          maxSeconds - result.elapsedSeconds
        );
        const fluidPercent = state.fluidDeficitL / person2.massKg * 100;
        const hydrationFactor = Math.max(
          0,
          Math.min(
            1,
            1 - Math.max(0, fluidPercent - a.fluidCoolingOnsetPercent) / (a.fluidBoundaryPercent - a.fluidCoolingOnsetPercent)
          )
        );
        const removalTargetW = heatW + state.excessHeatJ / a.recoverySeconds;
        const dryLossW = Math.min(removalTargetW, dryCapacityW);
        const evaporativeCapacityW = Math.max(0, person2.coolingW - a.referenceDryW) * evaporationFraction * hydrationFactor;
        const evaporativeLossW = Math.min(
          Math.max(0, removalTargetW - dryLossW),
          evaporativeCapacityW
        );
        const heatRateW = heatW - dryLossW - evaporativeLossW;
        const sweatLPerSecond = evaporativeLossW / (a.latentHeatJPerL * evaporationFraction);
        const offeredLPerSecond = drinkRate / 3600;
        const heatSeconds = heatRateW > 0 ? (heatBoundJ - state.excessHeatJ) / heatRateW : Number.POSITIVE_INFINITY;
        const fluidRate = sweatLPerSecond - offeredLPerSecond;
        const fluidSeconds = fluidRate > 0 ? (fluidBoundL - state.fluidDeficitL) / fluidRate : Number.POSITIVE_INFINITY;
        const crossing = Math.min(heatSeconds, fluidSeconds);
        if (crossing <= dt) {
          dt = Math.max(0, crossing);
          const kind = heatSeconds <= fluidSeconds ? "heat" : "fluid";
          result.status = "model-boundary";
          result.boundary = {
            kind,
            elapsedSeconds: result.elapsedSeconds + dt,
            message: kind === "heat" ? "Heat storage reached the assumed 2\xB0C whole-body temperature-equivalent model boundary. Core temperature and injury are unknown." : "Sweat-related fluid deficit reached the assumed 4% initial-mass model boundary. Injury and survival are unknown."
          };
        }
        const sweatL = sweatLPerSecond * dt;
        const replacedL = Math.min(state.fluidDeficitL + sweatL, offeredLPerSecond * dt);
        const producedJ = heatW * dt;
        const removedJ = (dryLossW + evaporativeLossW) * dt;
        const ratesWindowStartSeconds = result.elapsedSeconds;
        const ratesWindowEndSeconds = result.elapsedSeconds + dt;
        const point = () => ({
          ...state,
          elapsedSeconds: result.elapsedSeconds,
          ratesWindowStartSeconds,
          ratesWindowEndSeconds,
          day,
          phase: phase.id,
          heatEquivalentC: state.excessHeatJ / heatCapacityJPerC,
          fluidDeficitPercent: state.fluidDeficitL / person2.massKg * 100,
          producedHeatW: heatW,
          dryLossW,
          evaporativeLossW,
          evaporationFraction,
          hydrationFactor,
          deliveredWorkW,
          limiting: deliveredWorkW < requestedWorkW ? oxygenLimiter : heatRateW > 1e-8 ? "Heat removal" : "Task demand"
        });
        if (phaseSeconds === 0) result.points.push(point());
        state = {
          excessHeatJ: state.excessHeatJ + producedJ - removedJ,
          fluidDeficitL: state.fluidDeficitL + sweatL - replacedL
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
          state.excessHeatJ / heatCapacityJPerC
        );
        result.peakFluidDeficitPercent = Math.max(
          result.peakFluidDeficitPercent,
          state.fluidDeficitL / person2.massKg * 100
        );
        if (phaseSeconds % 3600 === 0 || phaseSeconds === phase.hours * 3600 || result.boundary || result.elapsedSeconds === maxSeconds)
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

// artifacts/design/animated-directions/probe.js
var lane = document.body.dataset.lane;
var labels = { pumping: "Heart pumping", exchange: "Lung exchange", transport: "Circulation", power: "Muscle capacity", efficiency: "Muscle efficiency", cooling: "Cooling capacity" };
var configuration = { ...BASE_CONFIGURATION, pumping: 20, cooling: 20, efficiency: 10 };
var settings = scenarioSettings("hot-shift", 7, 180);
var run;
var baseline;
var person;
var seconds = 9 * 3600;
var playing = false;
var lastFrame = 0;
var $ = (selector) => document.querySelector(selector);
var body = `<svg class="body-svg" viewBox="0 0 360 480" aria-label="Abstract body showing recorded work, heat and cooling activity" role="img">
 <defs><linearGradient id="bodyFill" x2="0" y2="1"><stop stop-color="#79ada9" stop-opacity=".13"/><stop offset="1" stop-color="#79ada9" stop-opacity=".03"/></linearGradient><linearGradient id="heatFill" x2="0" y2="1"><stop stop-color="#e59b69" stop-opacity=".7"/><stop offset="1" stop-color="#e59b69" stop-opacity=".04"/></linearGradient></defs>
 <circle cx="180" cy="43" r="29" class="outline"/>
 <path class="outline" d="M153 83 Q180 73 207 83 L229 108 261 218 Q266 235 251 239 Q239 244 232 226 L212 165 210 256 226 422 Q228 443 210 445 Q193 447 191 426 L180 314 169 426 Q167 447 150 445 Q132 443 134 422 L150 256 148 165 128 226 Q121 244 109 239 Q94 235 99 218 L131 108 Z"/>
 <path id="heatGlow" d="M159 159 Q180 148 201 159 L205 255 191 317 169 317 155 255Z" fill="url(#heatFill)" opacity=".15"/>
 <path class="lung left-lung" d="M171 100 Q152 93 148 117 L143 156 Q146 175 168 163Z"/><path class="lung right-lung" d="M189 100 Q208 93 212 117 L217 156 Q214 175 192 163Z"/>
 <path class="air" d="M180 78V130M180 108L160 135M180 108L200 135"/>
 <path class="vessel" d="M180 164 V282 M180 186 L156 147 M180 186 L204 147 M180 211 L128 210 M180 211 L232 210 M180 282 L155 415 M180 282 L205 415"/>
 <path class="blood-flow" d="M180 164 V282 M180 211 L128 210 M180 211 L232 210 M180 282 L155 415 M180 282 L205 415"/>
 <path class="muscle" d="M155 291 L151 368 M205 291 L209 368"/>
 <path class="heart" d="M179 147 C164 131 157 149 166 160 L181 174 194 158 C203 145 187 134 179 147"/>
 <g class="cooling-flow"><path d="M106 139Q89 151 94 166M253 139Q270 151 265 166M91 193Q76 205 81 220M268 193Q283 205 278 220"/></g>
 <g class="body-labels"><text x="231" y="123">EXCHANGE</text><text x="220" y="176">PUMP</text><text x="222" y="278">HEAT STORAGE</text><text x="21" y="304">WORK</text><text x="23" y="174">COOLING</text></g>
 <g class="label-lines"><path d="M211 120h14 M194 162l20 9 M200 257l17 16 M152 322l-75-15 M104 171l-24 0"/></g>
</svg>`;
var controls = `<section class="traits panel"><div class="section-top"><span class="eyebrow">01 / BODY</span><button id="reset" class="quiet">Reset traits</button></div><h2>Build your person</h2><p class="muted">Combine changes. Follow what becomes limiting.</p><div class="trait-list">${PARAMETERS.map((p) => `<label class="trait"><span>${labels[p.id]}<output id="value-${p.id}"></output></span><input data-parameter="${p.id}" type="range" min="${p.min}" max="${p.max}" step="5" value="${configuration[p.id]}"/><small>${p.min}% <span>baseline 0%</span> +${p.max}%</small></label>`).join("")}</div><div class="costs"><span>Mass <b id="mass"></b></span><span>Rest energy <b id="rest"></b></span><span>Steady challenge <b id="validity"></b></span></div></section>`;
var environment = `<section class="environment panel"><div class="section-top"><span class="eyebrow">02 / WORLD & ROUTINE</span><span class="tiny">Repeated days</span></div><div class="environment-fields"><label>Environment<select id="scenario">${SCENARIOS.map((s) => `<option value="${s.id}" ${s.id === settings.scenarioId ? "selected" : ""}>${s.name} \xB7 ${s.temperatureC}\xB0C / ${s.humidityPercent}% RH</option>`).join("")}</select></label><label>Workload <output id="work-value"></output><input id="work" type="range" min="0" max="300" step="5" value="180"/></label><label>Activity water \xB7 L/h<input id="activity-water" type="number" min="0" max="1.5" step=".05" value="1.1"/></label><label>Recovery water \xB7 L/h<input id="recovery-water" type="number" min="0" max="1.5" step=".01" value=".25"/></label><label>Days<select id="days"><option>1</option><option selected>7</option><option>30</option><option>90</option></select></label></div><div class="routine"><span>00:00 \u2014 08:00 <b>Rest</b></span><span>08:00 \u2014 12:00 <b>Activity</b></span><span>12:00 \u2014 24:00 <b>Recovery</b></span></div></section>`;
var telemetry = `<section class="telemetry panel"><span class="eyebrow">RECORDED STATE</span><h2 id="clock">Day 1 \xB7 09:00</h2><div id="phase" class="phase">Activity</div><div class="metric"><span>Delivered work</span><strong id="delivered">180 <small>W</small></strong><small id="baseline-work"></small></div><div class="metric warm"><span>Stored heat equivalent</span><strong id="heat">0.00 <small>\xB0C</small></strong><small>Whole-body equivalent; not core temperature</small></div><div class="metric blue"><span>Unreplaced sweat fluid</span><strong id="fluid">0.00 <small>L</small></strong><small id="baseline-fluid"></small></div><div class="limiter"><span class="eyebrow">WORK CAPACITY LIMITED BY</span><b id="limiter"></b></div><p id="boundary" class="boundary"></p></section>`;
var playback = `<section class="playback panel"><div class="transport"><button id="play" class="primary">\u25B6 Play simulation</button><button id="restart" class="quiet">\u21B6 Restart</button><label>Speed<select id="speed"><option value="3600">1 hour / sec</option><option value="14400" selected>4 hours / sec</option><option value="86400">1 day / sec</option></select></label><span class="recorded">\u25CF Deterministic replay</span></div><label class="scrub-label">Simulation time<input id="scrub" type="range" min="0" max="604800" step="60" value="32400"/></label><div class="chart-label"><span>Heat accumulation across the run</span><span><i></i> Modified <i class="base"></i> Baseline \xB7 stops at model boundary</span></div><svg id="chart" viewBox="0 0 1000 95" preserveAspectRatio="none" role="img" aria-label="Baseline and modified recorded stored heat over time"><path id="baseline-chart"/><path id="run-chart"/><line id="cursor" x1="0" x2="0" y1="0" y2="95"/></svg><div class="chart-axis"><span>Day 1</span><span id="chart-end">Day 7</span></div></section>`;
var network = `<svg class="network" viewBox="0 0 850 470" role="img" aria-label="Model dependencies from oxygen supply to work, heat, cooling and fluid"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="currentColor"/></marker></defs><g class="edges"><path d="M191 102H307 M387 140V215 M191 245H307 M467 255H585 M659 293V350 M585 390H467 M387 428V448H690V428 M191 390H245V462H740V428"/></g><g class="moving-edges"><path d="M191 102H307 M387 140V215 M191 245H307 M467 255H585 M659 293V350 M585 390H467 M387 428V448H690V428 M191 390H245V462H740V428"/></g>${[[31, 62, "LUNG EXCHANGE", "Oxygen ceiling", "cyan"], [307, 62, "HEART & FLOW", "Delivery ceiling", "pink"], [31, 215, "MUSCLE EFFICIENCY", "Energy \u2192 useful work", "green"], [307, 215, "DELIVERED WORK", "Requested vs available", "green"], [585, 215, "PRODUCED HEAT", "Energy minus work", "warm"], [585, 350, "COOLING", "Dry + evaporation", "blue"], [307, 350, "FLUID DEFICIT", "Persists between days", "blue"], [31, 350, "WORLD & RECOVERY", "Temperature \xB7 water", "gray"]].map(([x, y, a, b, c]) => `<g transform="translate(${x} ${y})" class="node ${c}"><rect width="160" height="78" rx="9"/><text x="14" y="28">${a}</text><text class="sub" x="14" y="51">${b}</text></g>`).join("")}</svg>`;
var scene = `<div class="world-scene"><div class="sun"></div><div class="terrain far"></div><div class="terrain near"></div><div class="scene-note"><span class="eyebrow">A BODY IN ITS ENVIRONMENT</span><h2>What happens<br>after the upgrade?</h2><p>Heat and water carry into the next day.<br>Recovery is part of the experiment.</p></div><div class="person-stage">${body}</div><div class="scene-weather" id="weather">30\xB0C <span>50% humidity \xB7 activity</span></div><div class="ground"></div></div>`;
var stage = lane === "b" ? scene : lane === "c" ? network + `<div class="body-inset">${body}</div>` : `<div class="stage-heading"><span class="eyebrow">LIVE SYSTEM VIEW</span><h2>Watch the bottleneck move.</h2><p class="muted">Flow indicates activity. Heat tint indicates recorded storage.</p></div><div class="lab-body">${body}</div><div class="stage-key"><span>\u25CF Oxygen delivery</span><span>\u25CF Useful work</span><span>\u25CF Heat & cooling</span></div>`;
var titles = { a: ["A", "Systems Cockpit", "All controls, one coupled body."], b: ["B", "Life Theatre", "Watch the consequences unfold."], c: ["C", "Causal Studio", "See exactly how one change reaches another."] };
var [id, title, sub] = titles[lane];
document.querySelector("#app").innerHTML = `<header><a class="brand" href="index.html">Human <b>V2</b></a><nav><a href="a.html" ${lane === "a" ? 'aria-current="page"' : ""}>A / Cockpit</a><a href="b.html" ${lane === "b" ? 'aria-current="page"' : ""}>B / Theatre</a><a href="c.html" ${lane === "c" ? 'aria-current="page"' : ""}>C / Causal</a></nav><span class="prototype">INTERACTIVE DIRECTION PREVIEW</span></header><div class="page-title"><div><span class="eyebrow">${id} / ${title.toUpperCase()}</span><h1>${sub}</h1></div><div class="title-meta">Combine traits \u2192 simulate \u2192 inspect<br><span>Educational model \xB7 no clinical prediction</span></div></div><main>${controls}<section class="stage panel">${stage}</section>${telemetry}${environment}${playback}</main><footer>Working design prototype using energy-balance-1.0.0 / heat-fluid-1.0.0. Abstract flow is illustrative; displayed quantities come from recorded results. Environment presets and daily phases are fixed in this preview. Arbitrary phase editing is proposed for the rebuild.</footer>`;
function pointAt(result, time) {
  const t = Math.min(time, result.elapsedSeconds);
  let p = result.points[0];
  for (const x of result.points) {
    if (x.elapsedSeconds > t) break;
    p = x;
  }
  return p;
}
function line(result) {
  return result.points.map((p, i) => `${i ? "L" : "M"}${(p.elapsedSeconds / run.requestedSeconds * 1e3).toFixed(2)},${(90 - p.heatEquivalentC / 2 * 80).toFixed(2)}`).join(" ");
}
function calculate() {
  person = simulate(configuration);
  run = simulateTimeline(configuration, settings);
  baseline = simulateTimeline(BASE_CONFIGURATION, settings);
  for (const p of PARAMETERS) $(`#value-${p.id}`).textContent = `${configuration[p.id] > 0 ? "+" : ""}${configuration[p.id]}%`;
  $("#mass").textContent = `${person.massKg.toFixed(2)} kg`;
  $("#rest").textContent = `${person.restingW.toFixed(1)} W`;
  $("#validity").textContent = person.valid ? "Valid" : "Outside budget";
  $("#work-value").textContent = `${settings.requestedWorkW} W`;
  $("#limiter").textContent = run.oxygenLimiter;
  $("#scrub").max = run.requestedSeconds;
  seconds = Math.min(seconds, run.elapsedSeconds);
  $("#run-chart").setAttribute("d", line(run));
  $("#baseline-chart").setAttribute("d", line(baseline));
  $("#chart-end").textContent = `Day ${settings.days}`;
  $("#boundary").textContent = run.status === "model-boundary" ? `Model boundary at day ${(run.elapsedSeconds / 86400 + 1).toFixed(2)}. Later state is unknown.` : `Recorded ${settings.days} days. This is not a lifespan estimate.`;
  const s = SCENARIOS.find((s2) => s2.id === settings.scenarioId);
  if ($("#weather")) $("#weather").innerHTML = `${s.temperatureC}\xB0C <span>${s.humidityPercent}% humidity \xB7 activity conditions</span>`;
  render();
}
function render() {
  const p = pointAt(run, seconds), b = pointAt(baseline, seconds), hour = Math.floor(seconds / 3600) % 24, minute = Math.floor(seconds / 60) % 60;
  $("#clock").textContent = `Day ${Math.floor(seconds / 86400) + 1} \xB7 ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  $("#phase").textContent = p.phase.toUpperCase();
  $("#delivered").innerHTML = `${p.deliveredWorkW.toFixed(0)} <small>W</small>`;
  $("#baseline-work").textContent = seconds > baseline.elapsedSeconds ? "Baseline: beyond recorded boundary" : `Baseline: ${b.deliveredWorkW.toFixed(0)} W at this time`;
  $("#heat").innerHTML = `${p.heatEquivalentC.toFixed(2)} <small>\xB0C</small>`;
  $("#fluid").innerHTML = `${p.fluidDeficitL.toFixed(2)} <small>L</small>`;
  $("#baseline-fluid").textContent = seconds > baseline.elapsedSeconds ? "Baseline: later state unknown" : `Baseline: ${b.fluidDeficitL.toFixed(2)} L at this time`;
  $("#scrub").value = seconds;
  $("#cursor").setAttribute("x1", seconds / run.requestedSeconds * 1e3);
  $("#cursor").setAttribute("x2", seconds / run.requestedSeconds * 1e3);
  $("#heatGlow").setAttribute("opacity", Math.min(0.9, 0.08 + p.heatEquivalentC * 0.4));
  document.body.style.setProperty("--flow-duration", `${p.deliveredWorkW > 0 ? 1.2 : 3}s`);
  document.body.style.setProperty("--cool-opacity", Math.min(1, p.evaporativeLossW / 600).toFixed(2));
  document.body.classList.toggle("running", playing);
  document.body.classList.toggle("exerting", p.deliveredWorkW > 0);
  $("#play").textContent = playing ? "\u2161 Pause simulation" : "\u25B6 Play simulation";
}
function pause() {
  playing = false;
  render();
}
document.querySelectorAll("[data-parameter]").forEach((el) => el.addEventListener("input", () => {
  pause();
  configuration[el.dataset.parameter] = Number(el.value);
  calculate();
}));
$("#scenario").addEventListener("change", (e) => {
  pause();
  settings = scenarioSettings(e.target.value, settings.days, settings.requestedWorkW);
  $("#activity-water").value = settings.activityDrinkLPerHour;
  $("#recovery-water").value = settings.recoveryDrinkLPerHour;
  calculate();
});
for (const [id2, key] of [["work", "requestedWorkW"], ["activity-water", "activityDrinkLPerHour"], ["recovery-water", "recoveryDrinkLPerHour"], ["days", "days"]]) $("#" + id2).addEventListener("change", (e) => {
  const v = Number(e.target.value);
  if (!e.target.checkValidity() || !Number.isFinite(v)) return;
  pause();
  settings = { ...settings, [key]: v };
  calculate();
});
$("#reset").addEventListener("click", () => {
  pause();
  configuration = { ...BASE_CONFIGURATION };
  document.querySelectorAll("[data-parameter]").forEach((el) => el.value = 0);
  calculate();
});
$("#play").addEventListener("click", () => {
  if (seconds >= run.elapsedSeconds) seconds = 0;
  playing = !playing;
  lastFrame = performance.now();
  render();
});
$("#restart").addEventListener("click", () => {
  seconds = 0;
  pause();
});
$("#scrub").addEventListener("input", (e) => {
  seconds = Math.min(Number(e.target.value), run.elapsedSeconds);
  pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
function frame(now) {
  if (playing) {
    seconds = Math.min(run.elapsedSeconds, seconds + Math.min((now - lastFrame) / 1e3, 0.1) * Number($("#speed").value));
    if (seconds >= run.elapsedSeconds) playing = false;
    render();
  }
  lastFrame = now;
  requestAnimationFrame(frame);
}
calculate();
requestAnimationFrame(frame);
