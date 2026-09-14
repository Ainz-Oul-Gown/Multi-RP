// tests/e2e/helpers/game-helpers.js
// Вспомогательные функции для работы с игровым UI в Playwright тестах

import { expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://xhzpxiiqrtmeduynqmsd.supabase.co';
export const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
export const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;


/**
 * Загружает тестовую конфигурацию записанную global-setup
 */
export function loadTestConfig() {
  const configPath = path.resolve('tests/e2e/.auth/test-config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

/**
 * Загружает состояние тестовой сессии (sessionId, playerId) между тестами
 */
export function loadSessionState() {
  const statePath = path.resolve('tests/e2e/.auth/session-state.json');
  if (!fs.existsSync(statePath)) return null;
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

/**
 * Сохраняет состояние тестовой сессии для передачи между тестами
 */
export function saveSessionState(state) {
  const statePath = path.resolve('tests/e2e/.auth/session-state.json');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/**
 * Создаёт Supabase клиент с сервисным ключом для проверок через API
 */
export function createServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/**
 * Отправляет сообщение в игровой чат и ожидает ответа Мастера
 * @returns {string} текст ответа Мастера
 */
export async function sendGameAction(page, actionText, timeoutMs = 90_000) {
  const input = page.locator('#actionInput');
  const sendBtn = page.locator('#sendBtn');

  await input.fill(actionText);
  await sendBtn.click();

  // Ждём появления typing indicator
  await page.locator('#dmTypingIndicator').waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});

  // Ждём когда typing indicator исчезнет (ответ пришёл)
  await page.locator('#dmTypingIndicator').waitFor({ state: 'hidden', timeout: timeoutMs });

  // Ждём нового сообщения от Мастера
  await page.waitForTimeout(500);

  // Берём последнее сообщение
  const messages = page.locator('.message');
  const count = await messages.count();
  if (count === 0) return '';

  const lastMsg = messages.last();
  return await lastMsg.innerText();
}

/**
 * Ожидает появления нового сообщения в чате с заданным отправителем
 */
export async function waitForNewMessage(page, senderPattern, timeoutMs = 90_000) {
  const startTime = Date.now();
  let lastCount = await page.locator('.message').count();

  while (Date.now() - startTime < timeoutMs) {
    const currentCount = await page.locator('.message').count();
    if (currentCount > lastCount) {
      const newMsg = page.locator('.message').nth(currentCount - 1);
      const text = await newMsg.innerText();
      if (!senderPattern || text.includes(senderPattern)) {
        return text;
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Timeout waiting for new message from ${senderPattern}`);
}

/**
 * Проверяет инвентарь игрока через Supabase API
 */
export async function getPlayerInventoryFromDB(playerId) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('inventory')
    .select('*')
    .eq('player_id', playerId);
  return data || [];
}

/**
 * Проверяет сообщения сессии через Supabase API
 */
export async function getSessionMessagesFromDB(sessionId, limit = 10) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data || []).reverse();
}

/**
 * Получает текущее состояние игрока из БД
 */
export async function getPlayerFromDB(playerId) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .single();
  return data;
}

/**
 * Логирует результат теста в структурированный JSON-лог
 */
export function logTestResult(testName, status, details = {}) {
  const logDir = path.resolve('tests/e2e/reports');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const logPath = path.join(logDir, 'test-run.jsonl');
  const entry = {
    timestamp: new Date().toISOString(),
    test: testName,
    status,
    ...details,
  };
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
}

/**
 * Открывает панель инвентаря и возвращает список предметов
 */
export async function openInventoryPanel(page) {
  await page.locator('#inventoryBtn').click();
  await page.locator('#inventoryPanel').waitFor({ state: 'visible' });
  const items = await page.locator('#inventoryContent .inventory-item, #inventoryContent [data-item]').allInnerTexts();
  return items;
}

/**
 * Закрывает любую открытую боковую панель
 */
export async function closePanel(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

/**
 * Проверяет что текст не содержит артефактов кодировки (Mojibake)
 */
export function hasEncodingArtifacts(text) {
  // Типичные Mojibake паттерны
  const mojibakePatterns = [
    /[ÐÑ][°-¿]/,      // UTF-8 кирилица, прочитанная как Latin-1
    /[\u00C0-\u00FF]{3,}/,  // Серии Latin-1 символов вместо кириллицы
    /\ufffd/,          // Unicode replacement character
  ];
  return mojibakePatterns.some(p => p.test(text));
}

/**
 * Проверяет что нарратив Мастера написан прозой (не технические теги)
 */
export function isProseNarrative(text) {
  const badPatterns = [
    /\[HP:\s*\d+\/\d+\]/i,
    /\[Навык:\s*.+?\]/i,
    /\[Урон:\s*\d+\]/i,
    /\[Получен предмет:/i,
    /\{.*"intent".*\}/,
  ];
  return !badPatterns.some(p => p.test(text));
}
