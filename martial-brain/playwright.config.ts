import { defineConfig, devices } from '@playwright/test';

/**
 * The sandbox ships a Chromium that may not match this Playwright release's
 * expected build number, so point at the one that exists rather than
 * downloading another. Override with CHROMIUM_PATH elsewhere; leave it unset
 * on a machine where `npx playwright install` has run.
 */
const executablePath = process.env.CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],

  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
