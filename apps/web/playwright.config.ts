import { defineConfig, devices } from "@playwright/test";

/*
 * End-to-end tests drive the real web app against the real API.
 * Run `pnpm --filter @restourant/web build` first; the web server uses the production build.
 *
 * Two modes:
 * - default: a standalone API on an in-memory database, the web app proxies to it (API_URL);
 * - E2E_DATABASE_URL set: the API runs embedded in the web app against that (migrated) Postgres,
 *   exactly as on Vercel.
 */

const API_PORT = 3101;
const WEB_PORT = 3100;
const JWT_SECRET = "e2e-secret-e2e-secret-e2e-secret-e2e";
const embeddedDatabase = process.env.E2E_DATABASE_URL;
/** The platform admin of the e2e run (see the admin test). */
const PLATFORM_ADMIN_EMAILS = "admin-desktop@twentyreserve.test,admin-tablet@twentyreserve.test";

const standaloneApi = {
  command: "pnpm --filter @restourant/api exec tsx src/server.ts",
  url: `http://localhost:${API_PORT}/health`,
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "pglite:memory",
    JWT_SECRET,
    PORT: String(API_PORT),
    LOG_LEVEL: "warn",
    TRUST_PROXY: "true",
    PLATFORM_ADMIN_EMAILS,
  },
  reuseExistingServer: false,
  timeout: 60_000,
};

const web = {
  command: `pnpm exec next start --port ${WEB_PORT}`,
  url: `http://localhost:${WEB_PORT}/login`,
  env: embeddedDatabase
    ? { DATABASE_URL: embeddedDatabase, JWT_SECRET, LOG_LEVEL: "warn", PLATFORM_ADMIN_EMAILS }
    : { API_URL: `http://localhost:${API_PORT}` },
  reuseExistingServer: false,
  timeout: 60_000,
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  // Cold servers on CI can take a few seconds for the first pages after sign-up.
  expect: { timeout: 10_000 },
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
  webServer: embeddedDatabase ? [web] : [standaloneApi, web],
});
