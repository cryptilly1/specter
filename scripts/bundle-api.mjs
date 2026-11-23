// Bundles an app's serverless function (server/spec.ts) with its dependencies into api/spec.js.
// Vercel then deploys a single self-contained file, with no workspace TypeScript to resolve at runtime.
// Usage (from an app folder): node ../../scripts/bundle-api.mjs
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const entry = join(cwd, "server/spec.ts");
if (!existsSync(entry)) {
  console.error(`bundle-api: ${entry} not found`);
  process.exit(1);
}
const require = createRequire(join(cwd, "package.json"));
const { build } = await import(pathToFileURL(require.resolve("vite")).href);

await build({
  root: cwd,
  logLevel: "warn",
  configFile: false,
  publicDir: false,
  build: {
    ssr: entry,
    outDir: join(cwd, "api"),
    emptyOutDir: false,
    target: "node20",
    minify: false,
    rollupOptions: {
      output: { format: "es", entryFileNames: "spec.js", codeSplitting: false },
    },
  },
  ssr: { noExternal: true, target: "node" },
});
console.log("bundle-api: wrote api/spec.js");
