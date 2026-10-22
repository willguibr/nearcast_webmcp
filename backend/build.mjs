import { build } from "esbuild";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const commit = process.env.CI_COMMIT_SHA || process.env.BUILD_COMMIT || execFileSync("git", ["rev-parse", "HEAD"], {encoding:"utf8"}).trim();

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
await build({
  entryPoints: ["src/handlers/api.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "dist/index.mjs",
  sourcemap: false,
  minify: false,
  legalComments: "none",
  define: { "process.env.APP_VERSION": JSON.stringify(commit) },
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
writeFileSync("dist/release.json", JSON.stringify({commit}) + "\n");
