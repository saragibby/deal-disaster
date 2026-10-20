import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'provider-report-ui.spec.ts',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5214', browserName: 'chromium' },
  webServer: {
    command: 'npm run dev --workspace=@deal-platform/dashboard -- --host 127.0.0.1 --port 5214 --strictPort',
    url: 'http://127.0.0.1:5214',
    reuseExistingServer: false,
    timeout: 30000,
    env: { VITE_DISABLE_ASK_WILL: 'true' },
  },
});
