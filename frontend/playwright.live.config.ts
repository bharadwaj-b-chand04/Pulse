import { defineConfig, devices } from "@playwright/test";

// Live demo spine. Needs the Compose stack already up (`docker compose up
// --build -d --wait` from the repo root) and hits the real API through
// Caddy on port 80 — nothing is mocked here, unlike playwright.config.ts.
export default defineConfig({
  testDir: "./e2e-live",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
