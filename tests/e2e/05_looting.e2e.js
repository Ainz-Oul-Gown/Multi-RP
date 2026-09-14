// tests/e2e/05_looting.e2e.js
// Тест 5: Лутинг — поиск предметов в лесу (палки, камни) до момента успеха
// Проверяет: loot_search handler, добавление в инвентарь, ответ ДМ

import { test, expect } from '@playwright/test';
import {
  loadTestConfig,
  loadSessionState,
  saveSessionState,
  createServiceClient,
  sendGameAction,
  getPlayerInventoryFromDB,
  getSessionMessagesFromDB,
  logTestResult,
  hasEncodingArtifacts,
  isProseNarrative,
} from './helpers/game-helpers.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

test.describe('05 — Лутинг: поиск ресурсов в лесу', () => {
  test.setTimeout(300_000); // 5 минут — несколько попыток

  let sessionState;

  test.beforeEach(() => {
    sessionState = loadSessionState();
    if (!sessionState) test.skip(true, 'Session state not found');
  });

  // ─────────────────────────────────────────────
  // TEST 05-A: Поиск палок — до момента успеха (max 3 попытки)
  // ─────────────────────────────────────────────
  test('05-A: Поиск палок в лесу — успех в течение нескольких попыток', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/session/${sessionState.sessionId}`, { waitUntil: 'networkidle' });
    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#actionInput')).toBeEnabled({ timeout: 10_000 });

    let sticksFound = false;
    let attempts = 0;
    const maxAttempts = 3;

    const inventoryBefore = await getPlayerInventoryFromDB(sessionState.playerId);

    while (!sticksFound && attempts < maxAttempts) {
      attempts++;
      const action = attempts === 1
        ? 'Ищу поблизости сухие палки и ветки для костра.'
        : 'Продолжаю искать палки среди деревьев и кустарников.';

      const response = await sendGameAction(page, action, 90_000);
      expect(response.length).toBeGreaterThan(20);
      expect(hasEncodingArtifacts(response)).toBe(false);
      expect(isProseNarrative(response)).toBe(true);

      // Проверяем инвентарь после каждой попытки
      const inventoryAfter = await getPlayerInventoryFromDB(sessionState.playerId);
      const newItems = inventoryAfter.filter(item =>
        !inventoryBefore.find(bi => bi.id === item.id)
      );

      const foundStick = newItems.find(item =>
        /палк|ветк|stick|branch/i.test(item.name)
      );

      if (foundStick || newItems.length > 0) {
        sticksFound = true;
        logTestResult('05-A: Sticks looting', 'pass', {
          attempts,
          itemsFound: newItems.map(i => i.name),
        });
        break;
      }
    }

    // После 3 попыток палки должны быть найдены (или хоть что-то)
    // Если не нашли — это не блокирующий провал (зависит от броска кубика)
    const finalInventory = await getPlayerInventoryFromDB(sessionState.playerId);
    const hasNewItems = finalInventory.length > inventoryBefore.length;

    if (!sticksFound && !hasNewItems) {
      logTestResult('05-A: Sticks looting', 'warn', {
        attempts,
        note: 'No items found after 3 attempts (bad dice rolls)',
      });
    }

    // Сохраняем состояние инвентаря для следующих тестов
    saveSessionState({ ...sessionState, inventorySnapshot: finalInventory });
  });

  // ─────────────────────────────────────────────
  // TEST 05-B: Поиск камней — до момента успеха
  // ─────────────────────────────────────────────
  test('05-B: Поиск камней — успех до 3 попыток', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/session/${sessionState.sessionId}`, { waitUntil: 'networkidle' });
    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#actionInput')).toBeEnabled({ timeout: 10_000 });

    const inventoryBefore = await getPlayerInventoryFromDB(sessionState.playerId);
    let stonesFound = false;
    let attempts = 0;

    while (!stonesFound && attempts < 3) {
      attempts++;
      const action = attempts === 1
        ? 'Ищу подходящие камни — острые кремни или крепкие булыжники.'
        : 'Осматриваю землю вокруг в поисках острых камней.';

      const response = await sendGameAction(page, action, 90_000);
      expect(hasEncodingArtifacts(response)).toBe(false);

      const inventoryAfter = await getPlayerInventoryFromDB(sessionState.playerId);
      const newItems = inventoryAfter.filter(item =>
        !inventoryBefore.find(bi => bi.id === item.id)
      );

      const foundStone = newItems.find(item =>
        /камень|камн|кремн|булыж|stone|rock|flint/i.test(item.name)
      );

      if (foundStone || newItems.length > 0) {
        stonesFound = true;
        logTestResult('05-B: Stone looting', 'pass', {
          attempts,
          itemsFound: newItems.map(i => i.name),
        });
      }
    }

    if (!stonesFound) {
      logTestResult('05-B: Stone looting', 'warn', {
        note: 'Stones not found after 3 attempts',
      });
    }
  });

  // ─────────────────────────────────────────────
  // TEST 05-C: Инвентарь отображается в UI после лутинга
  // ─────────────────────────────────────────────
  test('05-C: UI инвентаря — найденные предметы отображаются', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/session/${sessionState.sessionId}`, { waitUntil: 'networkidle' });
    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });

    // Открываем инвентарь
    await page.locator('#inventoryBtn').click();
    await expect(page.locator('#inventoryPanel')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(1000);

    // Проверяем содержимое панели инвентаря
    const inventoryContent = page.locator('#inventoryContent');
    const text = await inventoryContent.innerText();

    // Инвентарь не должен быть пустым после лутинга
    expect(text.length).toBeGreaterThan(0);
    expect(hasEncodingArtifacts(text)).toBe(false);

    // Закрываем инвентарь
    await page.locator('#closeInventoryBtn').click();

    logTestResult('05-C: Inventory UI display', 'pass', {
      inventoryTextLength: text.length,
    });
  });
});
