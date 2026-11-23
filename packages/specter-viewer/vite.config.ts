import { defineConfig } from "vite";

// Bundles the web component with three.js into one ES module that works in any plain HTML page.
export default defineConfig({
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: () => "specter-viewer.js" },
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 2000,
  },
});
