import { defineConfig } from '@playwright/test';

process.env.PROVIDER_USAGE_REPORTING_ENABLED = 'false';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'rentcast-market-cache.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 30000,
});
