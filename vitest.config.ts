import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx", "api/**/*.test.ts", "apps/**/*.test.ts", "apps/**/*.test.tsx", "examples/**/*.test.ts", "tests/unit/**/*.test.ts"],
    exclude: ["**/node_modules/**", "tests/e2e/**"],
    globals: false,
  },
});
