// Тест системы перемещения: малая/средняя/дальняя дистанция
// + плаузибилность генерации новой подлокации

import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://xhzpxiiqrtmeduynqmsd.supabase.co';
const SESSION_ID = 'e1b0c960-b2cb-4d24-a6d2-015eb0fd6ee8';
const PLAYER_ID = 'd9068737-2c02-476c-b73f-57719a9b06c1';

const sessionFile = JSON.parse(readFileSync('tests/e2e/.auth/auth-session.json', 'utf8'));
const ACCESS_TOKEN = sessionFile.session?.access_token || sessionFile.access_token;

async function sendAction(label, actionText) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📤 [${label}]`);
  console.log(`   "${actionText}"`);
  console.log('─'.repeat(60));

  const res = await fetch(`${SUPABASE_URL}/functions/v1/process-turn`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: SESSION_ID, player_id: PLAYER_ID, action_text: actionText }),
  });

  if (!res.ok) {
    console.log(`❌ HTTP ${res.status}:`, await res.text());
    return null;
  }

  const data = await res.json();
  const pipeline = data?.pipeline || {};
  const actions_count = pipeline?.step1?.actions_count ?? '?';
  const mutations_count = pipeline?.step2?.mutations_count ?? '?';
  const turn_status = data?.turn_status ?? '?';

  console.log(`  Pipeline: actions=${actions_count}, mutations=${mutations_count}, status=${turn_status}`);

  // Ищем нарратив игрока
  const narrative = data?.narratives?.players?.[PLAYER_ID] || '';
  if (narrative) {
    console.log(`  📖 Нарратив: ${narrative.slice(0, 350)}`);
  }

  // Ищем системные факты (GPS результат)
  const systemFacts = data?.system_facts || data?.raw_system_facts || [];
  if (systemFacts.length) {
    console.log(`  ⚙️  Факты: ${systemFacts.slice(0, 3).join(' | ').slice(0, 200)}`);
  }

  // Ищем данные о смене локации
  const msgs = data?.messages || data?.new_messages || [];
  for (const m of msgs) {
    if (m.channel === 'Система' || m.sender_type === 'system') {
      console.log(`  📍 Система: ${String(m.content || '').slice(0, 200)}`);
    }
  }

  await new Promise(r => setTimeout(r, 3000));
  return data;
}

console.log('=== ТЕСТ СИСТЕМЫ ПЕРЕМЕЩЕНИЯ ===');
console.log(`Игрок: Арин | Локация: Опушка Шепчущей рощи (normal)`);
console.log(`\nПроверяем 3 уровня дистанции + плаузибилность генерации локаций`);

// --- МАЛАЯ ДИСТАНЦИЯ: движение внутри локации ---
await sendAction('МАЛАЯ: к соседнему дереву', 'Подхожу к ближайшему большому дереву и осматриваю его кору');

// --- СРЕДНЯЯ ДИСТАНЦИЯ: в соседнюю зону/подлокацию ---
await sendAction('СРЕДНЯЯ: в глубь рощи', 'Иду вглубь рощи, в сторону более густого леса');

// --- ДАЛЬНЯЯ ДИСТАНЦИЯ: в другую локацию мира ---
await sendAction('ДАЛЬНЯЯ: в другой город', 'Отправляюсь в Эскорию — крупный торговый город');

// --- ПЛАУЗИБИЛНОСТЬ 1: логичная локация (пещера у леса) ---
await sendAction('ПЛАУЗ 1: логичная (пещера)', 'Замечаю впереди вход в пещеру и иду туда');

// --- ПЛАУЗИБИЛНОСТЬ 2: нелогичная (сокровищница) ---
await sendAction('ПЛАУЗ 2: нелогичная (сокровищница)', 'Иду в сокровищницу что в 10 км от леса за золотом');

// --- ПЛАУЗИБИЛНОСТЬ 3: нейтральная (поляна) ---
await sendAction('ПЛАУЗ 3: поляна', 'Иду на солнечную поляну в лесу');

console.log('\n=== ТЕСТ ЗАВЕРШЁН ===');
