import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";

// Development-only binding. Never resolves a provider account or remote database.
export async function localRuntime({ persist = false } = {}) {
  const mf = new Miniflare({
    modules: true,
    scriptPath: "build/worker.js",
    compatibilityDate: "2026-07-30",
    d1Databases: { DB: "human-v2-local" },
    d1Persist: persist ? ".local/d1" : false,
  });
  const db = await mf.getD1Database("DB");
  await db.prepare(await readFile("worker/schema.sql", "utf8")).run();
  return mf;
}
