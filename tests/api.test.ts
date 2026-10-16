import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, expect, it } from "vitest";
import { BASE_CONFIGURATION, CONTEXT, simulate } from "../src/model/simulator";

let runtime: Miniflare;
beforeAll(async () => {
  await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    outfile: "build/test-worker.js",
  });
  runtime = new Miniflare({
    modules: true,
    scriptPath: "build/test-worker.js",
    compatibilityDate: "2026-07-30",
    d1Databases: { DB: "test-db" },
  });
  const db = await runtime.getD1Database("DB");
  await db.prepare(await readFile("worker/schema.sql", "utf8")).run();
});
afterAll(async () => {
  await runtime?.dispose();
});
const request = (value: unknown, headers: Record<string, string> = {}) =>
  runtime.dispatchFetch("http://local.test/api/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(value),
  });
const payload = {
  name: "Reproducible experiment",
  configuration: { ...BASE_CONFIGURATION, pumping: 20, cooling: 20, efficiency: 10 },
  context: CONTEXT,
};
it("computes and persists scores server-side and replays the exact entry", async () => {
  const response = await request(payload);
  expect(response.status).toBe(201);
  const data = (await response.json()) as {
    entry: { id: string; score: number; digest: string; configuration: typeof BASE_CONFIGURATION };
  };
  expect(data.entry.score).toBe(simulate(payload.configuration).score);
  expect(data.entry.id).toBe(data.entry.digest);
  const replay = await runtime.dispatchFetch(`http://local.test/api/submissions/${data.entry.id}`);
  const verified = (await replay.json()) as { verified: boolean; result: { score: number } };
  expect(verified.verified).toBe(true);
  expect(verified.result.score).toBe(data.entry.score);
  const duplicate = await request({ ...payload, name: "Duplicate" });
  expect(duplicate.status).toBe(200);
  expect(((await duplicate.json()) as { duplicate: boolean }).duplicate).toBe(true);
});
it("rejects forgery, invalid constraints, changed conditions, and malformed input", async () => {
  expect((await request({ ...payload, score: 9999 })).status).toBe(400);
  expect(
    (
      await request({
        ...payload,
        configuration: { ...BASE_CONFIGURATION, pumping: 50, cooling: 50, efficiency: 20 },
      })
    ).status,
  ).toBe(422);
  expect((await request({ ...payload, context: { ...CONTEXT, modelVersion: "old" } })).status).toBe(
    400,
  );
  expect(
    (await request({ ...payload, configuration: { ...payload.configuration, pumping: 21 } }))
      .status,
  ).toBe(400);
  expect((await request({ ...payload, name: "<script>" })).status).toBe(400);
  expect((await request(payload, { Origin: "https://other.example" })).status).toBe(403);
  expect((await request({ ...payload, name: "x".repeat(9000) })).status).toBe(400);
});
it("ranks only valid entries using full precision and consistent context", async () => {
  await request({ name: "Baseline", configuration: BASE_CONFIGURATION, context: CONTEXT });
  const response = await runtime.dispatchFetch("http://local.test/api/leaderboard");
  const data = (await response.json()) as {
    entries: { score: number; configuration: typeof BASE_CONFIGURATION }[];
  };
  expect(data.entries).toHaveLength(2);
  expect(data.entries[0].score).toBeGreaterThan(data.entries[1].score);
  expect(data.entries.every((x) => simulate(x.configuration).valid)).toBe(true);
});
it("detects a stored score modified independently of its recorded configuration", async () => {
  const db = await runtime.getD1Database("DB");
  const { results } = await db
    .prepare("SELECT id FROM submissions WHERE score = 100")
    .all<{ id: string }>();
  await db.prepare("UPDATE submissions SET score=999 WHERE id=?").bind(results[0].id).run();
  expect(
    (await runtime.dispatchFetch(`http://local.test/api/submissions/${results[0].id}`)).status,
  ).toBe(409);
  const leaderboard = await runtime.dispatchFetch("http://local.test/api/leaderboard");
  const data = (await leaderboard.json()) as { entries: { id: string }[] };
  expect(data.entries.some((e) => e.id === results[0].id)).toBe(false);
  expect(
    (
      await request({
        name: "Corrupt duplicate",
        configuration: BASE_CONFIGURATION,
        context: CONTEXT,
      })
    ).status,
  ).toBe(409);
});
it("excludes old-version rows instead of silently ranking them under new conditions", async () => {
  const db = await runtime.getD1Database("DB");
  await db
    .prepare("UPDATE submissions SET context=? WHERE score > 100 AND score < 999")
    .bind(JSON.stringify({ ...CONTEXT, modelVersion: "old-version" }))
    .run();
  const response = await runtime.dispatchFetch("http://local.test/api/leaderboard");
  expect(((await response.json()) as { entries: unknown[] }).entries).toEqual([]);
});
