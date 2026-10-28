import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  use: { baseURL: 'http://localhost:3123', viewport: { width: 1440, height: 900 } },
  webServer: { command: 'pnpm start -p 3123', url: 'http://localhost:3123', reuseExistingServer: true, timeout: 120_000 },
});
