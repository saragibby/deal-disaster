import { defineConfig } from '@playwright/test';

process.env.PROVIDER_USAGE_REPORTING_ENABLED = 'false';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['geocoding-usage.spec.ts', 'rentcast-usage.spec.ts', 'rentcast-diagnostics.spec.ts', 'rentcast-property-records.spec.ts', 'provider-usage.spec.ts', 'provider-cache-correctness.spec.ts', 'google-usage.spec.ts', 'similar-properties.spec.ts', 'reanalysis-backfill.spec.ts', 'analysis-datasets.spec.ts', 'rentcast-bundle.spec.ts', 'provider-usage-reporting.spec.ts', 'mtr-nearby.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
});
