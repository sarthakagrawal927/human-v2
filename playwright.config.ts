import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:44173",
    browserName: "chromium",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm preview",
    url: "http://127.0.0.1:44173",
    reuseExistingServer: !process.env.CI,
  },
});
