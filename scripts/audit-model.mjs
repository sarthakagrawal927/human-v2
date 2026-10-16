import { writeFileSync } from "node:fs";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/model/simulator.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { simulate, BASE_CONFIGURATION, PARAMETERS, CONTEXT } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
let evaluated = 0;
let valid = 0;
let top = -Infinity;
let winners = [];
let restBetter = 0;
const violations = {};
const limiting = {};
let invariantFailures = 0;
let validityMismatches = 0;

function inspect(configuration) {
  const r = simulate(configuration);
  evaluated++;
  const c = configuration;
  // Reconstruct use from the published coefficients, independent of returned ceilings.
  const rest = 100 + PARAMETERS.reduce((s, p) => s + (c[p.id] / 100) * p.restCost, 0);
  const mass = 70 + PARAMETERS.reduce((s, p) => s + (c[p.id] / 100) * p.massCost, 0);
  const eta = 0.25 * (1 + c.efficiency / 100);
  const supply = Math.min(
    1000 * (1 + c.pumping / 100),
    1200 * (1 + c.exchange / 100),
    1300 * (1 + c.transport / 100),
  );
  const pressure = 1250 * (1 + c.transport / 100) ** 2;
  const cooling = 800 * (1 + c.cooling / 100);
  const mechanical = 300 * (1 + c.power / 100);
  const demand = rest + r.workloadW / eta;
  const heat = rest + r.workloadW * (1 / eta - 1);
  if (
    demand > supply + 1e-7 ||
    demand > pressure + 1e-7 ||
    heat > cooling + 1e-7 ||
    r.workloadW > mechanical + 1e-7 ||
    Math.abs(heat + r.workloadW - demand) > 1e-7
  )
    invariantFailures++;
  const expectedValid =
    Math.abs(mass / 70 - 1) <= 0.05 + 1e-9 &&
    Math.abs(rest / 100 - 1) <= 0.05 + 1e-9 &&
    rest + 180 / eta <= Math.min(supply, pressure) + 1e-7 &&
    rest + 180 * (1 / eta - 1) <= cooling + 1e-7 &&
    180 <= mechanical + 1e-7;
  if (r.valid !== expectedValid) validityMismatches++;
  for (const v of r.violations) violations[v.id] = (violations[v.id] || 0) + 1;
  if (!r.valid) return;
  valid++;
  for (const x of r.limiting) limiting[x.id] = (limiting[x.id] || 0) + 1;
  if (r.score > top + 1e-8) {
    top = r.score;
    winners = [{ ...c }];
  } else if (Math.abs(r.score - top) < 1e-8) winners.push({ ...c });
  if (r.score > 100 && r.rest.economyScore >= 100) restBetter++;
}

function walk(index, configuration, used) {
  if (index === PARAMETERS.length) return inspect(configuration);
  const p = PARAMETERS[index];
  for (let value = p.min; value <= p.max; value += 5) {
    if (used + (value !== 0) > 3) continue;
    configuration[p.id] = value;
    walk(index + 1, configuration, used + (value !== 0));
  }
}
walk(0, { ...BASE_CONFIGURATION }, 0);
const singles = PARAMETERS.map((p) => {
  const c = { ...BASE_CONFIGURATION, [p.id]: p.id === "efficiency" ? 10 : 20 };
  const r = simulate(c);
  return {
    parameter: p.id,
    delta: c[p.id],
    score: r.score,
    restScore: r.rest.economyScore,
    valid: r.valid,
    limit: r.limiting.map((x) => x.id),
    violations: r.violations.map((x) => x.id),
  };
});
const report = {
  context: CONTEXT,
  evaluated,
  valid,
  top,
  winners: winners.length,
  exampleWinners: winners.slice(0, 8),
  restBetter,
  violations,
  limiting,
  invariantFailures,
  validityMismatches,
  singles,
};
writeFileSync("artifacts/playtest/model-sweep.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify({
    evaluated,
    valid,
    top,
    winners: winners.length,
    invariantFailures,
    validityMismatches,
  }),
);
if (invariantFailures || validityMismatches) process.exitCode = 1;
