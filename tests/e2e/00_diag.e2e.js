// tests/e2e/00_diag.e2e.js — базовый smoke тест загрузки игры
import { test, expect } from '@playwright/test';
import { setupSupabaseProxy, loadSessionState } from './helpers/game-helpers.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

test.describe('00 — Smoke: загрузка игры', () => {
  test.setTimeout(60_000);

  test('00-1: игровой чат загружается за 30с', async ({ page }) => {
    const sessionState = loadSessionState();
    if (!sessionState) test.skip(true, 'Session state not found');

    await setupSupabaseProxy(page);
    await page.goto(`${BASE_URL}/#/session/${sessionState.sessionId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });
  });
});
