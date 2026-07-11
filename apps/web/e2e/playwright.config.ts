import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  globalSetup: require.resolve('./global-setup'),
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Bind to localhost (not 0.0.0.0) so Next's `request.url` resolves to a
    // browser-reachable host. Stub-redirect builds its callback URL from
    // `request.url`; with -H 0.0.0.0 that becomes `http://0.0.0.0:3000/...`,
    // which Chromium cannot resolve.
    command: 'next dev -p 3000',
    cwd: '..',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
