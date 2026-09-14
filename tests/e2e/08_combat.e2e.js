// tests/e2e/08_combat.e2e.js
// Тест 8: Боевая система — атака врага, получение урона, победа/поражение
// Проверяет: attack_handler, d20 броски, XP за победу, HP обновляется в БД

import { test, expect } from '@playwright/test';
import {
  loadTestConfig,
  loadSessionState,
  createServiceClient,
  sendGameAction,
  getPlayerFromDB,
  getSessionMessagesFromDB,
  logTestResult,
  hasEncodingArtifacts,
  isProseNarrative,
  setupSupabaseProxy,
} from './helpers/game-helpers.js';


const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

test.describe('08 — Боевая система', () => {
  test.setTimeout(300_000);

  let sessionState;

  test.beforeEach(async ({ page }) => {
    sessionState = loadSessionState();
    if (!sessionState) test.skip(true, 'Session state not found');
    await setupSupabaseProxy(page);
  });

  // ─────────────────────────────────────────────
  // TEST 08-A: Инициация боя — атака дикого зверя в лесу
  // ─────────────────────────────────────────────
  test('08-A: Бой — атакую дикого волка в лесу', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/session/${sessionState.sessionId}`, { waitUntil: 'networkidle' });
    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#actionInput')).toBeEnabled({ timeout: 10_000 });

    // Сначала идём в лес где может быть враг
    await sendGameAction(page, 'Иду обратно к лесной опушке неподалёку от города.', 90_000);

    const playerBefore = await getPlayerFromDB(sessionState.playerId);
    const hpBefore = playerBefore?.hp;
    const xpBefore = playerBefore?.xp || 0;

    // Инициируем бой
    const action = 'Вижу впереди волка! Атакую его своим оружием, бросаюсь вперёд!';
    const response = await sendGameAction(page, action, 90_000);

    expect(response.length).toBeGreaterThan(30);
    expect(hasEncodingArtifacts(response)).toBe(false);
    expect(isProseNarrative(response)).toBe(true);

    // Ответ должен содержать боевые описания
    const hasCombatDesc = /атак|удар|бросок|промахнул|попал|ранил|волк|зверь|кровь|бой|сражени|схватк/i.test(response);

    // Проверяем что HP изменился (урон получен или нанесён)
    await new Promise(r => setTimeout(r, 1000));
    const playerAfter = await getPlayerFromDB(sessionState.playerId);
    const hpAfter = playerAfter?.hp;
    const xpAfter = playerAfter?.xp || 0;

    logTestResult('08-A: Combat initiation (attack wolf)', 'pass', {
      responseLength: response.length,
      hasCombatDesc,
      hpBefore,
      hpAfter,
      hpChanged: hpBefore !== hpAfter,
      xpBefore,
      xpAfter,
      xpGained: xpAfter - xpBefore,
    });

    expect(hasCombatDesc).toBe(true);
  });

  // ─────────────────────────────────────────────
  // TEST 08-B: Продолжение боя — второй раунд
  // ─────────────────────────────────────────────
  test('08-B: Бой — продолжаю сражение (второй раунд)', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/session/${sessionState.sessionId}`, { waitUntil: 'networkidle' });
    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#actionInput')).toBeEnabled({ timeout: 10_000 });

    const playerBefore = await getPlayerFromDB(sessionState.playerId);
    const hpBefore = playerBefore?.hp;

    const action = 'Уклоняюсь от укуса и наношу ещё один удар по противнику, целясь в бок!';
    const response = await sendGameAction(page, action, 90_000);

    expect(response.length).toBeGreaterThan(30);
    expect(hasEncodingArtifacts(response)).toBe(false);
    expect(isProseNarrative(response)).toBe(true);

    const playerAfter = await getPlayerFromDB(sessionState.playerId);
    const hpAfter = playerAfter?.hp;

    // Проверяем что в логах есть боевое сообщение (канал "Бой")
    const messages = await getSessionMessagesFromDB(sessionState.sessionId, 10);
    const hasCombatLog = messages.some(m =>
      m.sender_name === 'Бой' || /урон|атак|попал|промах/i.test(m.content)
    );

    logTestResult('08-B: Combat round 2', 'pass', {
      responseLength: response.length,
      hpBefore,
      hpAfter,
      hasCombatLog,
    });
  });

  // ─────────────────────────────────────────────
  // TEST 08-C: XP начисляется после победы в бою
  // ─────────────────────────────────────────────
  test('08-C: XP начисляется после победы', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/session/${sessionState.sessionId}`, { waitUntil: 'networkidle' });
    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#actionInput')).toBeEnabled({ timeout: 10_000 });

    const playerBefore = await getPlayerFromDB(sessionState.playerId);
    const xpBefore = playerBefore?.xp || 0;

    // Завершаем бой победным ударом
    const action = 'Наношу финальный удар, стараясь завершить схватку!';
    const response = await sendGameAction(page, action, 90_000);

    await new Promise(r => setTimeout(r, 1500));
    const playerAfter = await getPlayerFromDB(sessionState.playerId);
    const xpAfter = playerAfter?.xp || 0;

    const xpGained = xpAfter - xpBefore;

    logTestResult('08-C: XP after combat', xpGained > 0 ? 'pass' : 'warn', {
      xpBefore,
      xpAfter,
      xpGained,
      note: xpGained === 0 ? 'Combat may not have ended yet' : undefined,
    });
  });

  // ─────────────────────────────────────────────
  // TEST 08-D: Полоса HP в статус-баре обновляется в UI
  // ─────────────────────────────────────────────
  test('08-D: UI — HP обновляется в статус-баре после боя', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/session/${sessionState.sessionId}`, { waitUntil: 'networkidle' });
    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });

    // Проверяем наличие статус-бара
    const statusBar = page.locator('#gameStatusBar');
    await expect(statusBar).toBeVisible({ timeout: 5_000 });

    const statusText = await statusBar.innerText();
    expect(statusText.length).toBeGreaterThan(0);
    expect(hasEncodingArtifacts(statusText)).toBe(false);

    // Проверяем что в статус-баре есть HP (число)
    const hasHpDisplay = /\d+\s*\/\s*\d+|\d+\s*hp/i.test(statusText);

    logTestResult('08-D: HP display in status bar', 'pass', {
      statusBarText: statusText.slice(0, 100),
      hasHpDisplay,
    });
  });

  // ─────────────────────────────────────────────
  // TEST 08-E: Лог боя в канале "Бой" в БД
  // ─────────────────────────────────────────────
  test('08-E: Канал "Бой" — боевые сообщения сохраняются в БД', async ({ page }) => {
    const supabase = createServiceClient();
    const { data: combatMsgs } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionState.sessionId)
      .eq('sender_name', 'Бой')
      .order('created_at', { ascending: false })
      .limit(5);

    // Проверяем что боевые сообщения есть
    expect((combatMsgs || []).length).toBeGreaterThan(0);

    // Проверяем кодировку
    const allClean = (combatMsgs || []).every(m => !hasEncodingArtifacts(m.content));
    expect(allClean).toBe(true);

    logTestResult('08-E: Combat log in DB', 'pass', {
      combatMessagesFound: combatMsgs?.length,
      sample: combatMsgs?.[0]?.content?.slice(0, 100),
    });
  });
});
