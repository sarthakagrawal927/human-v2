import { compareResults, type SimulationResult } from "./simulator";

/** Explain recorded operands; this does not change scores or assert unmodelled biology. */
export function explainWorkloadChange(result: SimulationResult, reference: SimulationResult) {
  const comparison = compareResults(result, reference);
  const delta = result.workloadW - reference.workloadW;
  const limits = result.limiting.map((x) => x.label.toLowerCase()).join(" and ");
  const sentences = [
    Math.abs(delta) < 1e-8
      ? `Workload stays at ${result.workloadW.toFixed(2)} W; ${limits} sets the ceiling.`
      : `Workload ${delta > 0 ? "rose" : "fell"} from ${reference.workloadW.toFixed(2)} to ${result.workloadW.toFixed(2)} W. ${result.limiting.map((x) => x.label).join(" and ")} now sets the ceiling.`,
  ];
  if (Math.abs(result.restingW - reference.restingW) > 1e-8) {
    sentences.push(
      `Resting demand ${result.restingW > reference.restingW ? "rose" : "fell"} from ${reference.restingW.toFixed(2)} to ${result.restingW.toFixed(2)} W; this ${result.restingW > reference.restingW ? "uses more" : "frees"} of the energy available for work and heat removal.`,
    );
  }
  if (Math.abs(result.efficiency - reference.efficiency) > 1e-8) {
    sentences.push(
      `Muscle efficiency changed from ${(reference.efficiency * 100).toFixed(2)}% to ${(result.efficiency * 100).toFixed(2)}%, changing energy and heat required per watt of work.`,
    );
  }
  const unused = comparison.ceilings.filter(
    (x) => x.deltaW > 1e-8 && x.workW > result.workloadW + 1e-8,
  );
  for (const ceiling of unused.slice(0, 2)) {
    sentences.push(
      `${ceiling.label} gained ${ceiling.deltaW.toFixed(2)} W of capacity but remains above the binding ceiling, so this extra capacity cannot raise the current workload.`,
    );
  }
  return sentences.join(" ");
}
