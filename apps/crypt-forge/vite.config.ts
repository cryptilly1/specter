import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { specterApiPlugin } from "../../scripts/vite-spec-api";

export default defineConfig({
  plugins: [react(), specterApiPlugin()],
  server: { port: 5175, strictPort: true, host: true },
  preview: { port: 4175 },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
});
