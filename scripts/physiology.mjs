import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_BODY, PHYSIOLOGY_VERSION, PULSE_SHA, parsePhysiology } from "../build/physiology.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = path.join(root, ".local/pulse-venv/bin/python");
const runtime = path.join(root, ".local/pulse-runtime");
const adapter = path.join(root, "scripts/physiology.py");
const reference = path.join(root, "artifacts/research/pulse/baseline.patient.json");
const cache = new Map();
const pending = new Map();
let running = false;
export class PhysiologyError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export async function simulatePhysiology(input) {
  let config;
  try {
    config = parsePhysiology(input);
  } catch (error) {
    throw new PhysiologyError(400, error.message);
  }
  const key = JSON.stringify(config);
  if (cache.has(key)) return cache.get(key);
  if (pending.has(key)) return pending.get(key);
  if (running)
    throw new PhysiologyError(
      429,
      "Another physiology experiment is running. Try again when it finishes.",
    );
  // Reserve synchronously, before any filesystem await, so simultaneous HTTP
  // requests cannot both launch native engines or bypass same-input deduplication.
  running = true;
  const job = (async () => {
    try {
      await Promise.all([access(python), access(runtime), access(reference)]);
    } catch {
      throw new PhysiologyError(
        503,
        "The qualified local Pulse runtime is unavailable. See README for setup; no substitute scores were generated.",
      );
    }
    const baselineConfig = { ...BASE_BODY, exercise: config.exercise, pressure: config.pressure };
    const baselineKey = JSON.stringify(baselineConfig);
    const folder = await mkdtemp(path.join(root, ".local/physiology-"));
    const adapterSha = createHash("sha256")
      .update(await readFile(adapter))
      .update(await readFile(reference))
      .digest("hex");
    const baseline =
      cache.get(baselineKey)?.baseline ?? (await runEngine(baselineConfig, folder, "baseline"));
    const baselineResult = {
      version: PHYSIOLOGY_VERSION,
      sourceSha: PULSE_SHA,
      adapterSha,
      configuration: baselineConfig,
      baseline,
      modified: baseline,
    };
    remember(baselineKey, baselineResult);
    const modified = key === baselineKey ? baseline : await runEngine(config, folder, "modified");
    const result = {
      version: PHYSIOLOGY_VERSION,
      sourceSha: PULSE_SHA,
      adapterSha,
      configuration: config,
      baseline,
      modified,
    };
    remember(key, result);
    return result;
  })();
  pending.set(key, job);
  try {
    return await job;
  } finally {
    running = false;
    pending.delete(key);
  }
}
function remember(key, result) {
  if (cache.size >= 12 && !cache.has(key)) cache.delete(cache.keys().next().value);
  cache.set(key, result);
}
async function runEngine(config, folder, name) {
  const input = path.join(folder, `${name}-input.json`);
  const output = path.join(folder, `${name}.json`);
  await writeFile(input, JSON.stringify(config));
  await new Promise((resolve, reject) => {
    const child = spawn(
      python,
      [adapter, "--input", input, "--out", output, "--reference", reference],
      {
        cwd: runtime,
        env: {
          ...process.env,
          PYTHONPATH: `${root}/.local/pulse-build/install/python:${root}/.local/pulse-build/install/bin`,
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let detail = "";
    child.stderr.on("data", (chunk) => {
      if (detail.length < 4000) detail += chunk.toString();
    });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, 90_000);
    child.on("error", () => {
      clearTimeout(timeout);
      reject(new PhysiologyError(503, "Unable to start the qualified local physiology engine."));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0 && !timedOut) resolve();
      else {
        console.error(
          `Pulse experiment failed (${timedOut ? "timeout" : code}): ${detail.slice(-1200)}`,
        );
        reject(
          new PhysiologyError(
            422,
            timedOut
              ? "Engine timed out; no valid result was produced."
              : "The engine could not complete this body configuration. No score or fatal outcome was inferred.",
          ),
        );
      }
    });
  });
  const result = JSON.parse(await readFile(output, "utf8"));
  if (
    result.git_hash !== PULSE_SHA.slice(0, 7) ||
    result.version !== "4.4.0" ||
    result.stopped ||
    result.rows.length !== 19 ||
    result.dense_rows.length !== 1500 ||
    JSON.stringify(result.configuration) !== JSON.stringify(config)
  )
    throw new PhysiologyError(422, "Engine output failed its version or completeness check.");
  return result;
}
