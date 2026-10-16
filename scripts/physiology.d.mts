import type { PhysiologyComparison } from "../src/model/physiology";
export class PhysiologyError extends Error {
  status: number;
  constructor(status: number, message: string);
}
export function simulatePhysiology(input: unknown): Promise<PhysiologyComparison>;
