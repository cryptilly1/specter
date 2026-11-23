import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { specterApiPlugin } from "../../scripts/vite-spec-api";

export default defineConfig({
  plugins: [react(), specterApiPlugin()],
  server: { port: 5174, host: true },
  preview: { port: 4174 },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
});
