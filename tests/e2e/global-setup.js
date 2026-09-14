// tests/e2e/global-setup.js
// Глобальная настройка: создаёт тестового пользователя в Supabase (если нет)
// и записывает данные сессии в test-session-state.json для переиспользования между тестами
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://xhzpxiiqrtmeduynqmsd.supabase.co';
// Service Role ключ — только для setup, берётся из переменной окружения
// Установи: set E2E_SUPABASE_SERVICE_KEY=...
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
if (!SERVICE_KEY) throw new Error('E2E_SUPABASE_SERVICE_KEY env var is required for e2e global setup');


export const E2E_CONFIG = {
  email: process.env.E2E_TEST_EMAIL || 'e2e_playwright_test@multirp.test',
  password: process.env.E2E_TEST_PASSWORD || 'E2ePlaywright2026!',
  characterName: 'Арин',
  worldName: 'Этерия',       // Импортируем из Этерия 2.6.json
  worldFile: 'Этерия 2.6.json',
  // Бесплатные модели для тестов
  freeModel: 'google/gemini-2.0-flash-exp:free',
  // OpenRouter ключ берётся из .env или E2E_OPENROUTER_KEY
  openrouterKey: process.env.VITE_OPENROUTER_API_KEY || process.env.E2E_OPENROUTER_KEY,
};

export default async function globalSetup() {
  console.log('\n🔧 [Global Setup] Initializing test user and Supabase data...');

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // 1. Создаём или находим пользователя
  const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  let user = listData?.users?.find(u => u.email === E2E_CONFIG.email);

  if (!user) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: E2E_CONFIG.email,
      password: E2E_CONFIG.password,
      email_confirm: true,
    });
    if (error) throw new Error(`Failed to create test user: ${error.message}`);
    user = created.user;
    console.log('  ✅ Test user created:', user.id);
  } else {
    // Обновляем пароль на случай если он изменился
    await supabase.auth.admin.updateUserById(user.id, { password: E2E_CONFIG.password });
    console.log('  ✅ Test user exists:', user.id);
  }

  // 2. Настройки пользователя — бесплатные модели
  await supabase.from('user_settings').upsert({
    id: user.id,
    openrouter_key: E2E_CONFIG.openrouterKey,
    dm_model: E2E_CONFIG.freeModel,
    satellite_model: E2E_CONFIG.freeModel,
    gps_model: E2E_CONFIG.freeModel,
    card_model: E2E_CONFIG.freeModel,
  }, { onConflict: 'id' });
  console.log('  ✅ User settings configured with free models');

  // 3. Очищаем старые тестовые сессии (оставляем мир)
  const { data: oldSessions } = await supabase
    .from('sessions')
    .select('id, worlds(name)')
    .filter('worlds.name', 'eq', E2E_CONFIG.worldName);

  for (const sess of oldSessions || []) {
    // Удаляем только сессии созданные е2е тестами (не пользовательские)
    const { data: sessionPlayers } = await supabase
      .from('players')
      .select('id')
      .eq('session_id', sess.id)
      .eq('name', E2E_CONFIG.characterName);
    if (sessionPlayers?.length > 0) {
      await supabase.from('sessions').delete().eq('id', sess.id);
    }
  }
  console.log('  ✅ Old test sessions cleaned up');

  // 4. Сохраняем конфиг для переиспользования между тестами
  const stateDir = path.resolve('tests/e2e/.auth');
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });

  fs.writeFileSync(
    path.join(stateDir, 'test-config.json'),
    JSON.stringify({ userId: user.id, ...E2E_CONFIG }, null, 2)
  );

  console.log('✅ [Global Setup] Done!\n');
}
