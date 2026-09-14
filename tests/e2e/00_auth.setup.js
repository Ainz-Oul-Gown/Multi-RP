// tests/e2e/00_auth.setup.js
// Шаг 0: Авторизация через UI — создаёт tests/e2e/.auth/session.json
// Этот тест запускается первым (project: setup) и сохраняет cookie/storage для остальных тестов

import { test as setup, expect } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.resolve('tests/e2e/.auth/session.json');
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

const TEST_EMAIL = 'e2e_playwright_test3@multirp.test';
const TEST_PASSWORD = 'E2ePlaywright2026!';

setup('authenticate via UI', async ({ page }) => {
  page.on('console', msg => console.log('[AUTH BROWSER]', msg.text()));
  page.on('pageerror', err => console.log('[AUTH BROWSER ERR]', err.message));

  console.log('\n🔐 [Auth Setup] Opening site at:', BASE_URL);

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  // Проверяем: возможно уже в лобби
  const lobby = page.locator('#lobbyContent');
  if (await lobby.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('  ✅ Already logged in to lobby');
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  // Ждём загрузки страницы авторизации
  await expect(page.locator('#authEmail')).toBeVisible({ timeout: 30_000 });

  // Заполняем форму входа
  await page.locator('#authEmail').fill(TEST_EMAIL);
  await page.locator('#authPassword').fill(TEST_PASSWORD);
  await page.locator('#authSubmit').click();

  // Ждём перехода в лобби или появления ошибки
  try {
    await expect(page.locator('#lobbyContent')).toBeVisible({ timeout: 30_000 });
  } catch (err) {
    const errorToast = page.locator('.toast.error, .toast-error, .toast').first();
    if (await errorToast.isVisible({ timeout: 1000 }).catch(() => false)) {
      const txt = await errorToast.textContent();
      throw new Error(`Auth failed with toast message: "${txt}"`);
    }
    throw err;
  }

  console.log('  ✅ Logged in successfully');

  // Сохраняем состояние авторизации
  await page.context().storageState({ path: AUTH_FILE });
  console.log(`  ✅ Auth state saved to ${AUTH_FILE}`);
});
