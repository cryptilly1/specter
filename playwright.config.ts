import { defineConfig } from "@playwright/test";

// Run against local dev servers by default. Set SPECTER_LF_URL, SPECTER_HW_URL and SPECTER_CF_URL to test deployed apps.
const remote = Boolean(process.env.SPECTER_LF_URL || process.env.SPECTER_HW_URL || process.env.SPECTER_CF_URL || process.env.SPECTER_ST_URL);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: remote ? 1 : 0,
  reporter: [["list"]],
  use: {
    acceptDownloads: true,
    headless: true,
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  webServer: remote
    ? undefined
    : [
        { command: "pnpm --filter learnforge dev", url: "http://localhost:5173", reuseExistingServer: true, timeout: 120_000 },
        { command: "pnpm --filter haunthouse-walk dev", url: "http://localhost:5174", reuseExistingServer: true, timeout: 120_000 },
        { command: "pnpm --filter crypt-forge dev", url: "http://localhost:5175", reuseExistingServer: true, timeout: 120_000 },
        { command: "pnpm --filter studio dev", url: "http://localhost:5178", reuseExistingServer: true, timeout: 120_000 },
      ],
});
