import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run dev -- --port 4173',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  use: { baseURL, trace: 'on-first-retry' }
});
