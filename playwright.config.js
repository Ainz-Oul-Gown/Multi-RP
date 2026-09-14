// playwright.config.js
import { defineConfig, devices } from '@playwright/test';

try {
  process.loadEnvFile();
} catch (e) {}

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
process.env.E2E_BASE_URL = BASE_URL;

export default defineConfig({
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
  },
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.js',
  timeout: 120_000,          // каждый тест: 2 мин (AI медленный)
  expect: { timeout: 30_000 },
  fullyParallel: false,       // тесты последовательные — один аккаунт
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/e2e/reports/html', open: 'never' }],
    ['json', { outputFile: 'tests/e2e/reports/results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    headless: true,
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    // Шаг 0: Авторизация (создаёт session.json)
    {
      name: 'setup',
      testMatch: '**/00_auth.setup.js',
    },
    // Основные e2e тесты
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/session.json',
      },
      dependencies: ['setup'],
    },
  ],
  globalSetup: './tests/e2e/global-setup.js',
  globalTeardown: './tests/e2e/global-teardown.js',
});
