// Диагностика: смотрим RAW ответ роутера для move actions
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://xhzpxiiqrtmeduynqmsd.supabase.co';
const SESSION_ID = 'e1b0c960-b2cb-4d24-a6d2-015eb0fd6ee8';
const PLAYER_ID = 'd9068737-2c02-476c-b73f-57719a9b06c1';

const sessionFile = JSON.parse(readFileSync('tests/e2e/.auth/auth-session.json', 'utf8'));
const ACCESS_TOKEN = sessionFile.session?.access_token || sessionFile.access_token;

async function sendAction(label, actionText) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📤 [${label}]: "${actionText}"`);
  console.log('═'.repeat(60));

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
  
  // Полная диагностика step1
  console.log(`  step1: actions_count=${pipeline.step1?.actions_count} status=${pipeline.step1?.status}`);
  console.log(`  step2: mutations_count=${pipeline.step2?.mutations_count}`);
  console.log(`  turn_status: ${data?.turn_status}`);
  
  // Показываем все actions
  const actions = data?.actions || data?.resolved_actions || [];
  if (actions.length > 0) {
    console.log(`  ✅ Actions:`);
    for (const a of actions) {
      console.log(`    - type=${a.action_type} target=${a.target_item_name || a.target_entity_id || 'null'}`);
    }
  }
  
  // Полный pipeline
  console.log(`  Pipeline raw:`, JSON.stringify(pipeline).slice(0, 300));

  await new Promise(r => setTimeout(r, 2000));
  return data;
}

// Простые чёткие тесты перемещения
await sendAction('TEST1: иду в лес', 'Иду в лес');
await sendAction('TEST2: вхожу в пещеру', 'Вхожу в пещеру');
await sendAction('TEST3: иду в город', 'Иду в ближайший город');
await sendAction('TEST4: осматриваюсь', 'Осматриваюсь вокруг');

console.log('\n=== DONE ===');
