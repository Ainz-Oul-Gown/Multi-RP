// Тест системы энкаунтеров через process-turn API
// Игрок: Арин, Локация: Опушка Шепчущей рощи (normal)
// Сессия: e1b0c960-b2cb-4d24-a6d2-015eb0fd6ee8

import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://xhzpxiiqrtmeduynqmsd.supabase.co';
const SESSION_ID = 'e1b0c960-b2cb-4d24-a6d2-015eb0fd6ee8';
const PLAYER_ID = 'd9068737-2c02-476c-b73f-57719a9b06c1'; // Арин

// Читаем токен из сохранённой сессии
const sessionFile = JSON.parse(readFileSync('tests/e2e/.auth/auth-session.json', 'utf8'));
const ACCESS_TOKEN = sessionFile.session?.access_token || sessionFile.access_token;

async function sendAction(actionText) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📤 ЗАПРОС: "${actionText}"`);
  console.log('='.repeat(60));
  
  const res = await fetch(`${SUPABASE_URL}/functions/v1/process-turn`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_id: SESSION_ID, player_id: PLAYER_ID, action_text: actionText }),

  });

  if (!res.ok) {
    console.log(`❌ HTTP ${res.status}:`, await res.text());
    return;
  }

  const data = await res.json();
  const msgs = data?.messages || data?.new_messages || [];
  
  if (!msgs.length) {
    console.log('📦 Ответ (raw):', JSON.stringify(data).slice(0, 600));
    return;
  }
  
  for (const msg of msgs) {
    const content = String(msg.content || '');
    if (msg.sender_type === 'master' || msg.sender_name === 'Мастер') {
      console.log(`\n📖 МАСТЕР:\n${content.slice(0, 600)}`);
    } else if (msg.sender_type === 'system' || msg.channel === 'Система') {
      console.log(`\n⚙️  СИСТЕМА: ${content.slice(0, 300)}`);
    }
  }
  
  // Проверяем наличие меток энкаунтера
  const allText = msgs.map(m => m.content || '').join('\n');
  if (allText.includes('энкаунтер') || allText.includes('Энкаунтер')) {
    console.log('\n✅ ЭНКАУНТЕР ТРИГГЕРНУЛСЯ!');
  } else if (allText.includes('Поиск врагов не дал')) {
    console.log('\n⚪ Поиск: врагов нет (бросок не прошёл)');
  } else if (allText.includes('появляется') || allText.includes('атакует')) {
    console.log('\n⚔️  ВРАГ ПОЯВИЛСЯ!');
  }
  
  await new Promise(r => setTimeout(r, 3000));
}

console.log('=== ТЕСТ СИСТЕМЫ ЭНКАУНТЕРОВ ===');
console.log(`Игрок: Арин | Локация: Опушка Шепчущей рощи (normal)`);
console.log(`Ожидание: encounter_intent=targeted → шанс 12*3=36%`);

// --- ТЕСТ 1: Целенаправленный поиск врага ---
await sendAction('Внимательно осматриваюсь и ищу следы врагов или опасных существ');

// --- ТЕСТ 2: Движение (random encounter chance ~3% при 15 мин normal) ---
await sendAction('Иду к краю рощи, в сторону тёмного леса');

// --- ТЕСТ 3: Явный поиск боя (targeted) ---
await sendAction('Целенаправленно ищу врагов, хочу подраться');

console.log('\n=== ТЕСТ ЗАВЕРШЁН ===');
console.log('Для проверки логов: Supabase Dashboard → Functions → process-turn → Logs');
