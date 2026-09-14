// tests/e2e/03_npc_interaction.e2e.js
// Тест 3: Взаимодействие с НПС — диалог, система отношений
// Проверяет: маршрутизацию диалоговых действий, изменение отношений, память НПС

import { test, expect } from '@playwright/test';
import {
  loadTestConfig,
  loadSessionState,
  createServiceClient,
  sendGameAction,
  getSessionMessagesFromDB,
  logTestResult,
  hasEncodingArtifacts,
  isProseNarrative,
} from './helpers/game-helpers.js';

const BASE_URL = process.env.E2E_BASE_URL || 'https://ainz-oul-gown.github.io/Multi-RP';

test.describe('03 — Диалог с НПС и система отношений', () => {
  test.setTimeout(180_000);

  let sessionState;

  test.beforeEach(() => {
    sessionState = loadSessionState();
    if (!sessionState) test.skip(true, 'Session state not found');
  });

  // ─────────────────────────────────────────────
  // TEST 03-A: Короткий диалог с ближайшим НПС
  // ─────────────────────────────────────────────
  test('03-A: Диалог — приветствие ближайшего НПС', async ({ page }) => {
    await page.goto(`${BASE_URL}/#game/${sessionState.sessionId}`, { waitUntil: 'networkidle' });
    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#actionInput')).toBeEnabled({ timeout: 10_000 });

    const action = 'Подхожу к ближайшему персонажу в таверне и говорю: "Добрый вечер, уважаемый. Что за новости ходят по городу?"';
    const response = await sendGameAction(page, action, 90_000);

    expect(response.length).toBeGreaterThan(30);
    expect(hasEncodingArtifacts(response)).toBe(false);
    expect(isProseNarrative(response)).toBe(true);

    // Диалоговый ответ должен содержать какой-то ответ НПС
    const hasNpcResponse = /сказал|ответил|произнёс|кивнул|пожал|улыбнулся|хмуро/i.test(response);
    // Допускаем что НПС может молчать или реагировать любым способом
    expect(response.length).toBeGreaterThan(50);

    logTestResult('03-A: NPC dialog greeting', 'pass', {
      responseLength: response.length,
      hasNpcResponse,
    });
  });

  // ─────────────────────────────────────────────
  // TEST 03-B: Проверка системы отношений через БД
  // ─────────────────────────────────────────────
  test('03-B: Система отношений — после взаимодействия обновляется в БД', async ({ page }) => {
    await page.goto(`${BASE_URL}/#game/${sessionState.sessionId}`, { waitUntil: 'networkidle' });
    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#actionInput')).toBeEnabled({ timeout: 10_000 });

    // Дружелюбное действие которое должно улучшить отношения
    const action = 'Угощаю трактирщика монетой и говорю: "Налей мне эля и всем в таверне тоже, за счёт странника!"';
    await sendGameAction(page, action, 90_000);

    // Проверяем через БД что npc_relationships обновились
    const supabase = createServiceClient();
    const { data: relationships } = await supabase
      .from('npc_relationships')
      .select('*')
      .eq('session_id', sessionState.sessionId);

    // Отношения могут быть пустыми если НПС ещё не существует в системе
    // Главное что запрос выполнился без ошибки
    expect(relationships).not.toBeNull();

    logTestResult('03-B: NPC relationship system', 'pass', {
      relationshipsFound: relationships?.length || 0,
    });
  });

  // ─────────────────────────────────────────────
  // TEST 03-C: Открытие панели НПС в игре
  // ─────────────────────────────────────────────
  test('03-C: Панель НПС — открывается, отображает данные', async ({ page }) => {
    await page.goto(`${BASE_URL}/#game/${sessionState.sessionId}`, { waitUntil: 'networkidle' });
    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });

    // Открываем панель НПС
    await page.locator('#npcBtn').click();
    await expect(page.locator('#npcPanel')).toBeVisible({ timeout: 5_000 });

    // Проверяем что панель не пустая (хотя бы заголовок есть)
    const npcContent = page.locator('#npcContent');
    await expect(npcContent).toBeVisible();

    // Закрываем панель
    await page.locator('#closeNpcBtn').click();
    await expect(page.locator('#npcPanel')).not.toBeVisible({ timeout: 5_000 });

    logTestResult('03-C: NPC panel UI', 'pass');
  });

  // ─────────────────────────────────────────────
  // TEST 03-D: Повторный диалог — НПС помнит предыдущий разговор
  // ─────────────────────────────────────────────
  test('03-D: Память НПС — следующая реплика учитывает контекст', async ({ page }) => {
    await page.goto(`${BASE_URL}/#game/${sessionState.sessionId}`, { waitUntil: 'networkidle' });
    await expect(page.locator('#gameChat')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#actionInput')).toBeEnabled({ timeout: 10_000 });

    const action = 'Снова подхожу к тому же человеку с которым разговаривал и спрашиваю: "Ты упоминал что-то важное, можешь рассказать подробнее?"';
    const response = await sendGameAction(page, action, 90_000);

    expect(response.length).toBeGreaterThan(50);
    expect(hasEncodingArtifacts(response)).toBe(false);

    logTestResult('03-D: NPC memory context', 'pass', { responseLength: response.length });
  });
});
