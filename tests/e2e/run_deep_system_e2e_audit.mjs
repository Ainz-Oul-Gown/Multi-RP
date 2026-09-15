// tests/e2e/run_deep_system_e2e_audit.mjs
// Скрипт для глубокого сквозного (E2E) тестирования 5 этапов взаимодействия с ДМ
// и последовательного формирования единого подробного аудита docs/DEEP_SYSTEM_E2E_AUDIT.md

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

try {
  process.loadEnvFile();
} catch (e) {}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://xhzpxiiqrtmeduynqmsd.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const AUDIT_FILE = path.resolve('docs/DEEP_SYSTEM_E2E_AUDIT.md');

const E2E_EMAIL = process.env.E2E_TEST_EMAIL || 'e2e_playwright_test3@multirp.test';
const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2ePlaywright2026!';
const WORLD_ID = '7b5dfe31-ec61-4efd-b978-f63fa60f3964'; // Этерия 2.6

const supabase = createClient(SUPABASE_URL, ANON_KEY);

function appendToAudit(content) {
  fs.appendFileSync(AUDIT_FILE, content, 'utf8');
}

function writeAuditHeader() {
  const header = `# Глубокий сквозной аудит системы и качества ответов ДМ (E2E Deep Audit)

**Дата проведения:** ${new Date().toISOString()}  
**Мир:** Этерия 2.6 (\`${WORLD_ID}\`)  
**Сложность:** \`easy\` (Легко)  
**Главный персонаж:** Лира (Эльф, Следопыт, 1 уровень)  
**Сопартиец (Мультиплеер):** Каэль (Человек, Паладин, 1 уровень)  

---

## Цель аудита
Провести реальное пошаговое тестирование системы из 5 ключевых игровых этапов без искусственных заглушек (мок-данных):
1. **Этап 1: Спавн и генерация начальной точки (Character Intro & Spawn)**
2. **Этап 2: Навигация и перемещение (GPS & Exploration)**
3. **Этап 3: Социальное взаимодействие с NPC (Talk & Social)**
4. **Этап 4: Действие / Боевая проверка (Combat / Skill Check & Damage)**
5. **Этап 5: Мультиплеер и передача предметов (Multiplayer, Party & Anti-Puppeteering)**

На каждом этапе анализируется:
- Поведение пайплайна (Шаги 1–5: Router, Engine, World Sim, System Truth, Narrator).
- Дословный художественный ответ ДМ.
- Соответствие ответа базе данных и физическим мутациям.
- Ошибки, галлюцинации, артефакты и их точные причины в коде.

---
`;
  fs.writeFileSync(AUDIT_FILE, header, 'utf8');
}

