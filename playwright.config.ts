import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4179/LocalDesign/",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview",
    url: "http://127.0.0.1:4179/LocalDesign/",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
