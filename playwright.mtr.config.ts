import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'mtr-nearby-ui.spec.ts',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5215', browserName: 'chromium' },
  webServer: {
    command: 'npm run preview --workspace=@deal-platform/property-analyzer -- --host 127.0.0.1 --port 5215 --strictPort',
    url: 'http://127.0.0.1:5215/property-analyzer/',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
