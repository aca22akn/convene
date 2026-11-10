import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:3173";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3173",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
