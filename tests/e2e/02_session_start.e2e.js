// tests/e2e/02_session_start.e2e.js
// Тест 2: Начало сессии — DM сообщение и начало игры в городе
// Проверяет: инициализацию мира, первое сообщение ДМ, кодировку

import { test, expect } from '@playwright/test';
import {
  loadTestConfig,
  loadSessionState,
  saveSessionState,
  createServiceClient,
  sendGameAction,
  getSessionMessagesFromDB,
  getPlayerFromDB,
  logTestResult,
  hasEncodingArtifacts,
  isProseNarrative,
} from './helpers/game-helpers.js';

const BASE_URL = process.env.E2E_BASE_URL || 'https://ainz-oul-gown.github.io/Multi-RP';

test.describe('02 — Начало сессии и первый ход ДМ', () => {
  test.setTimeout(180_000);

  let sessionState;
  const cfg = loadTestConfig();

  test.beforeEach(async ({ page }) => {
    sessionState = loadSessionState();
    if (!sessionState) test.skip(true, 'Session state not found — run 01 tests first');
  });

  // ─────────────────────────────────────────────
  // TEST 02-A: Переход в игровой экран
  // ─────────────────────────────────────────────
  test('02-A: Игровой экран загружается, чат видим', async ({ page }) => {
    await page.goto(`${BASE_URL}/#game/${sessionState.sessionId}`, { waitUntil: 'networkidle' });

    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#actionInput')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#sendBtn')).toBeVisible({ timeout: 10_000 });

    logTestResult('02-A: Game screen loads', 'pass');
  });

  // ─────────────────────────────────────────────
  // TEST 02-B: ДМ пишет стартовое сообщение "начало игры"
  // ─────────────────────────────────────────────
  test('02-B: Первый ход — ДМ описывает начало приключения в городе', async ({ page }) => {
    await page.goto(`${BASE_URL}/#game/${sessionState.sessionId}`, { waitUntil: 'networkidle' });
    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#actionInput')).toBeEnabled({ timeout: 10_000 });

    // Пишем первое сообщение ДМу
    const action = 'Мастер, начни игру. Я нахожусь в таверне «Пьяный гоблин» в Серебряной Гавани. Опиши обстановку и ближайших НПС.';
    const response = await sendGameAction(page, action, 90_000);

    // Проверяем что ответ не пустой
    expect(response.length).toBeGreaterThan(50);

    // Проверяем отсутствие кодировочных артефактов
    expect(hasEncodingArtifacts(response)).toBe(false);

    // Проверяем что ответ написан прозой
    expect(isProseNarrative(response)).toBe(true);

    // Проверяем через БД что сообщения сохранились
    const dbMsgs = await getSessionMessagesFromDB(sessionState.sessionId, 5);
    expect(dbMsgs.length).toBeGreaterThan(0);

    // Находим сообщение Мастера
    const masterMsg = dbMsgs.find(m => m.sender_name === 'Мастер');
    expect(masterMsg).toBeTruthy();
    expect(masterMsg.content).toBeTruthy();
    expect(hasEncodingArtifacts(masterMsg.content)).toBe(false);

    logTestResult('02-B: DM start message', 'pass', {
      responseLength: response.length,
      dbMessagesCount: dbMsgs.length,
      hasMasterMessage: !!masterMsg,
    });
  });
});
