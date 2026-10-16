import { expect, it, vi } from "vitest";
import { BASE_BODY } from "../src/model/physiology";

const state = vi.hoisted(() => {
  let fail: (reason: Error) => void = () => {};
  const gate = new Promise<void>((_, reject) => {
    fail = reject;
  });
  return { gate, fail, spawn: vi.fn() };
});
vi.mock("node:fs/promises", () => ({
  access: () => state.gate,
  mkdtemp: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock("node:child_process", () => ({ spawn: state.spawn }));
vi.mock("../build/physiology.js", async () => await import("../src/model/physiology"));

it("reserves the native slot before async I/O, deduplicates concurrent inputs and releases the slot on runtime failure", async () => {
  const { simulatePhysiology } = await import("../scripts/physiology.mjs");
  const first = simulatePhysiology(BASE_BODY).catch((e) => e);
  const identical = simulatePhysiology({ ...BASE_BODY }).catch((e) => e);
  await expect(simulatePhysiology({ ...BASE_BODY, surface: 20 })).rejects.toMatchObject({
    status: 429,
  });
  state.fail(new Error("Isolated test: native runtime unavailable"));
  const [a, b] = await Promise.all([first, identical]);
  expect(a).toBe(b);
  expect(a.status).toBe(503);
  expect(state.spawn).not.toHaveBeenCalled();
  await expect(simulatePhysiology(BASE_BODY)).rejects.toMatchObject({ status: 503 });
  await expect(simulatePhysiology({ ...BASE_BODY, surface: 999 })).rejects.toMatchObject({
    status: 400,
  });
});
