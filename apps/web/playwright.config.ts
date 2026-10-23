import { defineConfig, devices } from "@playwright/test";

/*
 * End-to-end tests drive the real web app against the real API on an in-memory database.
 * Run `pnpm --filter @restourant/web build` first; the web server uses the production build.
 */

const API_PORT = 3101;
const WEB_PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    trace: "retain-on-failure",
    // Lets the tests use a preinstalled Chromium when the bundled revision isn't downloaded.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
    {
      name: "tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, hasTouch: true },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @restourant/api exec tsx src/server.ts",
      url: `http://localhost:${API_PORT}/health`,
      env: {
        NODE_ENV: "test",
        DATABASE_URL: "pglite:memory",
        JWT_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e",
        PORT: String(API_PORT),
        LOG_LEVEL: "warn",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm exec next start --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/login`,
      env: { API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
