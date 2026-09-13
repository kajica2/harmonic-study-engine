import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the Harmonic Study Engine end-to-end tests.
 *
 * Boot order: `npm run build` once (Playwright runs against the built
 * `dist/`), then `npx playwright test`. The webServer block serves
 * `dist/` over a static HTTP server on a random port — no need to
 * have vite running locally.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npx serve dist -p 4173 -L --no-clipboard",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});