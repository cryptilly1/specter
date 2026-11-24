// Bundles each serverless function in an app's server/ folder (spec.ts, assets.ts, generate.ts) into api/<name>.js.
// Vercel then deploys self-contained files, with no workspace TypeScript to resolve at runtime.
// Usage (from an app folder): node ../../scripts/bundle-api.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const dir = join(cwd, "server");
if (!existsSync(dir)) {
  console.error(`bundle-api: ${dir} not found`);
  process.exit(1);
}
const entries = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const require = createRequire(join(cwd, "package.json"));
const { build } = await import(pathToFileURL(require.resolve("vite")).href);

for (const file of entries) {
  const name = file.replace(/\.ts$/, "");
  await build({
    root: cwd,
    logLevel: "warn",
    configFile: false,
    publicDir: false,
    build: {
      ssr: join(dir, file),
      outDir: join(cwd, "api"),
      emptyOutDir: false,
      target: "node20",
      minify: false,
      rollupOptions: { output: { format: "es", entryFileNames: `${name}.js`, codeSplitting: false } },
    },
    ssr: { noExternal: true, target: "node" },
  });
  console.log(`bundle-api: wrote api/${name}.js`);
}
