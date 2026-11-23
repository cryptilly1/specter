// Builds <specter-viewer> and copies the bundle next to the LearnForge app so /embed/ works in production.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
execSync("pnpm --filter specter-viewer build", { cwd: root, stdio: "inherit" });
const src = join(root, "packages/specter-viewer/dist/specter-viewer.js");
if (!existsSync(src)) {
  console.error("copy-viewer: bundle missing after build");
  process.exit(1);
}
const dest = join(process.cwd(), "public", "embed");
mkdirSync(dest, { recursive: true });
copyFileSync(src, join(dest, "specter-viewer.js"));
console.log(`copy-viewer: -> ${dest}/specter-viewer.js`);
