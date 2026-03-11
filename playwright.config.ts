import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  /* Start all dev servers before running tests */
  webServer: [
    {
      command: 'SMTP_HOST=127.0.0.1 SMTP_PORT=1025 SMTP_SECURE=false SMTP_USER=test SMTP_PASS=test npm run dev:server',
      url: 'http://localhost:3002/api/auth/user',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: 'npm run dev:dashboard',
      url: 'http://localhost:5200',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: 'npm run dev:game',
      url: 'http://localhost:5201',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
