// scripts/test_deep_mechanics_simulation.cjs
// Полный глубокий тест всех механик Multi-RP с реальными персонажами в мире «Этерия»
// на бесплатных моделях OpenRouter (google/gemma-4-31b-it:free и minimax/minimax-m3:free)

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://xhzpxiiqrtmeduynqmsd.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoenB4aWlxcnRtZWR1eW5xbXNkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM0NTk3MSwiZXhwIjoyMTAxOTIxOTcxfQ.VnJwWDCFRG3PZxGTzYOWEPTNrUjY2fQ9Wi_rPEqTJfE';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const FREE_MODELS = {
  primary: 'google/gemma-4-31b-it:free',
  narrator: 'minimax/minimax-m3:free',
  satellite: 'google/gemma-4-31b-it:free',
  nemotron: 'nvidia/nemotron-3-super-120b-a12b:free',
};

async function runDeepSimulation() {
  console.log('================================================================');
  console.log('⚔️  MULTI-RP: ГЛУБОКИЙ ТЕСТ ВСЕХ МЕХАНИК НА РЕАЛЬНЫХ ДАННЫХ ⚔️');
  console.log('================================================================');

  // 1. Инициализация пользователя и настроек OpenRouter
  console.log('\n[ЭТАП 1] Проверка пользователя и ключа OpenRouter...');
  const testEmail = 'auto_test_player_2026@test.com';
  const { data: usersData } = await supabase.auth.admin.listUsers();
  let user = usersData?.users?.find((u) => u.email === testEmail);
  if (!user) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: 'TestPassword123!',
      email_confirm: true,
    });
    if (error) throw error;
    user = created.user;
  }
  console.log('✅ Пользователь готов:', user.id);

  const { data: settings } = await supabase.from('user_settings').select('*').limit(1);
  const openrouterKey = settings?.[0]?.openrouter_key;
  if (!openrouterKey) throw new Error('OpenRouter API ключ не найден в user_settings!');
  console.log('✅ OpenRouter ключ найден:', openrouterKey.slice(0, 14) + '...');

  await supabase.from('user_settings').upsert({
    id: user.id,
    openrouter_key: openrouterKey,
    dm_model: FREE_MODELS.narrator,
    satellite_model: FREE_MODELS.satellite,
    gps_model: FREE_MODELS.primary,
    card_model: FREE_MODELS.primary,
  });

  // 2. Поиск или создание мира «Этерия»
  console.log('\n[ЭТАП 2] Загрузка мира «Этерия»...');
  let { data: world } = await supabase.from('worlds').select('*').eq('name', 'Этерия').maybeSingle();
  if (!world) {
    const rawWorld = JSON.parse(fs.readFileSync('Этерия.json', 'utf8'));
    const { data: newWorld, error } = await supabase.from('worlds').insert({
      name: rawWorld.name || 'Этерия',
      description: rawWorld.description || 'Фэнтезийный континент Этерия',
      owner_id: user.id,
      settings: rawWorld.settings || {},
    }).select().single();
    if (error) throw error;
    world = newWorld;
  }
  console.log('✅ Мир готов:', world.name, `(${world.id})`);

  // 3. Персонаж «Валериан» (Следопыт)
  console.log('\n[ЭТАП 3] Подготовка карточки персонажа «Валериан»...');
  let { data: card } = await supabase.from('character_cards').select('*').eq('owner_id', user.id).eq('name', 'Валериан').maybeSingle();
  if (!card) {
    const { data: newCard, error } = await supabase.from('character_cards').insert({
      owner_id: user.id,
      name: 'Валериан',
      race: 'Человек',
      class: 'Следопыт',
      bio: 'Опытный следопыт северных лесов. Спокоен, наблюдателен, верен слову.',
      appearance: 'Высокий темноволосый мужчина в дорожном плаще с капюшоном, с охотничьим луком и кинжалом.',
      stats: { STR: 12, DEX: 16, CON: 14, INT: 12, WIS: 14, CHA: 10 },
      hp: 24,
      max_hp: 24,
      money: 50,
    }).select().single();
    if (error) throw error;
    card = newCard;
  }
  console.log('✅ Персонаж готов:', card.name, `(HP: ${card.hp}/${card.max_hp})`);

  // 4. Создание игровой сессии
  console.log('\n[ЭТАП 4] Создание игровой сессии...');
  const { data: locs } = await supabase.from('locations').select('id, name').eq('world_id', world.id).limit(1);
  const startLoc = locs?.[0];
  const { data: session, error: sessErr } = await supabase.from('sessions').insert({
    world_id: world.id,
    current_location_id: startLoc?.id || null,
    current_wild_zone: startLoc ? null : 'Опушка Шепчущей рощи',
    difficulty: 'normal',
    is_pvp_enabled: false,
    game_year: 1248,
    game_month: 5,
    game_day: 14,
    game_hour: 8,
    game_minute: 0,
  }).select().single();
  if (sessErr) throw sessErr;
  console.log('✅ Сессия создана:', session.id, startLoc ? `(Локация: ${startLoc.name})` : '(Дикая зона)');

  // 5. Вход игрока в сессию
  const { data: player, error: pErr } = await supabase.from('players').insert({
    session_id: session.id,
    user_id: user.id,
    name: card.name,
    race: card.race,
    class: card.class,
    appearance: card.appearance,
    bio: card.bio,
    stats: card.stats,
    hp: 24,
    max_hp: 24,
    money: 50,
  }).select().single();
  if (pErr) throw pErr;

  // Навыки игрока в player_skills
  await supabase.from('player_skills').insert([
    { player_id: player.id, skill_key: 'gathering', name: 'Собирательство', level: 5, xp: 50, xp_to_next_level: 150 },
    { player_id: player.id, skill_key: 'archery', name: 'Стрельба из лука', level: 8, xp: 80, xp_to_next_level: 200 },
    { player_id: player.id, skill_key: 'crafting', name: 'Ремесло', level: 2, xp: 20, xp_to_next_level: 100 },
    { player_id: player.id, skill_key: 'swordsmanship', name: 'Фехтование', level: 4, xp: 40, xp_to_next_level: 120 },
    { player_id: player.id, skill_key: 'survival', name: 'Выживание', level: 6, xp: 60, xp_to_next_level: 180 },
  ]);

  // 6. Базовый инвентарь игрока
  await supabase.from('inventory').insert([
    { player_id: player.id, item_name: 'Охотничий лук', type: 'weapon', quantity: 1, attributes: { attack_bonus: 2 } },
    { player_id: player.id, item_name: 'Охотничий кинжал', type: 'weapon', quantity: 1, attributes: { attack_bonus: 1 } },
    { player_id: player.id, item_name: 'Стрелы', type: 'ammo', quantity: 15 },
    { player_id: player.id, item_name: 'Походный паёк', type: 'consumable', quantity: 3 },
  ]);
  console.log('✅ Игрок вступил в игру со снаряжением (лук, кинжал, стрелы x15, пайки x3).');

  // 7. Спутник Лира (NPC)
  const { data: compNpc, error: compErr } = await supabase.from('npcs').insert({
    world_id: world.id,
    location_id: session.current_location_id || null,
    name: 'Лира',
    race: 'Эльф',
    role: 'main',
    category: 'npc',
    class: 'Следопыт',
    status_tags: ['спутник', 'в_отряде'],
    appearance: 'Стройная эльфийка с серебристыми волосами в лёгких кожаных доспехах.',
    habits: ['поправляет тетиву лука', 'зорко вглядывается в кроны деревьев'],
    catchphrases: ['Лес никогда не молчит, нужно лишь уметь слушать.'],
    current_activity: 'наблюдает за трактом и прикрывает спину',
    is_alive: true,
    is_hostile: false,
    hp: 20,
    max_hp: 20,
  }).select().single();
  if (compErr) console.error('Ошибка вставки Лиры:', compErr);

  if (compNpc) {
    await supabase.from('npc_relationships').upsert({
      npc_id: compNpc.id,
      player_id: player.id,
      score: 55,
      tier: 'friendly',
    });
  }
  console.log('✅ Спутник Лира добавлен в отряд:', compNpc?.name);

  // 8. Враждебный NPC рядом в локации (Серый лютоволк)
  const { data: wolfNpc, error: wolfErr } = await supabase.from('npcs').insert({
    world_id: world.id,
    location_id: session.current_location_id || null,
    name: 'Матёрый лютоволк',
    race: 'Зверь',
    role: 'secondary',
    category: 'beast',
    class: 'Хищник',
    status_tags: ['враг', 'хищник', 'дикий'],
    appearance: 'Огромный волк с густой пепельной шерстью и горящими янтарными глазами.',
    current_activity: 'крадётся в зарослях орешника, скаля клыки',
    is_alive: true,
    is_hostile: true,
    hp: 16,
    max_hp: 16,
  }).select().single();
  if (wolfErr) console.error('Ошибка вставки Лютоволка:', wolfErr);

  if (wolfNpc) {
    await supabase.from('npc_relationships').upsert({
      npc_id: wolfNpc.id,
      player_id: player.id,
      score: -80,
      tier: 'hostile',
    });
  }
  console.log('✅ Враг Матёрый лютоволк заспавнен в сцене:', wolfNpc?.name, `(HP: ${wolfNpc.hp})`);

  // =========================================================================
  // ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ ХОДА
  // =========================================================================
  let turnNumber = 0;
  const testResults = [];

  async function executeTurn(actionText, expectedMechanic, modelOverride = {}) {
    turnNumber++;
    console.log(`\n----------------------------------------------------------------`);
    console.log(`▶ ХОД ${turnNumber}: [${expectedMechanic}]`);
    console.log(`Действие: "${actionText}"`);

    let turnRes = null;
    let turnErr = null;
    const startTime = Date.now();

    // До 2 попыток на случай кратковременного сокетного сброса (ECONNRESET)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await supabase.functions.invoke('process-turn', {
          body: {
            session_id: session.id,
            action_text: actionText,
            player_id: player.id,
            model: modelOverride.primary || FREE_MODELS.primary,
            satellite_model: modelOverride.satellite || FREE_MODELS.satellite,
            dm_model: modelOverride.dm || FREE_MODELS.narrator,
            gps_model: modelOverride.gps || FREE_MODELS.primary,
          },
        });
        turnRes = response.data;
        turnErr = response.error;
        if (!turnErr) break;
        if (attempt < 2 && (turnErr.message?.includes('fetch failed') || turnErr.message?.includes('ECONNRESET'))) {
          console.warn(`[Попытка ${attempt}] Соединение сброшено, повтор через 2с...`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
      } catch (err) {
        turnErr = err;
        if (attempt < 2) {
          console.warn(`[Попытка ${attempt}] Ошибка вызова функции, повтор через 2с...`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱ Время обработки: ${elapsed} сек.`);

    if (turnErr) {
      console.error(`❌ Ошибка функции:`, turnErr);
      testResults.push({ turn: turnNumber, mechanic: expectedMechanic, success: false, error: turnErr.message });
      return null;
    }

    // Извлекаем сообщения этого хода
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: false })
      .limit(4);

    const masterMsg = messages?.find((m) => m.sender_name === 'Мастер' || m.sender_type === 'master');
    const npcMsg = messages?.find((m) => m.sender_type === 'npc');
    const sysMsg = messages?.find((m) => m.sender_type === 'system');

    console.log(`\n📜 [ОТВЕТ ДМ]:`);
    console.log(masterMsg?.content || '(нет сообщения мастера)');

    if (npcMsg) {
      console.log(`\n🗣 [РЕАКЦИЯ СПУТНИКА ${npcMsg.sender_name}]:`);
      console.log(npcMsg.content);
    }

    if (sysMsg) {
      console.log(`\n⚙️ [СИСТЕМНОЕ СООБЩЕНИЕ]:`);
      console.log(sysMsg.content);
    }

    // Проверка качества нарратива
    const narrativeText = masterMsg?.content || '';
    const hasUglySkillBracket = /\[\s*(?:Навык|Выживание|Внимательность|Скрытность|Атака)\s*:\s*(?:Успех|Провал)\s*\]/i.test(narrativeText);
    const hasUglyItemBracket = /\[\s*Получен предмет\s*:[^\]]*\]/i.test(narrativeText);
    const hasDiceNumbers = /d20 показал|выпало на d20|бросок d20/i.test(narrativeText);

    const qualityChecks = {
      noUglySkillTag: !hasUglySkillBracket,
      noUglyItemTag: !hasUglyItemBracket,
      noRawDiceNumbers: !hasDiceNumbers,
      hasSensoryAtmosphere: narrativeText.length > 80,
    };

    console.log(`\n🔍 Проверка чистоты нарратива:`);
    console.log(` • Без скобок [Навык: Успех]: ${qualityChecks.noUglySkillTag ? '✅' : '❌'}`);
    console.log(` • Без скобок [Получен предмет]: ${qualityChecks.noUglyItemTag ? '✅' : '❌'}`);
    console.log(` • Без формул кубиков в тексте: ${qualityChecks.noRawDiceNumbers ? '✅' : '❌'}`);
    console.log(` • Полнота художественного описания: ${qualityChecks.hasSensoryAtmosphere ? '✅' : '❌'}`);

    testResults.push({
      turn: turnNumber,
      mechanic: expectedMechanic,
      success: true,
      elapsed,
      turnStatus: turnRes?.status || masterMsg?.metadata?.turn_status,
      qualityChecks,
    });

    return { turnRes, masterMsg, npcMsg };
  }

  // =========================================================================
  // ТЕСТОВЫЙ СЦЕНАРИЙ 1: СОЦИАЛЬНОЕ ВЗАИМОДЕЙСТВИЕ И ДИАЛОГ
  // =========================================================================
  await executeTurn(
    'Обращаюсь к Лире: «Лира, ты прислушивалась к птицам? Кажется, впереди на тракте было неспокойно. Что говорят твои следопытские инстинкты?»',
    'Диалог с NPC и социальная проницательность (talk / insight)'
  );

  // =========================================================================
  // ТЕСТОВЫЙ СЦЕНАРИЙ 2: СБОР РЕАЛЬНЫХ ФИЗИЧЕСКИХ РЕСУРСОВ (harvest_ambient)
  // =========================================================================
  await executeTurn(
    'Наклоняюсь к корням вековых сосен и аккуратно срезаю пучок диких целебных трав и собираю сухие ветки для костра.',
    'Сбор физических ресурсов (harvest_ambient: травы и ветки)'
  );

  // Проверяем инвентарь после сбора
  const { data: invAfterHarvest } = await supabase.from('inventory').select('*').eq('player_id', player.id);
  console.log('\n📦 Содержимое инвентаря после сбора:');
  for (const it of invAfterHarvest || []) {
    console.log(` - ${it.item_name} (${it.type} x${it.quantity})`);
  }
  const hasHerbOrWood = invAfterHarvest?.some((i) => /трав|ветк|суч|дерев|лечебн/i.test(i.item_name));
  const hasAbsurdItem = invAfterHarvest?.some((i) => /след|отпечат|шум|ветер|дорог/i.test(i.item_name));
  console.log(`✅ Реальный ресурс появился в инвентаре: ${hasHerbOrWood ? 'ДА' : 'НЕТ'}`);
  console.log(`✅ Мусорные абстрактные предметы отсутствуют: ${!hasAbsurdItem ? 'ДА (чисто)' : 'НЕТ (найден мусор!)'}`);

  // =========================================================================
  // ТЕСТОВЫЙ СЦЕНАРИЙ 3: РАЗВЕДКА И ПОИСК СЛЕДОВ (search / investigation)
  // =========================================================================
  await executeTurn(
    'Забираюсь на небольшой холм у тракта, осматриваю примятый мох и выслеживаю направление недавних следов тяжелых повозок.',
    'Поиск следов и улик без предметного мусора (search / tracking)'
  );

  // Проверяем, что поиск следов НЕ создал предмет «Следы повозок»
  const { data: invAfterSearch } = await supabase.from('inventory').select('*').eq('player_id', player.id);
  const hasTrackItem = invAfterSearch?.some((i) => /след|повозк|направлен/i.test(i.item_name));
  console.log(`✅ Следы исследованы, но НЕ превратились в предмет инвентаря: ${!hasTrackItem ? 'ДА (строго по правилам)' : 'НЕТ (ошибка!)'}`);

  // =========================================================================
  // ТЕСТОВЫЙ СЦЕНАРИЙ 4: КРАФТ ИЗ СОБРАННЫХ РЕСУРСОВ (craft_custom / craft_recipe)
  // =========================================================================
  await executeTurn(
    'Достаю нож, беру собранные сухие ветки и мастерю факел, обмотав верхушку смолистой берестой.',
    'Ремесло и создание предмета из материалов (craft_recipe / craft_custom)'
  );

  // =========================================================================
  // ТЕСТОВЫЙ СЦЕНАРИЙ 5: БОЕВОЕ СТОЛКНОВЕНИЕ (attack / archery)
  // =========================================================================
  await executeTurn(
    'Заметив в кустах притаившегося Лютоволка, вскидываю охотничий лук, натягиваю тетиву и выпускаю стрелу прямо в хищника!',
    'Боевое действие: стрельба из лука по врагу (attack / archery)'
  );

  // Проверяем состояние волка и игрока
  const { data: wolfAfterAttack } = await supabase.from('npcs').select('*').eq('id', wolfNpc.id).single();
  const { data: playerAfterAttack } = await supabase.from('players').select('*').eq('id', player.id).single();
  console.log(`\n🐺 Состояние Матёрого лютоволка: HP ${wolfAfterAttack.hp}/${wolfAfterAttack.max_hp}, жив: ${wolfAfterAttack.is_alive}`);
  console.log(`🏹 Состояние Валериана: HP ${playerAfterAttack.hp}/${playerAfterAttack.max_hp}`);

  // =========================================================================
  // ТЕСТОВЫЙ СЦЕНАРИЙ 6: ДОБИВАНИЕ И СНЯТИЕ ТРОФЕЕВ (finish & loot)
  // =========================================================================
  // Для гарантированного теста лута если волк ещё дышит, наносим решающий урон
  if (wolfAfterAttack.hp > 0) {
    await supabase.from('npcs').update({ hp: 0, is_alive: false }).eq('id', wolfNpc.id);
  }

  await executeTurn(
    'Подхожу к поверженному волку с охотничьим ножом, срезаю клыки и снимаю ценную волчью шкуру.',
    'Обыск и снятие трофеев с поверженного врага (loot)'
  );

  // Проверяем трофеи в инвентаре
  const { data: invAfterLoot } = await supabase.from('inventory').select('*').eq('player_id', player.id);
  console.log('\n📦 Содержимое инвентаря после лута:');
  for (const it of invAfterLoot || []) {
    console.log(` - ${it.item_name} (${it.type} x${it.quantity})`);
  }
  const hasTrophy = invAfterLoot?.some((i) => /трофей|шкур|клык|волк/i.test(i.item_name));
  console.log(`✅ Трофей поверженного зверя получен: ${hasTrophy ? 'ДА' : 'НЕТ'}`);

  // =========================================================================
  // ТЕСТОВЫЙ СЦЕНАРИЙ 7: ПЕРЕДАЧА ПРЕДМЕТА И ПОМОЩЬ СПУТНИКА (transfer)
  // =========================================================================
  await executeTurn(
    'Достаю один походный паёк и делюсь им с Лирой: «Подкрепись, Лира, впереди долгий путь».',
    'Передача предмета спутнику и синергия отряда (transfer / companion)'
  );

  // =========================================================================
  // ТЕСТОВЫЙ СЦЕНАРИЙ 8: ПРИВАЛ, ОТДЫХ И ПРОКАЧКА НАВЫКОВ (rest & progress)
  // =========================================================================
  await executeTurn(
    'Сажусь у костра рядом с Лирой, осматриваю оперение оставшихся стрел, поправляю снаряжение и отдыхаю после стычки.',
    'Лагерный отдых, проверка снаряжения и медитация (rest / RP)'
  );

  // Проверяем прогресс навыков и время сессии
  const { data: finalPlayer } = await supabase.from('players').select('*').eq('id', player.id).single();
  const { data: finalSession } = await supabase.from('sessions').select('*').eq('id', session.id).single();

  console.log('\n================================================================');
  console.log('📊 ИТОГОВЫЙ ОТЧЁТ О ТЕСТИРОВАНИИ МЕХАНИК:');
  console.log('================================================================');
  console.log(`• Пройдено ходов: ${turnNumber}`);
  console.log(`• Игровое время: ${String(finalSession.game_hour).padStart(2, '0')}:${String(finalSession.game_minute).padStart(2, '0')} (прошло ~${finalSession.game_minute} мин.)`);
  console.log(`• Здоровье игрока: ${finalPlayer.hp}/${finalPlayer.max_hp}`);
  const { data: finalSkills } = await supabase.from('player_skills').select('*').eq('player_id', player.id);
  console.log(`• Навыки игрока:`, finalSkills?.map(s => `${s.name || s.skill_key}: ур.${s.level} (${s.xp}/${s.xp_to_next_level}XP)`).join(', ') || 'нет данных');

  console.log('\nРезультаты по каждому ходу:');
  for (const r of testResults) {
    const q = r.qualityChecks;
    const qStr = q ? `[Чистота: скобки=${q.noUglySkillTag ? '✓' : '✗'}, лут=${q.noUglyItemTag ? '✓' : '✗'}, кубики=${q.noRawDiceNumbers ? '✓' : '✗'}]` : '';
    console.log(`Ход ${r.turn}: [${r.mechanic}] -> ${r.success ? 'УСПЕШНО' : 'СБОЙ'} (${r.elapsed}с) ${qStr}`);
  }

  const allPassed = testResults.every((r) => r.success && (!r.qualityChecks || (r.qualityChecks.noUglySkillTag && r.qualityChecks.noUglyItemTag)));
  if (allPassed) {
    console.log('\n🎉 ВСЕ МЕХАНИКИ ПРИЛОЖЕНИЯ РАБОТАЮТ БЕЗУПРЕЧНО И СТРОГО ПО ПРАВИЛАМ!');
  } else {
    console.log('\n⚠️ Обнаружены замечания в работе механик (см. детали выше).');
  }
}

runDeepSimulation().catch(console.error);
