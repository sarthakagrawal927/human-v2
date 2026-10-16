import { readFile, stat } from "node:fs/promises";
import { createServer as httpServer } from "node:http";
import path from "node:path";
import { build, context } from "esbuild";
import { createServer as viteServer } from "vite";
import { physiologyBuild, workerBuild } from "./build-worker.mjs";
import { localRuntime } from "./runtime.mjs";

const preview = process.argv.includes("--preview");
const port = preview ? 44173 : 5317;
await Promise.all([build(workerBuild), build(physiologyBuild)]);
const { simulatePhysiology, PhysiologyError } = await import("./physiology.mjs");
const mf = await localRuntime({ persist: true });
const watcher = preview
  ? null
  : await context({
      ...workerBuild,
      plugins: [
        {
          name: "local-worker-reload",
          setup(builder) {
            builder.onEnd(async (result) => {
              if (!result.errors.length)
                await mf.setOptions({
                  modules: true,
                  scriptPath: "build/worker.js",
                  compatibilityDate: "2026-07-30",
                  d1Databases: { DB: "human-v2-local" },
                  d1Persist: ".local/d1",
                });
            });
          },
        },
      ],
    });
await watcher?.watch();
const vite = preview
  ? null
  : await viteServer({ server: { middlewareMode: true, host: "127.0.0.1" }, appType: "spa" });
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".map": "application/json",
};
const server = httpServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/api/")) {
      const host = req.headers.host ?? `127.0.0.1:${port}`;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value.join(",") : value);
      }
      const data = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8192) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Submission exceeds 8 KB." }));
          return;
        }
        data.push(chunk);
      }
      if (url.pathname === "/api/physiology") {
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json", Allow: "POST" });
          res.end(JSON.stringify({ error: "Use POST to simulate a body." }));
          return;
        }
        try {
          let input;
          try {
            input = JSON.parse(Buffer.concat(data).toString());
          } catch {
            throw new PhysiologyError(400, "Expected JSON body settings.");
          }
          const record = await simulatePhysiology(input);
          res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          res.end(JSON.stringify(record));
        } catch (error) {
          res.writeHead(error instanceof PhysiologyError ? error.status : 500, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          res.end(
            JSON.stringify({
              error:
                error instanceof PhysiologyError
                  ? error.message
                  : "Physiology simulation failed; no result was generated.",
            }),
          );
        }
        return;
      }
      const response = await mf.dispatchFetch(`http://${host}${req.url}`, {
        method: req.method,
        headers,
        body: data.length ? Buffer.concat(data) : undefined,
      });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (vite) {
      vite.middlewares(req, res);
      return;
    }
    const root = path.resolve("dist");
    let filename = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!filename.startsWith(`${root}${path.sep}`) && filename !== root) {
      res.writeHead(400);
      res.end("Invalid path");
      return;
    }
    try {
      if (!(await stat(filename)).isFile()) filename = path.join(root, "index.html");
    } catch {
      filename = path.join(root, "index.html");
    }
    res.writeHead(200, {
      "Content-Type": mime[path.extname(filename)] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(await readFile(filename));
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    if (!res.headersSent) res.writeHead(500);
    res.end("Local preview error.");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Human V2 ${preview ? "preview" : "development"}: http://127.0.0.1:${port} (local D1 only)`,
  ),
);
server.on("error", async (error) => {
  console.error(error.message);
  await vite?.close();
  await watcher?.dispose();
  await mf.dispose();
  process.exit(1);
});
async function stop() {
  server.close();
  await vite?.close();
  await watcher?.dispose();
  await mf.dispose();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
