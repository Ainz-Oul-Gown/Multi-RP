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
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#lobbyContent')).toBeVisible({ timeout: 30_000 });

    // Проверяем основные разделы
    await expect(page.locator('#signOutBtn')).toBeVisible();

    logTestResult('01-A: Lobby loads', 'pass');
  });

  // ─────────────────────────────────────────────
  // TEST 01-B: Создание персонажа с генерацией статов AI
  // ─────────────────────────────────────────────
  test('01-B: Создание персонажа — заполнение формы и генерация статов', async ({ page }) => {
    console.log(`[${Date.now()}] 01-B: Начало теста`);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    console.log(`[${Date.now()}] 01-B: Страница загружена`);
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
    console.log(`[${Date.now()}] 01-B: Сгенерировать статы`);
    await page.locator('#generateStatsBtn').click();

    // Ждём пока AI заполнит статы — кнопка разблокируется
    console.log(`[${Date.now()}] 01-B: Ждем AI статы`);
    try {
      await expect(page.locator('#generateStatsBtn')).not.toHaveAttribute('disabled', { timeout: 15_000 });
    } catch {
      console.log('01-B: AI статы timeout, продолжаем с дефолтными');
    }
    await page.waitForTimeout(1000);

    // Проверяем что хотя бы один стат заполнен (не 0 и не пустой)
    const strValue = await page.locator('#stat_STR').inputValue();
    const intValue = parseInt(strValue);
    expect(intValue).toBeGreaterThan(0);
    expect(intValue).toBeLessThanOrEqual(20);

    // Сохраняем персонажа
    console.log(`[${Date.now()}] 01-B: Сохраняем персонажа`);
    const newCharForm = page.locator('#newCharForm');
    await newCharForm.evaluate(f => f.requestSubmit());

    // Ждём появления карточки персонажа
    console.log(`[${Date.now()}] 01-B: Ждем карточку`);
    const charCard = page.locator('.char-card').filter({ hasText: cfg.characterName }).first();
    await expect(charCard).toBeVisible({ timeout: 15_000 });



    // Проверяем что карточка появилась в списке (если вдруг не успела)
    await expect(charCard).toBeVisible({ timeout: 10_000 });

    logTestResult('01-B: Character creation with AI stats', 'pass', {
      character: cfg.characterName,
      strStat: strValue,
    });
  });

  // ─────────────────────────────────────────────
  // TEST 01-C: Импорт мира из файла Этерия 2.6.json
  // ─────────────────────────────────────────────
  test('01-C: Импорт мира из файла JSON', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#lobbyContent')).toBeVisible({ timeout: 30_000 });

    // Переходим на вкладку Миры
    const worldsTab = page.locator('[data-tab="worlds"], .tab-btn').filter({ hasText: /мир|world/i }).first();
    await worldsTab.click();
    await page.waitForTimeout(500);

    // Кнопка импорта мира находится внутри модалки "Новый мир"
    // Сначала открываем модалку создания нового мира
    const newWorldBtn = page.locator('button').filter({ hasText: /новый мир|new world|\+ Новый/i }).first();
    await newWorldBtn.click();
    await page.waitForTimeout(500);

    // Ищем кнопку "Импорт мира" — она находится в модалке
    const importBtn = page.locator('#importWorldFromModalBtn, button').filter({ hasText: /импорт мира|import world/i }).first();

    // Перехватываем диалог выбора файла
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15_000 }),
      importBtn.click(),
    ]);

    const worldFilePath = path.resolve(cfg.worldFile);
    await fileChooser.setFiles(worldFilePath);

    // Ждём появления мира в списке (через импорт он должен появиться)
    const worldCard = page.locator('.world-card, [data-world-name]').filter({ hasText: /этерия/i }).first();
    await expect(worldCard).toBeVisible({ timeout: 60_000 });

    logTestResult('01-C: World import from JSON', 'pass', { world: cfg.worldName });
  });

  // ─────────────────────────────────────────────
  // TEST 01-D: Создание игровой сессии с персонажем и миром
  // ─────────────────────────────────────────────
  test('01-D: Создание сессии с выбором персонажа и мира', async ({ page }) => {
    page.on('console', msg => console.log('BROWSER:', msg.text()));
    console.log(`[${Date.now()}] 01-D: Начало теста`);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    console.log(`[${Date.now()}] 01-D: Страница загружена`);
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
    // Ждём пока в select появятся опции кроме placeholder
    await page.waitForFunction(() => {
      const sel = document.querySelector('#sessionWorld');
      return sel && sel.options.length > 1;
    }, { timeout: 10_000 });

    // Просто выбираем первый доступный мир
    await worldSelect.evaluate(sel => {
      if (sel.options.length > 1) sel.selectedIndex = 1;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const selectedWorldId = await worldSelect.inputValue();
    console.log(`[${Date.now()}] 01-D: Selected world ID: ${selectedWorldId}`);

    // Выбираем сложность
    await page.locator('#sessionDifficulty').selectOption('normal');

    // Добавляем DM подсказку — раздел может быть скрыт в accordion
    const plotSection = page.locator('details, [data-collapsible], summary').filter({ hasText: /сюжет|plot/i }).first();
    // Раскрываем accordion если он есть
    const plotSectionExists = await plotSection.count();
    if (plotSectionExists > 0) {
      const isOpen = await plotSection.evaluate(el => el.tagName === 'DETAILS' ? el.open : el.getAttribute('aria-expanded') === 'true');
      if (!isOpen) await plotSection.click();
      await page.waitForTimeout(300);
    }

    const plotTextArea = page.locator('#sessionPlotText');
    const plotVisible = await plotTextArea.isVisible({ timeout: 2_000 }).catch(() => false);
    if (plotVisible) {
      await plotTextArea.fill(
        'Начало приключения в городе Серебряная Гавань. Игрок только прибыл в таверну «Пьяный гоблин».'
      );
    }

    // Проверяем валидность формы
    const isValid = await page.evaluate(() => {
      const form = document.querySelector('#newSessionForm');
      if (!form.checkValidity()) {
        const invalids = Array.from(form.querySelectorAll(':invalid')).map(el => el.id || el.name);
        return 'INVALID: ' + invalids.join(', ');
      }
      return 'VALID';
    });
    console.log(`[${Date.now()}] 01-D: Form is ${isValid}`);

    // Отправляем форму в обход HTML5-валидации
    console.log(`[${Date.now()}] 01-D: Отправляем форму новой сессии`);
    const newSessionForm = page.locator('#newSessionForm');
    await newSessionForm.evaluate(f => {
      f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    });
    
    // Ждём смены URL на /session/
    console.log(`[${Date.now()}] 01-D: Ждем смены URL`);
    try {
      await page.waitForURL(/\/session\/[a-f0-9-]+/, { timeout: 10_000 });
    } catch {
      console.log(`[${Date.now()}] 01-D: URL не сменился за 10 сек, проверяем тосты`);
      const errorToast = page.locator('.toast.error, .toast-error, .toast').first();
      if (await errorToast.isVisible({ timeout: 1000 }).catch(() => false)) {
        const errorText = await errorToast.textContent();
        throw new Error(`Обнаружена ошибка при создании сессии: ${errorText}`);
      }
      throw new Error(`Сессия не создана за 10 секунд и тостов нет.`);
    }

    console.log(`[${Date.now()}] 01-D: Ждем выбора героя или перехода в игру`);
    const selectHeroBtn = page.locator('.char-select-btn, button').filter({ hasText: /выбрать этого героя|выбрать героя/i }).first();
    const gameLoaded = page.locator('#gameChat');

    try {
      await selectHeroBtn.waitFor({ state: 'visible', timeout: 10_000 });
      console.log(`[${Date.now()}] 01-D: Нажимаем кнопку "Выбрать этого героя"`);
      await selectHeroBtn.click();
    } catch {
      console.log(`[${Date.now()}] 01-D: Кнопка "Выбрать этого героя" не появилась, проверяем наличие карточек`);
      const charOption = page.locator('.character-option, [data-char], .char-card').filter({ hasText: cfg.characterName }).first();
      const isCardVis = await charOption.isVisible().catch(() => false);
      if (isCardVis) {
        await charOption.click();
        const confirmBtn = page.locator('button').filter({ hasText: /выбрать|join|войти/i }).first();
        await confirmBtn.click({ timeout: 3000 }).catch(() => {});
      }
    }

    console.log(`[${Date.now()}] 01-D: Ждем загрузки gameChat`);
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
