import { defineConfig } from "@playwright/test";
const port = Number(process.env.LOCALDESIGN_TEST_PORT ?? 4179);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("LOCALDESIGN_TEST_PORT must be an integer from 1 to 65535.");
const baseURL = `http://127.0.0.1:${port}/LocalDesign/`;
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run preview -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
