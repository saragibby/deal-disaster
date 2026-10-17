import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['geocoding-usage.spec.ts', 'rentcast-usage.spec.ts', 'rentcast-property-records.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
});
