import type { D1Database, ExportedHandler } from "@cloudflare/workers-types";
import {
  BASELINE,
  CHALLENGE_ID,
  CONTEXT,
  canonicalConfiguration,
  exactKeys,
  InputError,
  objectInput,
  parseConfiguration,
  parseContext,
  simulate,
} from "../src/model/simulator";

interface Env {
  DB: D1Database;
}
interface SubmissionRow {
  id: string;
  name: string;
  configuration: string;
  context: string;
  baseline: string;
  digest: string;
  score: number;
  created_at: string;
}
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
async function digest(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (x) => x.toString(16).padStart(2, "0")).join("");
}
async function body(request: Request) {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))
    throw new InputError("Use application/json.");
  const reader = request.body?.getReader();
  if (!reader) throw new InputError("Missing submission body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new InputError("Submission exceeds 8 KB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return objectInput(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (e) {
    if (e instanceof InputError) throw e;
    throw new InputError("Submission must be valid JSON.");
  }
}
function rowValue(row: SubmissionRow) {
  return {
    id: row.id,
    name: row.name,
    configuration: JSON.parse(row.configuration),
    context: JSON.parse(row.context),
    baseline: JSON.parse(row.baseline),
    digest: row.digest,
    score: row.score,
    createdAt: row.created_at,
  };
}
async function verifyRow(row: SubmissionRow) {
  try {
    const entry = rowValue(row);
    const configuration = parseConfiguration(entry.configuration);
    parseContext(entry.context);
    const result = simulate(configuration);
    if (
      !result.valid ||
      row.id !== row.digest ||
      (await digest(canonicalConfiguration(configuration))) !== row.digest ||
      row.score !== result.score ||
      JSON.stringify(entry.baseline) !== JSON.stringify(BASELINE)
    )
      return null;
    return { entry, result, verified: true };
  } catch {
    return null;
  }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health" && request.method === "GET")
        return json({ status: "ok", context: CONTEXT });
      if (url.pathname === "/api/leaderboard" && request.method === "GET") {
        // Validate bounded pages before limiting the ranked result to 100 entries.
        const entries: ReturnType<typeof rowValue>[] = [];
        let offset = 0;
        while (entries.length < 100) {
          const { results } = await env.DB.prepare(
            "SELECT * FROM submissions ORDER BY score DESC, created_at ASC, id ASC LIMIT 100 OFFSET ?",
          )
            .bind(offset)
            .all<SubmissionRow>();
          const verified = await Promise.all(results.map(verifyRow));
          for (const row of verified) if (row && entries.length < 100) entries.push(row.entry);
          if (results.length < 100) break;
          offset += 100;
        }
        return json({
          challengeId: CHALLENGE_ID,
          context: CONTEXT,
          entries,
        });
      }
      const match = /^\/api\/submissions\/([a-f0-9]{64})$/.exec(url.pathname);
      if (match && request.method === "GET") {
        const row = await env.DB.prepare("SELECT * FROM submissions WHERE id = ?")
          .bind(match[1])
          .first<SubmissionRow>();
        if (!row) return json({ error: "Entry not found." }, 404);
        const verified = await verifyRow(row);
        if (!verified) return json({ error: "Entry failed reproducibility verification." }, 409);
        return json(verified);
      }
      if (url.pathname === "/api/submissions" && request.method === "POST") {
        const origin = request.headers.get("Origin");
        if (
          (origin && origin !== url.origin) ||
          request.headers.get("Sec-Fetch-Site") === "cross-site"
        )
          return json({ error: "Submit from this application." }, 403);
        const input = await body(request);
        exactKeys(input, ["name", "configuration", "context"]);
        if (
          typeof input.name !== "string" ||
          input.name.trim().length < 1 ||
          input.name.trim().length > 60 ||
          Array.from(input.name).some(
            (char) => char.charCodeAt(0) < 32 || char === "<" || char === ">",
          )
        )
          throw new InputError(
            "Entry name must contain 1–60 characters without markup or control characters.",
          );
        const configuration = parseConfiguration(input.configuration);
        parseContext(input.context);
        const result = simulate(configuration);
        if (!result.valid)
          return json(
            {
              error: "Configuration violates challenge constraints.",
              violations: result.violations,
            },
            422,
          );
        const hash = await digest(canonicalConfiguration(configuration));
        const createdAt = new Date().toISOString();
        const inserted = await env.DB.prepare(
          "INSERT OR IGNORE INTO submissions (id,name,configuration,context,baseline,digest,score,created_at) VALUES (?,?,?,?,?,?,?,?)",
        )
          .bind(
            hash,
            input.name.trim(),
            JSON.stringify(configuration),
            JSON.stringify(CONTEXT),
            JSON.stringify(BASELINE),
            hash,
            result.score,
            createdAt,
          )
          .run();
        const row = await env.DB.prepare("SELECT * FROM submissions WHERE id = ?")
          .bind(hash)
          .first<SubmissionRow>();
        if (!row) throw new Error("Submission persistence failed.");
        const verified = await verifyRow(row);
        if (!verified)
          return json(
            {
              error:
                "The stored entry failed reproducibility verification; it cannot be ranked or reused.",
            },
            409,
          );
        return json(
          { ...verified, duplicate: inserted.meta.changes === 0 },
          inserted.meta.changes === 0 ? 200 : 201,
        );
      }
      return json({ error: "Route or method not found." }, 404);
    } catch (e) {
      if (e instanceof InputError) return json({ error: e.message }, 400);
      console.error(
        JSON.stringify({
          event: "api.error",
          path: url.pathname,
          message: e instanceof Error ? e.message : "Unknown error",
        }),
      );
      return json({ error: "The leaderboard could not complete this request. Try again." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
