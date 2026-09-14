// tests/e2e/00_auth.setup.js
// Шаг 0: Авторизация через UI — создаёт tests/e2e/.auth/session.json
// Этот тест запускается первым (project: setup) и сохраняет cookie/storage для остальных тестов

import { test as setup, expect } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.resolve('tests/e2e/.auth/session.json');
const BASE_URL = process.env.E2E_BASE_URL || 'https://ainz-oul-gown.github.io/Multi-RP';

const TEST_EMAIL = 'e2e_playwright_test@multirp.test';
const TEST_PASSWORD = 'E2ePlaywright2026!';

setup('authenticate via UI', async ({ page }) => {
  console.log('\n🔐 [Auth Setup] Opening site and logging in...');

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Ждём загрузки страницы авторизации
  await expect(page.locator('#authEmail')).toBeVisible({ timeout: 30_000 });

  // Заполняем форму входа
  await page.locator('#authEmail').fill(TEST_EMAIL);
  await page.locator('#authPassword').fill(TEST_PASSWORD);
  await page.locator('#authSubmit').click();

  // Ждём перехода в лобби (признак успешного входа)
  await expect(page.locator('#lobbyContent')).toBeVisible({ timeout: 30_000 });

  console.log('  ✅ Logged in successfully');

  // Сохраняем состояние авторизации
  await page.context().storageState({ path: AUTH_FILE });
  console.log(`  ✅ Auth state saved to ${AUTH_FILE}`);
});
