// Copies the Draco decoder next to an app so GLBs with Draco compression load offline.
// Usage (from an app folder): node ../../scripts/copy-draco.mjs
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  join(root, "packages/specter-core/node_modules/three/examples/jsm/libs/draco/gltf"),
  join(root, "node_modules/three/examples/jsm/libs/draco/gltf"),
];
const src = candidates.find((p) => existsSync(p));
if (!src) {
  console.error("copy-draco: could not find three's Draco decoder. Run pnpm install first.");
  process.exit(1);
}
const dest = join(process.cwd(), "public", "draco");
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`copy-draco: ${src} -> ${dest}`);
