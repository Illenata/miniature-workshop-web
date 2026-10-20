// Bundles the server into dist/. Workspace packages (@mw/*) ship as TypeScript
// source, so they are bundled in; every npm dependency stays external.
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith("@mw/"));

await build({
  entryPoints: ["src/server.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external,
  logLevel: "info",
});
