// Compress a .glb for the web budget (Draco geometry, resized WebP textures, dedup, prune).
// Usage: node scripts/optimize-model.mjs input.glb [output.glb]
// Runs @gltf-transform/cli through npx, so nothing heavy is added to this repo's dependencies.
import { spawnSync } from "node:child_process";
import { basename } from "node:path";

const [input, output = input.replace(/\.glb$/i, ".opt.glb")] = process.argv.slice(2);
if (!input) {
  console.error("Usage: node scripts/optimize-model.mjs input.glb [output.glb]");
  process.exit(2);
}
console.log(`Optimizing ${basename(input)} -> ${basename(output)} (first run downloads @gltf-transform/cli)`);
const r = spawnSync("npx", ["--yes", "@gltf-transform/cli@latest", "optimize", input, output, "--compress", "draco", "--texture-compress", "webp", "--texture-size", "2048"], { stdio: "inherit" });
if (r.status !== 0) {
  console.error("Optimization failed. The original file is untouched.");
  process.exit(r.status ?? 1);
}
console.log(`Done. Check it with: node scripts/audit-model.mjs ${output}`);
