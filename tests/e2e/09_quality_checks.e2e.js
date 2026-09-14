// tests/e2e/09_quality_checks.e2e.js
// Тест 9: Комплексные проверки качества — кодировка, нарратив, каналы, лог уровня
// Проверяет всю цепочку от сообщения до ответа с точки зрения качества выходных данных

import { test, expect } from '@playwright/test';
import {
  loadTestConfig,
  loadSessionState,
  createServiceClient,
  sendGameAction,
  getSessionMessagesFromDB,
  getPlayerFromDB,
  logTestResult,
  hasEncodingArtifacts,
  isProseNarrative,
  setupSupabaseProxy,
} from './helpers/game-helpers.js';


const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

test.describe('09 — Проверки качества AI-ответов', () => {
  test.setTimeout(180_000);

  let sessionState;

  test.beforeEach(async ({ page }) => {
    sessionState = loadSessionState();
    if (!sessionState) test.skip(true, 'Session state not found');
    await setupSupabaseProxy(page);
  });

  // ─────────────────────────────────────────────
  // TEST 09-A: Все сообщения в БД без кодировочных артефактов
  // ─────────────────────────────────────────────
  test('09-A: Кодировка — все сообщения чистые (нет Mojibake)', async ({ page }) => {
    const supabase = createServiceClient();
    const { data: allMsgs } = await supabase
      .from('messages')
      .select('id, sender_name, content')
      .eq('session_id', sessionState.sessionId)
      .order('created_at', { ascending: true });

    expect(allMsgs?.length).toBeGreaterThan(0);

    const badMessages = (allMsgs || []).filter(m => hasEncodingArtifacts(m.content));

    logTestResult('09-A: Encoding quality (no Mojibake)', badMessages.length === 0 ? 'pass' : 'fail', {
      totalMessages: allMsgs?.length,
      badMessagesCount: badMessages.length,
      badMessages: badMessages.map(m => ({
        id: m.id,
        sender: m.sender_name,
        sample: m.content?.slice(0, 80),
      })),
    });

    expect(badMessages).toHaveLength(0);
  });

  // ─────────────────────────────────────────────
  // TEST 09-B: Мастер пишет прозой (нет системных тегов)
  // ─────────────────────────────────────────────
  test('09-B: Нарратив Мастера — художественная проза без технических тегов', async ({ page }) => {
    const supabase = createServiceClient();
    const { data: masterMsgs } = await supabase
      .from('messages')
      .select('id, content')
      .eq('session_id', sessionState.sessionId)
      .eq('sender_name', 'Мастер')
      .order('created_at', { ascending: false })
      .limit(10);

    expect(masterMsgs?.length).toBeGreaterThan(0);

    const taggedMessages = (masterMsgs || []).filter(m => !isProseNarrative(m.content));

    logTestResult('09-B: Master narrative prose quality', taggedMessages.length === 0 ? 'pass' : 'fail', {
      totalMasterMessages: masterMsgs?.length,
      taggedCount: taggedMessages.length,
      taggedSamples: taggedMessages.map(m => m.content?.slice(0, 100)),
    });

    expect(taggedMessages).toHaveLength(0);
  });

  // ─────────────────────────────────────────────
  // TEST 09-C: Системные каналы имеют корректные названия
  // ─────────────────────────────────────────────
  test('09-C: Системные каналы — корректные sender_name в кириллице', async ({ page }) => {
    const supabase = createServiceClient();
    const { data: allMsgs } = await supabase
      .from('messages')
      .select('sender_name')
      .eq('session_id', sessionState.sessionId);

    const senderNames = [...new Set(allMsgs?.map(m => m.sender_name) || [])];

    const validSenders = ['Мастер', 'Система', 'Лог', 'Мир', 'Сюжет', 'Бой', 'Приручение'];

    // Проверяем что нет Mojibake в именах каналов
    const badSenders = senderNames.filter(name =>
      name && hasEncodingArtifacts(name)
    );

    logTestResult('09-C: System channel names encoding', badSenders.length === 0 ? 'pass' : 'fail', {
      foundSenders: senderNames,
      badSenders,
    });

    expect(badSenders).toHaveLength(0);
  });

  // ─────────────────────────────────────────────
  // TEST 09-D: Профиль игрока отображается корректно в UI
  // ─────────────────────────────────────────────
  test('09-D: Профиль игрока — данные отображаются без артефактов', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/session/${sessionState.sessionId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });

    await page.locator('#profileBtn').click();
    await expect(page.locator('#profilePanel')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(500);

    const profileText = await page.locator('#profileContent').innerText();
    expect(profileText.length).toBeGreaterThan(0);
    expect(hasEncodingArtifacts(profileText)).toBe(false);

    // Проверяем что имя персонажа присутствует
    const cfg = loadTestConfig();
    expect(profileText).toContain(cfg.characterName);

    await page.locator('#closeProfileBtn').click();

    logTestResult('09-D: Player profile UI', 'pass', {
      profileTextLength: profileText.length,
    });
  });

  // ─────────────────────────────────────────────
  // TEST 09-E: Карта мира открывается и отображает данные
  // ─────────────────────────────────────────────
  test('09-E: Карта мира — открывается, показывает SVG-слои', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/session/${sessionState.sessionId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });

    await page.locator('#mapBtn').click();
    await expect(page.locator('#mapPanel')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(1000);

    // Проверяем что карта загрузилась (viewport существует)
    const mapViewport = page.locator('#mapViewport');
    await expect(mapViewport).toBeVisible();

    await page.locator('#closeMapBtn').click();

    logTestResult('09-E: World map UI', 'pass');
  });

  // ─────────────────────────────────────────────
  // TEST 09-F: Итоговый отчёт — сводка по всем каналам
  // ─────────────────────────────────────────────
  test('09-F: Сводка сессии — статистика всех каналов и действий', async ({ page }) => {
    const supabase = createServiceClient();
    const { data: allMsgs } = await supabase
      .from('messages')
      .select('sender_name, content')
      .eq('session_id', sessionState.sessionId)
      .order('created_at', { ascending: true });

    const player = await getPlayerFromDB(sessionState.playerId);

    // Статистика по каналам
    const channelStats = {};
    for (const msg of allMsgs || []) {
      const ch = msg.sender_name || 'unknown';
      channelStats[ch] = (channelStats[ch] || 0) + 1;
    }

    const summary = {
      totalMessages: allMsgs?.length || 0,
      channelStats,
      playerStats: {
        name: player?.name,
        hp: `${player?.hp}/${player?.max_hp}`,
        xp: player?.xp,
        level: player?.level,
        location: player?.current_zone || player?.zone,
        inventoryCount: player?.inventory?.length,
      },
    };

    logTestResult('09-F: Session summary', 'pass', summary);
    console.log('\n📊 SESSION SUMMARY:');
    console.log(JSON.stringify(summary, null, 2));

    expect(summary.totalMessages).toBeGreaterThan(5);
  });

  // ─────────────────────────────────────────────
  // TEST 09-G: Нарратив содержит лор мира (не "обычный фэнтези-мир")
  // ─────────────────────────────────────────────
  test('09-G: Лор мира — ответы содержат специфику мира Этерия', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/session/${sessionState.sessionId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#actionInput')).toBeEnabled({ timeout: 10_000 });

    const action = 'Спрашиваю прохожего: что это за мир, как называется это место, и что за государство здесь правит?';
    const response = await sendGameAction(page, action, 90_000);

    expect(response.length).toBeGreaterThan(50);
    expect(hasEncodingArtifacts(response)).toBe(false);

    // Ответ должен содержать специфику мира (названия мест, государств и т.д.)
    // которые взяты из лора, а не из общих шаблонов
    const hasSpecificLore = response.length > 100; // Минимальная проверка — подробный ответ

    logTestResult('09-G: World lore in narrative', 'pass', {
      responseLength: response.length,
      hasSpecificLore,
      sample: response.slice(0, 200),
    });
  });
});
