const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://xhzpxiiqrtmeduynqmsd.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoenB4aWlxcnRtZWR1eW5xbXNkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM0NTk3MSwiZXhwIjoyMTAxOTIxOTcxfQ.VnJwWDCFRG3PZxGTzYOWEPTNrUjY2fQ9Wi_rPEqTJfE';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function testFlow() {
  console.log('1. Checking user...');
  const testEmail = 'auto_test_player_2026@test.com';
  let userId = null;
  const { data: usersData, error: uErr } = await supabase.auth.admin.listUsers();
  const existingUser = usersData?.users?.find(u => u.email === testEmail);
  if (existingUser) {
    userId = existingUser.id;
    console.log('User exists:', userId);
  } else {
    const { data: createdUser, error: cErr } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: 'TestPassword123!',
      email_confirm: true
    });
    if (cErr) throw cErr;
    userId = createdUser.user.id;
    console.log('Created user:', userId);
  }

  // Check OpenRouter key in user_settings
  console.log('2. Verifying user_settings OpenRouter key...');
  const { data: settings } = await supabase.from('user_settings').select('*').limit(1);
  const openrouterKey = settings?.[0]?.openrouter_key;
  console.log('Using OpenRouter Key:', openrouterKey ? openrouterKey.slice(0, 15) + '...' : 'NONE');

  // Insert user settings if needed
  await supabase.from('user_settings').upsert({
    id: userId,
    openrouter_key: openrouterKey,
    dm_model: 'meta-llama/llama-3.3-70b-instruct:free',
    satellite_model: 'meta-llama/llama-3.3-70b-instruct:free',
    gps_model: 'google/gemini-2.5-flash:free',
    card_model: 'meta-llama/llama-3.3-70b-instruct:free',
  });

  // 3. Import or find world
  console.log('3. Checking world Этерия...');
  let { data: world } = await supabase.from('worlds').select('*').eq('name', 'Этерия').maybeSingle();
  if (!world) {
    console.log('World not found in DB, reading from Этерия.json...');
    const rawWorld = JSON.parse(fs.readFileSync('Этерия.json', 'utf8'));
    const { data: newWorld, error: wErr } = await supabase.from('worlds').insert({
      name: rawWorld.name || 'Этерия',
      description: rawWorld.description || 'Фэнтезийный мир',
      owner_id: userId,
      settings: rawWorld.settings || {}
    }).select().single();
    if (wErr) throw wErr;
    world = newWorld;
    console.log('World created:', world.id);
  } else {
    console.log('Found existing world:', world.id, world.name);
  }

  // 4. Create character card if not exists
  console.log('4. Creating test character card...');
  let { data: card } = await supabase.from('character_cards').select('*').eq('owner_id', userId).eq('name', 'Валериан').maybeSingle();
  if (!card) {
    const { data: newCard, error: cardErr } = await supabase.from('character_cards').insert({
      owner_id: userId,
      name: 'Валериан',
      race: 'Человек',
      class: 'Следопыт',
      bio: 'Опытный следопыт северных лесов. Спокоен, наблюдателен, верен слову.',
      appearance: 'Высокий темноволосый мужчина в дорожном плаще с капюшоном и длинным луком.',
      stats: { STR: 12, DEX: 16, CON: 14, INT: 12, WIS: 14, CHA: 10 },
      hp: 24,
      max_hp: 24,
      money: 50,
      power_level: 10
    }).select().single();
    if (cardErr) throw cardErr;
    card = newCard;
    console.log('Created character card:', card.id);
  } else {
    console.log('Found character card:', card.id);
  }

  // 5. Create Session
  console.log('5. Creating game session...');
  const { data: session, error: sessErr } = await supabase.from('sessions').insert({
    world_id: world.id,
    difficulty: 'normal',
    is_pvp_enabled: false,
    game_year: 1248,
    game_month: 5,
    game_day: 14,
    game_hour: 10,
    game_minute: 0
  }).select().single();
  if (sessErr) throw sessErr;
  console.log('Created session:', session.id);

  // 6. Join Session with player
  const { data: player, error: pErr } = await supabase.from('players').insert({
    session_id: session.id,
    user_id: userId,
    name: card.name,
    race: card.race,
    class: card.class,
    appearance: card.appearance,
    bio: card.bio,
    stats: card.stats,
    hp: card.hp,
    max_hp: card.max_hp,
    money: card.money,
  }).select().single();
  if (pErr) throw pErr;
  console.log('Player joined session:', player.id, player.name);

  // Add starting items to inventory table
  await supabase.from('inventory').insert([
    { player_id: player.id, name: 'Охотничий лук', type: 'weapon', quantity: 1 },
    { player_id: player.id, name: 'Колчан стрел (20 шт)', type: 'ammo', quantity: 20 },
    { player_id: player.id, name: 'Походный паёк', type: 'consumable', quantity: 3 }
  ]);

  // Create or attach a companion NPC in this world
  const { data: compNpc } = await supabase.from('npcs').insert({
    world_id: world.id,
    name: 'Лира',
    race: 'Эльф',
    role: 'companion',
    category: 'intelligent',
    class: 'Следопыт',
    status_tags: ['спутник', 'в_отряде'],
    appearance: 'Изящная эльфийка с серебристыми волосами в кожаной броне с кинжалом',
    habits: ['поправляет тетиву лука', 'прислушивается к шорохам ветра'],
    catchphrases: ['Лес никогда не молчит, нужно лишь уметь слушать.'],
    current_activity: 'осматривает опушку и держит ухо востро',
    is_alive: true,
    is_hostile: false
  }).select().single();
  console.log('Spawned companion NPC in scene:', compNpc?.name);

  // 7. Testing Turn 1: Free model turn processing
  console.log('\n--- 7. TESTING TURN 1: Exploration & Greeting ---');
  const turn1Action = 'Осматриваюсь вокруг, подхожу к спутнице Лире и предлагаю проверить ближайшие следы у тракта.';
  console.log('Action:', turn1Action);

  const t1Start = Date.now();
  const { data: turn1Res, error: t1Err } = await supabase.functions.invoke('process-turn', {
    body: {
      session_id: session.id,
      action_text: turn1Action,
      player_id: player.id,
      model: 'google/gemma-4-31b-it:free',
      satellite_model: 'google/gemma-4-31b-it:free',
      dm_model: 'google/gemma-4-31b-it:free',
      gps_model: 'google/gemma-4-31b-it:free'
    }
  });

  console.log('Turn 1 completed in', ((Date.now() - t1Start) / 1000).toFixed(1), 's');
  if (t1Err) console.error('Turn 1 Function error:', t1Err);
  else console.log('Turn 1 Response Status:', turn1Res?.status);

  // Fetch created messages
  const { data: msgs1 } = await supabase.from('messages').select('*').eq('session_id', session.id).order('created_at', { ascending: true });
  console.log('\nMessages generated in Turn 1:');
  for (const m of (msgs1 || [])) {
    console.log(`[${m.sender_name || m.sender_type}]:\n${m.content}\n---`);
  }

  // 8. Testing Turn 2: Creative camp action & companion synergy
  console.log('\n--- 8. TESTING TURN 2: Camp preparation & Companion Assistance ---');
  const turn2Action = 'Достаю стрелы, проверяю наконечники и прошу Лиру прикрыть стоянку, пока я разжигаю костёр.';
  console.log('Action:', turn2Action);

  const t2Start = Date.now();
  const { data: turn2Res, error: t2Err } = await supabase.functions.invoke('process-turn', {
    body: {
      session_id: session.id,
      action_text: turn2Action,
      player_id: player.id,
      model: 'google/gemma-4-31b-it:free',
      satellite_model: 'google/gemma-4-31b-it:free',
      dm_model: 'minimax/minimax-m3:free',
      gps_model: 'google/gemma-4-31b-it:free'
    }
  });

  console.log('Turn 2 completed in', ((Date.now() - t2Start) / 1000).toFixed(1), 's');
  if (t2Err) console.error('Turn 2 Function error:', t2Err);
  else console.log('Turn 2 Response Status:', turn2Res?.status);

  const { data: msgs2 } = await supabase.from('messages').select('*').eq('session_id', session.id).order('created_at', { ascending: true });
  console.log('\nNew messages in Turn 2:');
  const newMsgs = (msgs2 || []).slice(msgs1?.length || 0);
  for (const m of newMsgs) {
    console.log(`[${m.sender_name || m.sender_type}]:\n${m.content}\n---`);
  }

  // 9. Quality & Integrity Assertions
  console.log('\n--- 9. VERIFYING QUALITY CRITERIA ---');
  const { data: inventoryItems } = await supabase.from('inventory').select('*').eq('player_id', player.id);
  console.log('Current player inventory:');
  for (const it of inventoryItems || []) {
    console.log(` - ${it.name} (${it.type || 'misc'} x${it.quantity})`);
  }

  const hasDummyTracks = (inventoryItems || []).some(it => /след/i.test(it.name));
  if (hasDummyTracks) {
    console.error('❌ FAILED: Found abstract track item in inventory!');
  } else {
    console.log('✅ PASSED: No abstract track/clue items in inventory.');
  }

  const allMasterNarratives = (msgs2 || []).filter(m => m.sender_name === 'Мастер').map(m => m.content).join('\n');
  const hasUglySkillTag = /\[\s*(?:Навык|Выживание|Внимательность)\s*:\s*Успех\s*\]/i.test(allMasterNarratives);
  const hasUglyItemTag = /\[\s*Получен предмет\s*:[^\]]*\]/i.test(allMasterNarratives);

  if (hasUglySkillTag) {
    console.error('❌ FAILED: Master narrative still contains ugly [Навык: Успех] tags!');
  } else {
    console.log('✅ PASSED: Master narrative is clean of [Навык: Успех] pseudo-tags.');
  }

  if (hasUglyItemTag) {
    console.error('❌ FAILED: Master narrative still contains [Получен предмет: ...] tags!');
  } else {
    console.log('✅ PASSED: Master narrative is clean of [Получен предмет: ...] pseudo-tags.');
  }
}

testFlow().catch(console.error);
