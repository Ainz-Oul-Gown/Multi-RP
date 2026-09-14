// tests/e2e/00_auth.setup.js
// Шаг 0: Авторизация — инжектирует токены из global-setup напрямую в localStorage
// Это быстрее и надёжнее чем UI логин через headless Chromium

import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const AUTH_FILE = path.resolve('tests/e2e/.auth/session.json');
const AUTH_SESSION_FILE = path.resolve('tests/e2e/.auth/auth-session.json');
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

const TEST_EMAIL = 'e2e_playwright_test3@multirp.test';
const TEST_PASSWORD = 'E2ePlaywright2026!';

// Ключ localStorage для Supabase auth (формат: sb-<project-ref>-auth-token)
const SUPABASE_STORAGE_KEY = `sb-xhzpxiiqrtmeduynqmsd-auth-token`;

setup('authenticate via UI', async ({ page }) => {
  page.on('console', msg => console.log('[AUTH BROWSER]', msg.text()));
  page.on('pageerror', err => console.log('[AUTH BROWSER ERR]', err.message));

  console.log('\n🔐 [Auth Setup] Opening site at:', BASE_URL);

  // Метод 1: Инжекция токенов из global-setup (быстро, надёжно)
  if (fs.existsSync(AUTH_SESSION_FILE)) {
    try {
      const { session } = JSON.parse(fs.readFileSync(AUTH_SESSION_FILE, 'utf8'));
      if (session?.access_token) {
        // Напрямую создаём session.json в формате Playwright storageState
        const storageState = {
          cookies: [],
          origins: [{
            origin: BASE_URL.replace(/\/$/, ''),
            localStorage: [{
              name: SUPABASE_STORAGE_KEY,
              value: JSON.stringify(session),
            }],
          }],
        };
        fs.writeFileSync(AUTH_FILE, JSON.stringify(storageState, null, 2));
        console.log('  ✅ Auth state written directly from tokens (no browser login needed)');

        // Верифицируем: открываем страницу с готовым storage и проверяем лобби
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        const isLobby = await page.locator('#lobbyContent').isVisible({ timeout: 20_000 }).catch(() => false);
        if (isLobby) {
          console.log('  ✅ Verified: lobby accessible with injected tokens');
          // Обновляем session.json с актуальным storage state из браузера
          await page.context().storageState({ path: AUTH_FILE });
          return;
        } else {
          console.log('  ⚠️ Token injection: lobby not found, trying UI login...');
        }
      }
    } catch (err) {
      console.log('  ⚠️ Token injection failed:', err.message);
    }
  }

  // Метод 2: Fallback — обычный UI логин
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
