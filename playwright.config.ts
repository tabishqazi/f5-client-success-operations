import { defineConfig, devices } from "@playwright/test";
import { existsSync } from 'node:fs';

if(existsSync('.env.local'))process.loadEnvFile('.env.local');
if(!process.env.PLAYWRIGHT_BASE_URL && (!process.env.TEST_RUNTIME_DATABASE_URL || !new URL(process.env.TEST_RUNTIME_DATABASE_URL).pathname.endsWith('_test'))){
  throw new Error('Browser tests require a dedicated TEST_RUNTIME_DATABASE_URL ending in _test. Run db:setup and db:migrate:test first.');
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 2,
  expect: { timeout: 10000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 } } },
    { name: "phone-390", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "phone-360", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 800 } } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: { APP_ORIGIN: 'http://127.0.0.1:3100', DATABASE_URL: process.env.TEST_RUNTIME_DATABASE_URL! },
  },
});
