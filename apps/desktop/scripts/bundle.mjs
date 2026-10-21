// Bundles the main and preload scripts into CommonJS and copies the built web
// UI next to them, so electron-builder packages a single self-contained folder.
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const out = here("../build");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const common = { bundle: true, platform: "node", target: "node20", format: "cjs", external: ["electron"], logLevel: "warning" };
await build({ ...common, entryPoints: [here("../src/main.ts")], outfile: `${out}/main.cjs` });
await build({ ...common, entryPoints: [here("../src/preload.ts")], outfile: `${out}/preload.cjs` });
const web = here("../../web/dist");
if (!existsSync(web)) throw new Error("apps/web/dist is missing; build @postbench/web first");
cpSync(web, `${out}/web`, { recursive: true });
cpSync(here("../icon.png"), `${out}/icon.png`);
console.log("desktop bundle ready in apps/desktop/build");
