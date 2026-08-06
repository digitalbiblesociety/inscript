import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.js$/,
  globalSetup: './tests/e2e/global-setup.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium-remote', metadata: { profile: 'remote' }, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox-remote',  metadata: { profile: 'remote' }, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-remote',   metadata: { profile: 'remote' }, use: { ...devices['Desktop Safari'] } },
    { name: 'chromium-local',  metadata: { profile: 'local' },  use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox-local',   metadata: { profile: 'local' },  use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-local',    metadata: { profile: 'local' },  use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'E2E=true pnpm exec vite --port 5173 --open false',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI && process.env.VITE_COVERAGE !== 'true',
    timeout: 120000,
    stdout: 'pipe',
  },
});
