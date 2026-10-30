import { defineConfig, devices } from '@playwright/test';

// End-to-end tests against the local stack: `supabase start`, then `npm run test:e2e`.
// Auth emails are read from Mailpit (default) or scripts/dev-mail-sink.mjs (E2E_MAIL=sink).
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run dev', url: 'http://localhost:3000/sign-in', reuseExistingServer: true, timeout: 120_000 },
});
