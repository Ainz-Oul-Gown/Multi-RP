// tests/e2e/00_auth.setup.js
// Шаг 0: Авторизация — инжектирует токены через addInitScript (ДО навигации)
// Supabase читает localStorage при инициализации — токены уже там = мгновенный вход

import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const AUTH_FILE = path.resolve('tests/e2e/.auth/session.json');
const AUTH_SESSION_FILE = path.resolve('tests/e2e/.auth/auth-session.json');
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

const TEST_EMAIL = 'e2e_playwright_test3@multirp.test';
const TEST_PASSWORD = 'E2ePlaywright2026!';

// Ключ localStorage для Supabase auth
const SUPABASE_STORAGE_KEY = `sb-xhzpxiiqrtmeduynqmsd-auth-token`;

setup('authenticate via UI', async ({ page }) => {
  page.on('console', msg => console.log('[AUTH BROWSER]', msg.text()));
  page.on('pageerror', err => console.log('[AUTH BROWSER ERR]', err.message));

  console.log('\n🔐 [Auth Setup] Opening site at:', BASE_URL);

  // Метод 1: addInitScript — инжектируем токены ДО загрузки страницы
  // Это самый надёжный способ: Supabase инициализируется и сразу видит токены
  if (fs.existsSync(AUTH_SESSION_FILE)) {
    try {
      const { session } = JSON.parse(fs.readFileSync(AUTH_SESSION_FILE, 'utf8'));
      if (session?.access_token) {
        console.log('  🔑 Injecting auth tokens via addInitScript...');

        // Добавляем скрипт инициализации — он запускается ПЕРЕД любым JS на странице
        await page.addInitScript(({ key, value }) => {
          localStorage.setItem(key, value);
        }, { key: SUPABASE_STORAGE_KEY, value: JSON.stringify(session) });

        // Открываем страницу — Supabase найдёт токены в localStorage сразу
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

        // Ждём лобби (токены уже в localStorage — должно открыться быстро)
        const isLobby = await page.locator('#lobbyContent')
          .isVisible({ timeout: 25_000 })
          .catch(() => false);

        if (isLobby) {
          console.log('  ✅ Logged in via token injection (addInitScript)');
          await page.context().storageState({ path: AUTH_FILE });
          console.log(`  ✅ Auth state saved to ${AUTH_FILE}`);
          return;
        }

        console.log('  ⚠️ Token injection did not result in lobby — checking current state...');
        const currentUrl = page.url();
        const bodyText = await page.locator('body').innerText().catch(() => '');
        console.log('  Current URL:', currentUrl);
        console.log('  Body preview:', bodyText.slice(0, 200));
      }
    } catch (err) {
      console.log('  ⚠️ Token injection failed:', err.message);
    }
  } else {
    console.log('  ⚠️ auth-session.json not found, will try UI login');
  }

  // Метод 2: Fallback — обычный UI логин
  console.log('  🔄 Trying UI login fallback...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  // Проверяем: возможно уже в лобби
  const lobby = page.locator('#lobbyContent');
  if (await lobby.isVisible({ timeout: 5000 }).catch(() => false)) {
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
