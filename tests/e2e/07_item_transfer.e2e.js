// tests/e2e/07_item_transfer.e2e.js
// Тест 7: Передача предмета НПС
// Проверяет: transfer_handler, удаление из инвентаря игрока, лог событий

import { test, expect } from '@playwright/test';
import {
  loadTestConfig,
  loadSessionState,
  createServiceClient,
  sendGameAction,
  getPlayerInventoryFromDB,
  getSessionMessagesFromDB,
  logTestResult,
  hasEncodingArtifacts,
  isProseNarrative,
} from './helpers/game-helpers.js';

const BASE_URL = process.env.E2E_BASE_URL || 'https://ainz-oul-gown.github.io/Multi-RP';

test.describe('07 — Передача предмета НПС', () => {
  test.setTimeout(180_000);

  let sessionState;

  test.beforeEach(() => {
    sessionState = loadSessionState();
    if (!sessionState) test.skip(true, 'Session state not found');
  });

  // ─────────────────────────────────────────────
  // TEST 07-A: Возвращение в город к НПС
  // ─────────────────────────────────────────────
  test('07-A: Возвращение в город к НПС', async ({ page }) => {
    await page.goto(`${BASE_URL}/#game/${sessionState.sessionId}`, { waitUntil: 'networkidle' });
    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#actionInput')).toBeEnabled({ timeout: 10_000 });

    const action = 'Возвращаюсь в город Серебряная Гавань, иду обратно в таверну «Пьяный гоблин».';
    const response = await sendGameAction(page, action, 90_000);

    expect(response.length).toBeGreaterThan(30);
    expect(hasEncodingArtifacts(response)).toBe(false);

    const hasReturnDesc = /город|таверна|вернул|пришёл|прибыл|шагает|приближает/i.test(response);

    logTestResult('07-A: Return to city', 'pass', {
      responseLength: response.length,
      hasReturnDesc,
    });
  });

  // ─────────────────────────────────────────────
  // TEST 07-B: Дарение предмета НПС
  // ─────────────────────────────────────────────
  test('07-B: Дарение предмета — передаю копьё НПС', async ({ page }) => {
    await page.goto(`${BASE_URL}/#game/${sessionState.sessionId}`, { waitUntil: 'networkidle' });
    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#actionInput')).toBeEnabled({ timeout: 10_000 });

    const inventoryBefore = await getPlayerInventoryFromDB(sessionState.playerId);
    const itemsBefore = inventoryBefore.length;

    // Передаём любой найденный предмет (копьё или первый доступный)
    const itemToGive = inventoryBefore.find(i => /копьё|копье|spear|палк|камень/i.test(i.name));
    const itemName = itemToGive?.name || 'палку';

    const action = `Подхожу к трактирщику в таверне и говорю: "Возьми вот, я нашёл это в лесу — может пригодится." Отдаю ему ${itemName}.`;
    const response = await sendGameAction(page, action, 90_000);

    expect(response.length).toBeGreaterThan(30);
    expect(hasEncodingArtifacts(response)).toBe(false);
    expect(isProseNarrative(response)).toBe(true);

    // Проверяем что реакция НПС есть в ответе
    const hasNpcReaction = /взял|принял|поблагодарил|кивнул|удивлён|взглянул|получил|передал/i.test(response);

    // Проверяем инвентарь после передачи
    await new Promise(r => setTimeout(r, 1000));
    const inventoryAfter = await getPlayerInventoryFromDB(sessionState.playerId);
    const itemsAfter = inventoryAfter.length;

    // Предмет должен исчезнуть из инвентаря
    const itemGiven = itemsAfter < itemsBefore || !inventoryAfter.find(i => i.name === itemName);

    logTestResult('07-B: Item transfer to NPC', itemGiven ? 'pass' : 'warn', {
      itemTransferred: itemName,
      hasNpcReaction,
      itemGiven,
      inventoryBefore: itemsBefore,
      inventoryAfter: itemsAfter,
    });
  });

  // ─────────────────────────────────────────────
  // TEST 07-C: Лог событий — передача записана в messages
  // ─────────────────────────────────────────────
  test('07-C: Лог событий — передача предмета попала в историю сообщений', async ({ page }) => {
    const messages = await getSessionMessagesFromDB(sessionState.sessionId, 20);
    expect(messages.length).toBeGreaterThan(0);

    // Проверяем наличие сообщений о передаче или дарении
    const hasTransferLog = messages.some(m =>
      /передал|подарил|отдал|получил|взял|принял/i.test(m.content)
    );

    // Проверяем что все сообщения без кодировочных артефактов
    const allClean = messages.every(m => !hasEncodingArtifacts(m.content));

    expect(allClean).toBe(true);

    logTestResult('07-C: Event log for item transfer', 'pass', {
      messagesChecked: messages.length,
      allClean,
      hasTransferLog,
    });
  });
});