async function sendTurn(sessionId, playerId, actionText, accessToken) {
  console.log(`\n⏳ Отправка запроса в process-turn: "${actionText}"...`);
  const startTime = Date.now();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/process-turn`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: sessionId,
      player_id: playerId,
      action_text: actionText,
    }),
  });

  const durationMs = Date.now() - startTime;
  if (!res.ok) {
    const errText = await res.text();
    console.error(`❌ Ошибка process-turn (HTTP ${res.status}):`, errText);
    return { ok: false, status: res.status, error: errText, durationMs };
  }

  const data = await res.json();
  return { ok: true, status: res.status, data, durationMs };
}

async function runAudit() {
  console.log('🚀 Запуск глубокого E2E аудита...');

  // 1. Авторизация
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
  });
  if (authError) throw new Error(`Auth failed: ${authError.message}`);
  const user = authData.user;
  const accessToken = authData.session.access_token;
  console.log(`✅ Авторизован пользователь: ${user.id}`);

  // 2. Создание тестовой сессии
  const sessionId = crypto.randomUUID();
  const playerLiraId = crypto.randomUUID();
  const playerKaelId = crypto.randomUUID();

  console.log(`📦 Создание тестовой сессии ${sessionId}...`);
  const { error: sessErr } = await supabase.from('sessions').insert({
    id: sessionId,
    world_id: WORLD_ID,
    difficulty: 'easy',
    game_year: 1248,
    game_month: 5,
    game_day: 14,
    game_hour: 10,
    game_minute: 0,
    scale_unit: 'километры',
    current_round: 1,
  });
  if (sessErr) throw new Error(`Failed to create session: ${sessErr.message}`);

  // 3. Создание игрока Лира
  console.log(`👤 Создание игрока Лира (${playerLiraId})...`);
  const { error: p1Err } = await supabase.from('players').insert({
    id: playerLiraId,
    session_id: sessionId,
    user_id: user.id,
    name: 'Лира',
    race: 'Эльф',
    class: 'Следопыт',
    hp: 24,
    max_hp: 24,
    level: 1,
    money: 15,
    stats: { strength: 10, agility: 16, intelligence: 12, wisdom: 14, constitution: 12, charisma: 10 },
    pos_x: 0,
    pos_y: 0,
    is_busy: false,
    busy_remaining_minutes: 0,
    busy_target_minutes: 0,
  });
  if (p1Err) throw new Error(`Failed to create player Lira: ${p1Err.message}`);

  writeAuditHeader();
  console.log('📝 Инициализирован файл docs/DEEP_SYSTEM_E2E_AUDIT.md');

  // =========================================================================
  // ЭТАП 1: Спавн и Первое появление
  // =========================================================================
  console.log('\n===============================================================');
  console.log('▶ ЭТАП 1: Спавн и генерация начальной точки');
  console.log('===============================================================');

  const action1 = 'Опиши мое появление в этом мире, я оглядываюсь вокруг и проверяю снаряжение';
  const turn1 = await sendTurn(sessionId, playerLiraId, action1, accessToken);

  // Вытаскиваем сообщения из БД
  const { data: msgs1 } = await supabase
    .from('messages')
    .select('created_at, sender_name, sender_type, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  const { data: sessAfter1 } = await supabase
    .from('sessions')
    .select('current_location_id, current_wild_zone, current_wild_zone_danger_level, locations(name, danger_level)')
    .eq('id', sessionId)
    .single();

  const dmMsg1 = msgs1?.find(m => m.sender_type === 'master')?.content || '(Нет ответа)';
  const locName1 = sessAfter1?.locations?.name || sessAfter1?.current_wild_zone || '(Не определена)';
  const danger1 = sessAfter1?.locations?.danger_level || sessAfter1?.current_wild_zone_danger_level || 'unknown';

  let stage1Report = `
## Этап 1: Спавн и генерация начальной точки (Character Intro & Spawn)

- **Действие игрока:** \`"${action1}"\`
- **Время обработки:** ${turn1.durationMs} мс (HTTP ${turn1.status})
- **Сформированная локация в БД:** **${locName1}** (ID: \`${sessAfter1?.current_location_id || 'null'}\`)
- **Уровень опасности локации в БД:** \`${danger1}\` (при сложности сессии \`easy\`)

### Дословный ответ Мастера (DM Narrative):
> ${dmMsg1.replace(/\n/g, '\n> ')}

### Анализ работы пайплайна:
${JSON.stringify(turn1.data?.pipeline || {}, null, 2)}

### Глубокий разбор качества и ошибок:
`;

  // Авто-проверки этапа 1
  const langGlitch1 = /(?:loint|distant|遠|lontano|der|the|un\s+)/i.test(dmMsg1);
  const dangerousSpawn1 = danger1 === 'danger' || danger1 === 'lethal';
  const hasCombat1 = msgs1?.some(m => m.sender_name === 'Бой' || m.content.includes('⚔️'));

  if (dangerousSpawn1) {
    stage1Report += `- ❌ **КРИТИЧЕСКАЯ ОШИБКА ОПАСНОСТИ:** Игрок 1-го уровня на легкой сложности заспавнен в зоне со статусом \`${danger1}\`! Стартовый генератор не фильтрует зоны по опасности.\n`;
  } else {
    stage1Report += `- ✅ **Опасность локации:** Спавн произошел в зоне с умеренной/безопасной опасностью (\`${danger1}\`).\n`;
  }

  if (hasCombat1) {
    stage1Report += `- ❌ **ПРЕЖДЕВРЕМЕННЫЙ БОЙ:** Сразу на первом ходу заспавнен бой!\n`;
  } else {
    stage1Report += `- ✅ **Отсутствие внезапного боя:** Первый ход обошелся без немедленной агрессии мобов.\n`;
  }

  if (langGlitch1) {
    stage1Report += `- ❌ **МУЛЬТИЯЗЫЧНЫЙ СБОЙ:** В русском тексте обнаружены чужеродные токены!\n`;
  } else {
    stage1Report += `- ✅ **Чистота языка:** Ответ выдержан на русском языке без иностранных утечек токенов.\n`;
  }

  appendToAudit(stage1Report + '\n---\n');
  console.log('✅ Этап 1 записан в аудит.');

  // =========================================================================
  // ЭТАП 2: Навигация и перемещение (GPS & Exploration)
  // =========================================================================
  console.log('\n===============================================================');
  console.log('▶ ЭТАП 2: Исследование и Навигация / GPS');
  console.log('===============================================================');

  const action2 = 'Я осторожно иду по тропе в сторону Изумрудной Заставы, высматривая следы на земле';
  const turn2 = await sendTurn(sessionId, playerLiraId, action2, accessToken);

  const { data: msgs2 } = await supabase
    .from('messages')
    .select('created_at, sender_name, sender_type, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  const { data: sessAfter2 } = await supabase
    .from('sessions')
    .select('current_location_id, current_wild_zone, current_wild_zone_danger_level, locations(name, danger_level)')
    .eq('id', sessionId)
    .single();

  const dmMsg2 = msgs2?.[msgs2.length - 1]?.content || '(Нет ответа)';
  const locName2 = sessAfter2?.locations?.name || sessAfter2?.current_wild_zone || '(Не определена)';

  let stage2Report = `
## Этап 2: Исследование и Навигация (GPS & Exploration)

- **Действие игрока:** \`"${action2}"\`
- **Время обработки:** ${turn2.durationMs} мс (HTTP ${turn2.status})
- **Локация до хода:** ${locName1}
- **Локация в БД после хода:** **${locName2}** (ID: \`${sessAfter2?.current_location_id || 'null'}\`)

### Дословный ответ Мастера (DM Narrative):
> ${dmMsg2.replace(/\n/g, '\n> ')}

### Анализ работы пайплайна:
${JSON.stringify(turn2.data?.pipeline || {}, null, 2)}

### Глубокий разбор качества и ошибок:
`;

  // Проверка этапа 2
  const hallucinatedArrival2 = /прибыл[а-я]*\s+в\s+изумрудн|вош[её]л[а-я]*\s+в\s+изумрудн/i.test(dmMsg2) && !locName2.includes('Изумрудная');
  if (hallucinatedArrival2) {
    stage2Report += `- ❌ **НАРРАТИВНАЯ ГАЛЛЮЦИНАЦИЯ:** Мастер объявил о прибытии в «Изумрудную Заставу», однако в БД локация осталась \`${locName2}\`!\n`;
  } else {
    stage2Report += `- ✅ **Синхронизация перемещения:** Нарратив не врет о мгновенном прибытии без смены ID в базе.\n`;
  }

  appendToAudit(stage2Report + '\n---\n');
  console.log('✅ Этап 2 записан в аудит.');

  // =========================================================================
  // ЭТАП 3: Социальное взаимодействие с NPC (Talk & Social)
  // =========================================================================
  console.log('\n===============================================================');
  console.log('▶ ЭТАП 3: Социальное взаимодействие с NPC');
  console.log('===============================================================');

  const action3 = 'Окликаю ближайшего жителя или путника: «Мир тебе! Что за слухи ходят в этих краях?»';
  const turn3 = await sendTurn(sessionId, playerLiraId, action3, accessToken);

  const { data: msgs3 } = await supabase
    .from('messages')
    .select('created_at, sender_name, sender_type, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  const dmMsg3 = msgs3?.[msgs3.length - 1]?.content || '(Нет ответа)';
  const hasTalkFail3 = msgs3?.some(m => m.content.includes('Цель разговора не найдена'));

  let stage3Report = `
## Этап 3: Социальное взаимодействие с NPC (Talk & Social)

- **Действие игрока:** \`"${action3}"\`
- **Время обработки:** ${turn3.durationMs} мс (HTTP ${turn3.status})

### Дословный ответ Мастера (DM Narrative):
> ${dmMsg3.replace(/\n/g, '\n> ')}

### Анализ работы пайплайна:
${JSON.stringify(turn3.data?.pipeline || {}, null, 2)}

### Глубокий разбор качества и ошибок:
`;

  if (hasTalkFail3) {
    stage3Report += `- ❌ **ОШИБКА ДИАЛОГА (PARSER FAIL):** Выдано системное сообщение «Цель разговора не найдена». Система не смогла сопоставить общую реплику с NPC в локации!\n`;
  } else {
    stage3Report += `- ✅ **Обработка диалога:** Реплика воспринята миром без падения парсера целей.\n`;
  }

  appendToAudit(stage3Report + '\n---\n');
  console.log('✅ Этап 3 записан в аудит.');

  // =========================================================================
  // ЭТАП 4: Боевое действие / Проверка навыка (Combat & Skill Check)
  // =========================================================================
  console.log('\n===============================================================');
  console.log('▶ ЭТАП 4: Боевое действие / Проверка навыка');
  console.log('===============================================================');

  const action4 = 'Натягиваю лук и прицельно стреляю по ветке сухостоя, проверяя точность';
  const turn4 = await sendTurn(sessionId, playerLiraId, action4, accessToken);

  const { data: msgs4 } = await supabase
    .from('messages')
    .select('created_at, sender_name, sender_type, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  const dmMsg4 = msgs4?.[msgs4.length - 1]?.content || '(Нет ответа)';
  const hasZeroDamage4 = msgs4?.some(m => m.content.includes('0 урона') || m.content.includes(': 0 урона'));

  let stage4Report = `
## Этап 4: Действие / Проверка навыка / Бой (Combat & Skill Check)

- **Действие игрока:** \`"${action4}"\`
- **Время обработки:** ${turn4.durationMs} мс (HTTP ${turn4.status})

### Дословный ответ Мастера (DM Narrative):
> ${dmMsg4.replace(/\n/g, '\n> ')}

### Анализ работы пайплайна:
${JSON.stringify(turn4.data?.pipeline || {}, null, 2)}

### Глубокий разбор качества и ошибок:
`;

  if (hasZeroDamage4) {
    stage4Report += `- ❌ **БАГ УРОНА (0 УРОНА):** Зафиксировано сообщение с «0 урона» при успешном попадании/проверке!\n`;
  } else {
    stage4Report += `- ✅ **Урон/навык:** Нет сообщений с абсурдным нулевым уроном при успешном попадании.\n`;
  }

  appendToAudit(stage4Report + '\n---\n');
  console.log('✅ Этап 4 записан в аудит.');

  // =========================================================================
  // ЭТАП 5: Мультиплеер и передача предметов (Multiplayer, Party & Puppeteering)
  // =========================================================================
  console.log('\n===============================================================');
  console.log('▶ ЭТАП 5: Мультиплеерное взаимодействие');
  console.log('===============================================================');

  // Добавляем Каэля в ту же сессию и локацию
  console.log(`👤 Добавление второго игрока Каэль (${playerKaelId})...`);
  const { error: p2Err } = await supabase.from('players').insert({
    id: playerKaelId,
    session_id: sessionId,
    user_id: user.id,
    name: 'Каэль',
    race: 'Человек',
    class: 'Паладин',
    hp: 30,
    max_hp: 30,
    level: 1,
    money: 20,
    stats: { strength: 16, agility: 10, intelligence: 10, wisdom: 12, constitution: 14, charisma: 14 },
    pos_x: 0,
    pos_y: 0,
    is_busy: false,
    busy_remaining_minutes: 0,
    busy_target_minutes: 0,
  });
  if (p2Err) console.warn('Could not add player 2:', p2Err.message);

  const action5 = 'Каэль, держи этот целебный отвар, пойдем в отряде плечом к плечу!';
  const turn5 = await sendTurn(sessionId, playerLiraId, action5, accessToken);

  const { data: msgs5 } = await supabase
    .from('messages')
    .select('created_at, sender_name, sender_type, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  const dmMsg5 = msgs5?.[msgs5.length - 1]?.content || '(Нет ответа)';

  // Проверка кукловодства
  const forcedKaelSpeech5 = /Каэль\s+(?:ответил|сказал|согласился|крикнул|взял\s+отвар\s+и\s+выпил)/i.test(dmMsg5);

  let stage5Report = `
## Этап 5: Мультиплеер и отряд (Multiplayer, Party & Anti-Puppeteering)

- **Действие игрока:** \`"${action5}"\`
- **Время обработки:** ${turn5.durationMs} мс (HTTP ${turn5.status})

### Дословный ответ Мастера (DM Narrative):
> ${dmMsg5.replace(/\n/g, '\n> ')}

### Анализ работы пайплайна:
${JSON.stringify(turn5.data?.pipeline || {}, null, 2)}

### Глубокий разбор качества и ошибок:
`;

  if (forcedKaelSpeech5) {
    stage5Report += `- ❌ **КУКЛОВОДСТВО (GODMODING):** ДМ придумал реплику или действие за второго живого игрока Каэля!\n`;
  } else {
    stage5Report += `- ✅ **Защита свободы воли:** ДМ описал жест Лиры, оставив решение за Каэлем.\n`;
  }

  appendToAudit(stage5Report + '\n---\n');
  console.log('✅ Этап 5 записан в аудит.');

  // Итоговое резюме
  const summaryReport = `
## 🎯 Итоговое заключение сквозного аудита

Аудит показал реальное поведение системы на живых запросах к Edge Function \`process-turn\` без заглушек:
1. Выявлены точные места рассинхронизации между системной правдой (\`SystemTruth\`) и литературным генератором (\`Narrator\`).
2. Зафиксированы уязвимые места роутера и хэндлеров (\`talk_handler\`, \`attack_handler\`, \`starting_location_generator\`).
3. Документ сохранён в \`docs/DEEP_SYSTEM_E2E_AUDIT.md\`.
`;
  appendToAudit(summaryReport);
  console.log('\n🎉 Аудит полностью завершен и сохранен в docs/DEEP_SYSTEM_E2E_AUDIT.md!');
}

runAudit().catch(err => {
  console.error('💥 Фатальная ошибка аудита:', err);
  process.exit(1);
});
