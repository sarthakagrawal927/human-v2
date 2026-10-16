import { BASE_CONFIGURATION, type Configuration, parseConfiguration } from "./simulator";
import table from "./us-life-table-2023.json";

export const ANNUAL_SOURCE = table;
export interface AnnualPoint {
  year: number;
  age: number;
  survival: number;
  nextYearDeathProbability: number | null;
}
export interface AnnualRun {
  version: string;
  startAge: number;
  years: number;
  configuration: Configuration;
  status: "population-reference" | "unsupported-modification";
  points: AnnualPoint[];
}

// Published period mortality, not organ aging or an intervention effect model.
// The 100+ row is open-ended and must never be treated as a one-year probability.
export function simulateAnnual(
  startAge: number,
  years: number,
  input: Configuration = BASE_CONFIGURATION,
): AnnualRun {
  if (!Number.isInteger(startAge) || startAge < 20 || startAge > 90)
    throw new Error("Starting age must be a whole number from 20 to 90.");
  if (!Number.isInteger(years) || years < 1 || startAge + years > 100)
    throw new Error("The timeline must end at or before age 100.");
  const configuration = parseConfiguration(input);
  const modified = Object.values(configuration).some((value) => value !== 0);
  if (modified)
    return {
      version: table.version,
      startAge,
      years,
      configuration,
      status: "unsupported-modification",
      points: [],
    };
  let survival = 1;
  const points: AnnualPoint[] = [];
  for (let year = 0; year <= years; year++) {
    const age = startAge + year;
    const probability = age < 100 ? table.rows[age].deathProbability : null;
    points.push({ year, age, survival, nextYearDeathProbability: probability });
    if (probability !== null) survival *= 1 - probability;
  }
  return {
    version: table.version,
    startAge,
    years,
    configuration,
    status: "population-reference",
    points,
  };
}

export function annualReplay(run: AnnualRun) {
  return JSON.stringify(
    { format: "human-v2-annual-reference-1", sourceSha256: table.sourceSha256, run },
    null,
    2,
  );
}
