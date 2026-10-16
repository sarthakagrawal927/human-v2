import { build } from "esbuild";

export const workerBuild = {
  entryPoints: ["worker/index.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: "build/worker.js",
  sourcemap: true,
};
export const physiologyBuild = {
  entryPoints: ["src/model/physiology.ts"],
  outfile: "build/physiology.js",
  platform: "node",
  format: "esm",
  bundle: true,
};
if (process.argv[1]?.endsWith("build-worker.mjs"))
  await Promise.all([build(workerBuild), build(physiologyBuild)]);
