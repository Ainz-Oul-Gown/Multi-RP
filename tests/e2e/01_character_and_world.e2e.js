// tests/e2e/01_character_and_world.e2e.js
// Тест 1: Создание персонажа, импорт мира Этерия, создание сессии
// Каждый it() = отдельная проверяемая функция

import { test, expect } from '@playwright/test';
import path from 'path';
import {
  loadTestConfig,
  saveSessionState,
  createServiceClient,
  logTestResult,
} from './helpers/game-helpers.js';

const BASE_URL = process.env.E2E_BASE_URL || 'https://ainz-oul-gown.github.io/Multi-RP';

test.describe('01 — Создание персонажа и импорт мира', () => {
  test.setTimeout(180_000);

  const cfg = loadTestConfig();

  // ─────────────────────────────────────────────
  // TEST 01-A: Страница лобби загружается
  // ─────────────────────────────────────────────
  test('01-A: Лобби загружается после входа', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await expect(page.locator('#lobbyContent')).toBeVisible({ timeout: 30_000 });

    // Проверяем основные разделы
    await expect(page.locator('#signOutBtn')).toBeVisible();

    logTestResult('01-A: Lobby loads', 'pass');
  });

  // ─────────────────────────────────────────────
  // TEST 01-B: Создание персонажа с генерацией статов AI
  // ─────────────────────────────────────────────
  test('01-B: Создание персонажа — заполнение формы и генерация статов', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await expect(page.locator('#lobbyContent')).toBeVisible({ timeout: 30_000 });

    // Переключаемся на вкладку Персонажей
    const charTab = page.locator('[data-tab="characters"], .tab-btn').filter({ hasText: /персонаж|character/i }).first();
    await charTab.click();
    await page.waitForTimeout(500);

    // Открываем модалку создания персонажа
    const newCharBtn = page.locator('button').filter({ hasText: /создать персонажа|новый персонаж|new char/i }).first();
    await newCharBtn.click();
    await expect(page.locator('#newCharModal')).toBeVisible({ timeout: 5_000 });

    // Заполняем форму
    await page.locator('#charName').fill(cfg.characterName);
    await page.locator('#charRace').fill('Человек');
    await page.locator('#charClass').fill('Следопыт');
    await page.locator('#charAppearance').fill('Высокий темноволосый мужчина в дорожном плаще, с коротким мечом на поясе.');
    await page.locator('#charBio').fill('Странник из северных земель, умелый охотник и следопыт. Предпочитает действовать тихо.');

    // Нажимаем "Сгенерировать статы AI"
    await page.locator('#generateStatsBtn').click();

    // Ждём пока AI заполнит статы (кнопка должна вернуться в нормальное состояние)
    await expect(page.locator('#generateStatsBtn')).not.toHaveAttribute('disabled', { timeout: 30_000 });
    await page.waitForTimeout(500);

    // Проверяем что хотя бы один стат заполнен (не 0 и не пустой)
    const strValue = await page.locator('#stat_STR').inputValue();
    const intValue = parseInt(strValue);
    expect(intValue).toBeGreaterThan(0);
    expect(intValue).toBeLessThanOrEqual(20);

    // Сохраняем персонажа
    const createBtn = page.locator('#newCharForm button[type="submit"]').first();
    await createBtn.click();

    // Ждём закрытия модалки
    await expect(page.locator('#newCharModal')).not.toBeVisible({ timeout: 10_000 });

    // Проверяем что карточка появилась в списке
    const charCard = page.locator('.character-card, [data-char-name]').filter({ hasText: cfg.characterName }).first();
    await expect(charCard).toBeVisible({ timeout: 5_000 });

    logTestResult('01-B: Character creation with AI stats', 'pass', {
      character: cfg.characterName,
      strStat: strValue,
    });
  });

  // ─────────────────────────────────────────────
  // TEST 01-C: Импорт мира из файла Этерия 2.6.json
  // ─────────────────────────────────────────────
  test('01-C: Импорт мира из файла JSON', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await expect(page.locator('#lobbyContent')).toBeVisible({ timeout: 30_000 });

    // Переходим на вкладку Миры
    const worldsTab = page.locator('[data-tab="worlds"], .tab-btn').filter({ hasText: /мир|world/i }).first();
    await worldsTab.click();
    await page.waitForTimeout(500);

    // Ищем кнопку импорта мира
    const importBtn = page.locator('button, label').filter({ hasText: /импорт|import/i }).first();

    // Перехватываем диалог выбора файла
    const fileChooserPromise = page.waitForEvent('filechooser');
    await importBtn.click();
    const fileChooser = await fileChooserPromise;

    const worldFilePath = path.resolve(cfg.worldFile);
    await fileChooser.setFiles(worldFilePath);

    // Ждём появления мира в списке (через импорт он должен появиться)
    const worldCard = page.locator('.world-card, [data-world-name]').filter({ hasText: /этерия/i }).first();
    await expect(worldCard).toBeVisible({ timeout: 30_000 });

    logTestResult('01-C: World import from JSON', 'pass', { world: cfg.worldName });
  });

  // ─────────────────────────────────────────────
  // TEST 01-D: Создание игровой сессии с персонажем и миром
  // ─────────────────────────────────────────────
  test('01-D: Создание сессии с выбором персонажа и мира', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await expect(page.locator('#lobbyContent')).toBeVisible({ timeout: 30_000 });

    // Переходим на вкладку Сессии
    const sessionsTab = page.locator('[data-tab="sessions"], .tab-btn').filter({ hasText: /сесси|session/i }).first();
    await sessionsTab.click();
    await page.waitForTimeout(500);

    // Открываем модалку создания сессии
    const newSessionBtn = page.locator('button').filter({ hasText: /создать сессию|новая сессия|new session/i }).first();
    await newSessionBtn.click();
    await expect(page.locator('#newSessionModal')).toBeVisible({ timeout: 5_000 });

    // Выбираем мир
    const worldSelect = page.locator('#sessionWorld');
    await worldSelect.selectOption({ label: /этерия/i });

    // Выбираем сложность
    await page.locator('#sessionDifficulty').selectOption('normal');

    // Добавляем DM подсказку
    await page.locator('#sessionPlotText').fill(
      'Начало приключения в городе Серебряная Гавань. Игрок только прибыл в таверну «Пьяный гоблин».'
    );

    // Отправляем форму
    const submitBtn = page.locator('#newSessionForm button[type="submit"]').first();
    await submitBtn.click();

    // Ждём выбора персонажа или перехода в игру
    // Возможно появится модалка выбора персонажа
    const charSelectModal = page.locator('.modal-overlay, [id*="char"]').filter({ hasText: /персонаж|character/i }).first();
    const gameLoaded = page.locator('#gameChat');

    try {
      // Пробуем найти модалку выбора персонажа
      await charSelectModal.waitFor({ state: 'visible', timeout: 10_000 });

      // Выбираем нашего персонажа
      const charOption = page.locator('.character-option, [data-char], .char-card').filter({ hasText: cfg.characterName }).first();
      await charOption.click();

      const confirmBtn = page.locator('button').filter({ hasText: /выбрать|join|войти/i }).first();
      await confirmBtn.click();
    } catch {
      // Модалки нет — персонаж уже выбран или только один
    }

    // Ждём загрузки игрового экрана
    await expect(gameLoaded).toBeVisible({ timeout: 30_000 });

    // Получаем sessionId и playerId из URL или localStorage
    const currentUrl = page.url();
    const urlMatch = currentUrl.match(/session[=/]([a-f0-9-]{36})/i);
    let sessionId = urlMatch?.[1];

    // Если не в URL — ищем в localStorage
    if (!sessionId) {
      sessionId = await page.evaluate(() => {
        return localStorage.getItem('lastSessionId') ||
               sessionStorage.getItem('currentSessionId');
      });
    }

    // Если всё ещё нет — получаем из БД
    if (!sessionId) {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from('players')
        .select('session_id, id')
        .eq('name', cfg.characterName)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      sessionId = data?.session_id;

      if (data?.id) {
        saveSessionState({ sessionId, playerId: data.id });
        logTestResult('01-D: Session creation', 'pass', { sessionId, playerId: data.id });
        return;
      }
    }

    // Получаем playerId из БД
    const supabase = createServiceClient();
    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('session_id', sessionId)
      .eq('name', cfg.characterName)
      .single();

    expect(sessionId).toBeTruthy();
    expect(player?.id).toBeTruthy();

    saveSessionState({ sessionId, playerId: player.id });
    logTestResult('01-D: Session creation', 'pass', { sessionId, playerId: player.id });
  });
});
