import { writeFileSync } from "node:fs";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/model/timeline.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const {
  simulateTimeline,
  scenarioSettings,
  editableRoutine,
  compareTimelines,
  exportTimelineReplay,
  importTimelineReplay,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const base = { pumping: 0, exchange: 0, transport: 0, power: 0, efficiency: 0, cooling: 0 };
const parameters = Object.keys(base);
const configurations = [base];
for (const parameter of parameters)
  for (const value of parameter === "efficiency" ? [-20, 10, 20] : [-30, 20, 50])
    configurations.push({ ...base, [parameter]: value });
let seed = 1927401;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
for (let i = 0; i < 80; i++) {
  const c = { ...base };
  for (const parameter of parameters)
    c[parameter] =
      parameter === "efficiency"
        ? Math.floor(random() * 9) * 5 - 20
        : Math.floor(random() * 17) * 5 - 30;
  configurations.push(c);
}
const failures = [];
let evaluated = 0;
let boundaries = 0;
let maxHeatResidualJ = 0;
let maxWaterResidualL = 0;
let maxStepTimeDifferenceSeconds = 0;
let maxStepHeatDifferenceC = 0;
let maxStepWaterDifferenceL = 0;
for (const configuration of configurations) {
  for (const scenario of ["temperate", "hot-shift", "scarce-water"]) {
    for (const work of [0, 180, 250]) {
      const source = scenarioSettings(scenario, 7, work);
      const count = 2 + Math.floor(random() * 7);
      let units = 96;
      const phases = Array.from({ length: count }, (_, i) => {
        const remaining = count - i - 1;
        const amount = remaining ? 1 + Math.floor(random() * (units - remaining)) : units;
        units -= amount;
        const kind = ["rest", "activity", "recovery"][i % 3];
        return {
          id: `phase-${i + 1}`,
          kind,
          hours: amount / 4,
          temperatureC: 10 + Math.floor(random() * 31),
          humidityPercent: 10 + Math.floor(random() * 81),
          requestedWorkW: kind === "activity" ? work : 0,
          drinkLPerHour: [0, 0.02, 0.25, 0.5, 1.1, 1.5][Math.floor(random() * 6)],
        };
      });
      const settings = editableRoutine(source, phases);
      const run = simulateTimeline(configuration, settings);
      evaluated++;
      if (run.boundary) boundaries++;
      const heatResidual = Math.abs(run.producedHeatJ - run.removedHeatJ - run.final.excessHeatJ);
      const waterResidual = Math.abs(run.sweatL - run.replacedL - run.final.fluidDeficitL);
      maxHeatResidualJ = Math.max(maxHeatResidualJ, heatResidual);
      maxWaterResidualL = Math.max(maxWaterResidualL, waterResidual);
      const invalid =
        heatResidual > 0.02 ||
        waterResidual > 1e-8 ||
        Math.abs(run.metabolicJ - run.deliveredWorkJ - run.producedHeatJ) > 0.02 ||
        run.elapsedSeconds > run.requestedSeconds + 1e-7 ||
        run.peakHeatEquivalentC > 2 + 1e-8 ||
        run.peakFluidDeficitPercent > 4 + 1e-8 ||
        run.points.some(
          (x) =>
            !Number.isFinite(x.excessHeatJ) || x.excessHeatJ < -1e-6 || x.fluidDeficitL < -1e-8,
        );
      if (invalid) failures.push({ configuration, settings, reason: "conservation/domain" });
      if (
        run.phases.some(
          (p, i) => i > 0 && JSON.stringify(p.start) !== JSON.stringify(run.phases[i - 1].end),
        )
      )
        failures.push({ configuration, settings, reason: "phase continuity" });
      const shorter = simulateTimeline(configuration, settings, 15);
      const dt = Math.abs(run.elapsedSeconds - shorter.elapsedSeconds);
      const dh = Math.abs(run.peakHeatEquivalentC - shorter.peakHeatEquivalentC);
      const dw = Math.abs(run.final.fluidDeficitL - shorter.final.fluidDeficitL);
      maxStepTimeDifferenceSeconds = Math.max(maxStepTimeDifferenceSeconds, dt);
      maxStepHeatDifferenceC = Math.max(maxStepHeatDifferenceC, dh);
      maxStepWaterDifferenceL = Math.max(maxStepWaterDifferenceL, dw);
      if (dt > 120 || dh > 0.03 || dw > 0.02 || shorter.status !== run.status)
        failures.push({ configuration, settings, reason: "step convergence", dt, dh, dw });
    }
  }
}
const hot = scenarioSettings("hot-shift", 30);
const baseline = simulateTimeline(base, hot);
const cooling = simulateTimeline({ ...base, cooling: 20 }, hot);
const matched = compareTimelines(cooling, baseline);
const scarce = simulateTimeline(base, scenarioSettings("scarce-water", 30));
const recovered = simulateTimeline(base, {
  ...scenarioSettings("scarce-water", 30),
  recoveryDrinkLPerHour: 0.25,
});
const longReplay = exportTimelineReplay(base, editableRoutine(scenarioSettings("temperate", 90)));
const replay = importTimelineReplay(longReplay);
const report = {
  scope:
    "Seeded editable-phase audit across 2–8 phases, joint traits, 10–40C, 10–90% RH, workload and replacement. Numerical verification, not biological validation.",
  seed: 1927401,
  configurations: configurations.length,
  evaluated,
  boundaries,
  maxHeatResidualJ,
  maxWaterResidualL,
  maxStepTimeDifferenceSeconds,
  maxStepHeatDifferenceC,
  maxStepWaterDifferenceL,
  failures,
  examples: {
    hotBaseline: {
      status: baseline.status,
      seconds: baseline.elapsedSeconds,
      boundary: baseline.boundary,
    },
    coolingUpgrade: {
      status: cooling.status,
      sharedSeconds: matched.sharedSeconds,
      matchedStoredHeatChangeKJ:
        (matched.sharedRun.final.excessHeatJ - matched.sharedReference.final.excessHeatJ) / 1000,
      matchedSweatChangeL: matched.sharedRun.sweatL - matched.sharedReference.sweatL,
    },
    scarceWater: {
      status: scarce.status,
      seconds: scarce.elapsedSeconds,
      boundary: scarce.boundary,
    },
    adequateRecovery: { status: recovered.status, final: recovered.final },
    ninetyDayReplay: {
      bytes: Buffer.byteLength(longReplay),
      reproducedSeconds: replay.run.elapsedSeconds,
    },
  },
};
writeFileSync("artifacts/playtest/routine-audit.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify({
    evaluated,
    failures: failures.length,
    maxHeatResidualJ,
    maxWaterResidualL,
    maxStepTimeDifferenceSeconds,
    maxStepHeatDifferenceC,
    maxStepWaterDifferenceL,
    examples: report.examples,
  }),
);
if (failures.length) process.exitCode = 1;
