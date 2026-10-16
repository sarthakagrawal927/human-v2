import { describe, expect, it } from "vitest";
import { explainWorkloadChange } from "../src/model/diagnosis";
import { BASE_CONFIGURATION, BASE_RESULT, simulate } from "../src/model/simulator";

describe("recorded score explanations", () => {
  it("explains the non-limiting lung upgrade's regression and resting cost", () => {
    const run = simulate({ ...BASE_CONFIGURATION, exchange: 20 });
    const explanation = explainWorkloadChange(run, BASE_RESULT);
    expect(explanation).toContain("fell from 225.00 to 224.50 W");
    expect(explanation).toContain("Heart delivery now sets the ceiling");
    expect(explanation).toContain("rose from 100.00 to 102.00 W");
    expect(explanation).toContain("Lung exchange gained 59.50 W");
  });
  it("uses the selected experiment as reference rather than assuming baseline", () => {
    const reference = simulate({ ...BASE_CONFIGURATION, exchange: 20 });
    const explanation = explainWorkloadChange(BASE_RESULT, reference);
    expect(explanation).toContain("rose from 224.50 to 225.00 W");
    expect(explanation).toContain("fell from 102.00 to 100.00 W");
    expect(explanation).not.toContain("Lung exchange gained");
  });
  it("reports tied limits and actual efficiency rather than the parameter delta", () => {
    const heart = simulate({ ...BASE_CONFIGURATION, pumping: 20 });
    const cooled = simulate({ ...heart.configuration, cooling: 20 });
    expect(explainWorkloadChange(cooled, heart)).toContain("Heart delivery and Lung exchange");
    const efficient = simulate({ ...cooled.configuration, efficiency: 10 });
    expect(explainWorkloadChange(efficient, cooled)).toContain("25.00% to 27.50%");
    expect(explainWorkloadChange(efficient, efficient)).toBe(
      "Workload stays at 300.00 W; mechanical capacity sets the ceiling.",
    );
  });
});
