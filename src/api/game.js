// src/api/game.js — API-методы для игровой логики
import { supabase } from './supabase.js';

// ===================== WORLDS =====================

export async function getWorlds() {
  const { data, error } = await supabase
    .from('worlds')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getWorld(id) {
  const { data, error } = await supabase
    .from('worlds')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createWorld(world) {
  const { data, error } = await supabase
    .from('worlds')
    .insert(world)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateWorld(id, updates) {
  const { data, error } = await supabase
    .from('worlds')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteWorld(id) {
  const { error } = await supabase.from('worlds').delete().eq('id', id);
  if (error) throw error;
}

// ===================== LORE FILES =====================

export async function getLoreFiles(worldId, folder = null) {
  let query = supabase
    .from('lore_files')
    .select('*')
    .eq('world_id', worldId)
    .order('title');

  if (folder) query = query.eq('folder', folder);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getLoreFilesByFolder(worldId) {
  const { data, error } = await supabase
    .from('lore_files')
    .select('folder')
    .eq('world_id', worldId);
  if (error) throw error;
  const folders = [...new Set(data.map((f) => f.folder))];
  return folders;
}

export async function createLoreFile(file) {
  const { data, error } = await supabase
    .from('lore_files')
    .insert(file)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateLoreFile(id, updates) {
  const { data, error } = await supabase
    .from('lore_files')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLoreFile(id) {
  const { error } = await supabase.from('lore_files').delete().eq('id', id);
  if (error) throw error;
}

// ===================== SESSIONS =====================

export async function getSessions() {
  const { data: sessions, error: sessErr } = await supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: false });
  if (sessErr) throw sessErr;

  // Загружаем мира и игроков отдельно (RLS запрещает join)
  const worldIds = [...new Set(sessions.map((s) => s.world_id))];
  const { data: worlds } = await supabase.from('worlds').select('id, name').in('id', worldIds.length ? worldIds : ['00000000-0000-0000-0000-000000000000']);
  const worldMap = {};
  (worlds || []).forEach((w) => { worldMap[w.id] = w; });

  const result = await Promise.all(
    sessions.map(async (s) => {
      const { data: players } = await supabase
        .from('players')
        .select('id, name, user_id, hp, max_hp, is_active')
        .eq('session_id', s.id);
      return { ...s, worlds: worldMap[s.world_id] || null, players: players || [] };
    })
  );

  return result;
}

export async function getSession(id) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*, worlds(name, settings)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createSession(session) {
  const { data, error } = await supabase
    .from('sessions')
    .insert(session)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSession(id, updates) {
  const { data, error } = await supabase
    .from('sessions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ===================== PLAYERS =====================

export async function getSessionPlayers(sessionId) {
  const { data, error } = await supabase
    .from('players')
    .select('*, inventory(*)')
    .eq('session_id', sessionId);
  if (error) throw error;
  return data;
}

export async function getPlayer(id) {
  const { data, error } = await supabase
    .from('players')
    .select('*, inventory(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createPlayer(player) {
  const { data, error } = await supabase
    .from('players')
    .insert(player)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePlayer(id, updates) {
  const { data, error } = await supabase
    .from('players')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePlayer(id) {
  const { error } = await supabase.from('players').delete().eq('id', id);
  if (error) throw error;
}

// ===================== INVENTORY =====================

export async function getPlayerInventory(playerId) {
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('player_id', playerId)
    .order('item_name');
  if (error) throw error;
  return data;
}

export async function addInventoryItem(item) {
  const { data, error } = await supabase
    .from('inventory')
    .insert(item)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInventoryItem(id, updates) {
  const { data, error } = await supabase
    .from('inventory')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeInventoryItem(id) {
  const { error } = await supabase.from('inventory').delete().eq('id', id);
  if (error) throw error;
}

// ===================== MESSAGES =====================

export async function getSessionMessages(sessionId, limit = 50) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function sendMessage(message) {
  const { data, error } = await supabase
    .from('messages')
    .insert(message)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ===================== TURN MANAGEMENT =====================

export async function getCurrentTurn(sessionId) {
  const { data, error } = await supabase
    .from('turn_queue')
    .select('*')
    .eq('session_id', sessionId)
    .eq('status', 'active')
    .order('created_at')
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function submitAction(sessionId, playerId, actionText) {
  const { data, error } = await supabase.functions.invoke('process-turn', {
    body: { session_id: sessionId, player_id: playerId, action_text: actionText },
  });
  if (error) {
    // Supabase оборачивает ошибку — извлекаем сообщение
    const msg = error.message || error.context?.message || 'Неизвестная ошибка';
    // Проверяем на 402 (отсутствие API ключа)
    if (error.context?.status === 402 || data?.code === 'MISSING_API_KEY') {
      throw new Error('MISSING_API_KEY');
    }
    throw new Error(msg);
  }
  return data;
}

// ===================== CHARACTER CARDS =====================

export async function getCharacterCards(userId) {
  const { data, error } = await supabase
    .from('character_cards')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getCharacterCard(id) {
  const { data, error } = await supabase
    .from('character_cards')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createCharacterCard(card) {
  const { data, error } = await supabase
    .from('character_cards')
    .insert(card)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCharacterCard(id, updates) {
  const { data, error } = await supabase
    .from('character_cards')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCharacterCard(id) {
  const { error } = await supabase.from('character_cards').delete().eq('id', id);
  if (error) throw error;
}

// ===================== USER SETTINGS =====================

export async function getUserSettings(userId) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertUserSettings(userId, openrouterKey, models = {}) {
  const { data, error } = await supabase.rpc('upsert_user_settings', {
    p_user_id: userId,
    p_openrouter_key: openrouterKey || null,
    p_card_model: models.card_model || null,
    p_dm_model: models.dm_model || null,
  });
  if (error) throw error;
  return data;
}

// ===================== IMPORT / EXPORT =====================

export async function exportWorld(worldId) {
  const world = await getWorld(worldId);
  const loreFiles = await getLoreFiles(worldId);
  const folders = await getLoreFilesByFolder(worldId);
  
  // Get states with locations
  const { data: states } = await supabase
    .from('states')
    .select('*, locations(*)')
    .eq('world_id', worldId)
    .order('name');
  
  // Get NPCs with location info
  const { data: npcs } = await supabase
    .from('npcs')
    .select('*')
    .eq('world_id', worldId)
    .order('role')
    .order('name');

  const exportData = {
    version: '3.1',
    exported_at: new Date().toISOString(),
    schema: 'multirp_world_full',
    world: {
      name: world.name,
      settings: world.settings,
      description: world.description || '',
    },
    lore_files: loreFiles.map((f) => ({
      folder: f.folder,
      title: f.title,
      content: f.content,
      tags: f.tags,
    })),
    folders,
    geography: {
      states: states?.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        ruler_id: s.ruler_id,
        locations: s.locations?.map(l => ({
          id: l.id,
          name: l.name,
          type: l.type,
          description: l.description,
        })) || [],
      })) || [],
    },
    bestiary: {
      npcs: npcs?.map(n => ({
        id: n.id,
        name: n.name,
        race: n.race,
        category: n.category,
        role: n.role,
        appearance: n.appearance,
        background: n.background,
        stats: n.stats,
        hp: n.hp,
        max_hp: n.max_hp,
        level: n.level,
        armor_class: n.armor_class,
        initiative: n.initiative,
        saving_throws: n.saving_throws,
        status_tags: n.status_tags,
        habits: n.habits,
        catchphrases: n.catchphrases,
        location_id: n.location_id,
        state_id: n.state_id,
        // New fields
        special_attacks: n.special_attacks,
        base_attacks: n.base_attacks,
        is_pack: n.is_pack_instance,
        pack_size: n.pack_size,
        is_unique: n.is_unique || false,
      })) || [],
    },
  };

  return exportData;
}

export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Get schema info for display
export function getWorldSchema() {
  return {
    version: '3.1',
    description: 'Полный экспорт мира MultiRP',
    structure: {
      version: 'string - версии формата',
      exported_at: 'ISO timestamp',
      schema: 'идентификатор схемы',
      world: {
        name: 'string - название мира',
        settings: 'object - настройки мира (races, classes, max_level и т.д.)',
        description: 'string - описание',
      },
      lore_files: [{
        folder: 'string - папка',
        title: 'string - заголовок',
        content: 'string - содержимое',
        tags: ['string - теги'],
      }],
      folders: ['string - список папок'],
      geography: {
        states: [{
          id: 'UUID',
          name: 'string - название государства',
          description: 'string - описание',
          ruler_id: 'UUID - ID правителя (NPC)',
          locations: [{
            id: 'UUID',
            name: 'string - название локации',
            type: 'capital|city|village|ruins|landmark',
            description: 'string - описание',
          }],
        }],
      },
      bestiary: {
        npcs: [{
          id: 'UUID',
          name: 'string - имя или название вида (для зверей/монстров)',
          race: 'string - раса',
          category: 'npc|beast|monster|boss',
          role: 'main|secondary|tertiary',
          appearance: 'string - внешность',
          background: 'string - предыстория',
          stats: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
          hp: 'number - текущее здоровье',
          max_hp: 'number - максимальное здоровье',
          level: 'number - уровень (1-20)',
          armor_class: 'number - класс брони (КД)',
          initiative: 'number - инициатива (модификатор DEX)',
          saving_throws: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
          status_tags: ['string'],
          habits: ['string - привычки'],
          catchphrases: ['string - фразы'],
          location_id: 'UUID - ID локации (только для NPC)',
          state_id: 'UUID - ID государства',
        }],
      },
    },
    // Критерии ИИ для генерации
    ai_criteria: {
      description: 'Система правил для генерации контента ИИ',
      entity_unification: {
        description: 'Унификация сущностей — приведение к единому формату',
        rules: [
          'Все имена собственные на русском языке (транслитерация запрещена)',
          'Расы из настроек мира (world.settings.races) — если не указаны, использовать стандартные D&D',
          'Классы из настроек мира (world.settings.classes)',
          'Статы в диапазоне 1-30, сумма: 50 (слабые существа) до 200 (легендарные)',
          'Игрок начинает с 72 — существа могут быть слабее или сильнее',
          'HP = CON × уровень × 1.5 (существа слабее игрока)',
        ],
      },
      character_tiers: {
        description: 'Система уровней персонажей',
        tiers: {
          main: 'Главные персонажи (протагонисты, антагонисты, ключевые фигуры)',
          secondary: 'Второстепенные персонажи (спутники, торговцы, стражники)',
          tertiary: 'Третьестепенные (звери, монстры — без имени, только вид)',
        },
      },
      naming_rules: {
        description: 'Правила именования',
        rules: [
          'Звери/монстры: имя НЕ ДАВАТЬ! Только вид: "Волк", "Гоблин"',
          'Имя только: уникальным боссам (is_unique: true) и NPC-людям',
          'Стаи (is_pack: true) — группа существ без имени',
        ],
      },
      tier_level_system: {
        description: 'Система Потенциал (Tier) vs Уровень (Level)',
        tier: 'Tier (1-5) = ПОТЕНЦИАЛ — максимальные возможности, количество спецатак',
        level: 'Level (1-100) = ТЕКУЩАЯ СИЛА — насколько раскрыт потенциал',
        examples: [
          'Детеныш дракона: Tier 5, Level 1 (слаб, но 5 спецатак)',
          'Взрослый дракон: Tier 5, Level 80 (могуществен)',
        ],
      },
      combat_stats: {
        description: 'Расчёт боевых характеристик',
        formulas: {
          stat_sum: '50 (level 1, tier 1) до 200 (level 100, tier 5)',
          armor_class: '10 + модификатор DEX + расовый бонус',
          initiative: 'Модификатор DEX = floor((DEX - 10) / 2)',
          hp: 'CON × уровень × 1.5 (существа слабее игрока)',
          special_attacks: '1 на каждый Tier (Tier 5 = 5 спецатак)',
          base_attacks: '2 на уровни 1-10, +1 за каждые 10 уровней',
        },
      },
      damage_types: {
        description: 'Типы урона (D&D система)',
        physical: 'slashing (режущий), piercing (колющий), bludgeoning (дробящий)',
        elemental: 'fire (огонь, DoT), cold (холод), lightning (молния), thunder (звук)',
        magical: 'acid (кислота, DoT), poison (яд, DoT), necrotic (некроз), radiant (свет), psychic (психический), force (силовой)',
        dot_types: 'fire (2-3 хода), acid (2 хода), poison (3 хода)',
      },
    },
  };
}

export async function importWorld(jsonData, ownerId) {
  const worldData = JSON.parse(jsonData);
  
  // Validate schema
  if (!worldData.world || !worldData.version) {
    throw new Error('Некорректный формат файла мира');
  }

  const world = await createWorld({
    owner_id: ownerId,
    name: worldData.world.name,
    settings: worldData.world.settings,
    description: worldData.world.description || '',
  });

  // Import lore files
  let loreCount = 0;
  if (worldData.lore_files?.length) {
    const files = worldData.lore_files.map((f) => ({
      world_id: world.id,
      folder: f.folder,
      title: f.title,
      content: f.content,
      tags: f.tags || [],
    }));
    const { error } = await supabase.from('lore_files').insert(files);
    if (error) throw error;
    loreCount = files.length;
  }

  // Import geography (states + locations)
  const locationIdMap = {}; // old ID -> new ID
  const stateIdMap = {}; // old ID -> new ID
  let stateCount = 0;
  let locationCount = 0;
  
  if (worldData.geography?.states?.length) {
    for (const state of worldData.geography.states) {
      const { data: newState, error: stateError } = await supabase
        .from('states')
        .insert({
          world_id: world.id,
          name: state.name,
          description: state.description || '',
        })
        .select()
        .single();
      
      if (stateError) throw stateError;
      stateIdMap[state.id] = newState.id;
      stateCount++;
      
      // Import locations for this state
      if (state.locations?.length) {
        const locations = state.locations.map(l => ({
          state_id: newState.id,
          name: l.name,
          type: l.type || 'city',
          description: l.description || '',
        }));
        
        const { data: newLocations, error: locError } = await supabase
          .from('locations')
          .insert(locations)
          .select();
        
        if (locError) throw locError;
        locationCount += newLocations.length;
        
        // Map old location IDs to new ones
        state.locations.forEach((oldLoc, idx) => {
          if (newLocations[idx]) {
            locationIdMap[oldLoc.id] = newLocations[idx].id;
          }
        });
      }
    }
  }

  // Import NPCs
  let npcCount = 0;
  if (worldData.bestiary?.npcs?.length) {
    // Build name-based lookups for locations and states
    const locationNameToId = {};
    const stateNameToId = {};
    
    // Fetch all locations and states for this world to build name lookup
    const { data: allLocations } = await supabase
      .from('locations')
      .select('id, name, states!inner(name)')
      .eq('world_id', world.id);
    
    if (allLocations) {
      allLocations.forEach(l => {
        locationNameToId[l.name.toLowerCase().trim()] = l.id;
      });
    }
    
    const { data: allStates } = await supabase
      .from('states')
      .select('id, name')
      .eq('world_id', world.id);
    
    if (allStates) {
      allStates.forEach(s => {
        stateNameToId[s.name.toLowerCase().trim()] = s.id;
      });
    }
    
    const npcs = worldData.bestiary.npcs.map(n => {
      // Resolve location_id: can be UUID (from export) or name (manual JSON)
      let locationId = null;
      if (n.location_id) {
        // Try UUID mapping first (from export)
        locationId = locationIdMap[n.location_id] || null;
        // If not found, try name lookup
        if (!locationId && typeof n.location_id === 'string') {
          locationId = locationNameToId[n.location_id.toLowerCase().trim()] || null;
        }
      }
      
      // Resolve state_id: can be UUID (from export) or name (manual JSON)
      let stateId = null;
      if (n.state_id) {
        // Try UUID mapping first (from export)
        stateId = stateIdMap[n.state_id] || null;
        // If not found, try name lookup
        if (!stateId && typeof n.state_id === 'string') {
          stateId = stateNameToId[n.state_id.toLowerCase().trim()] || null;
        }
      }
      
      return {
        world_id: world.id,
        name: n.name,
        race: n.race || 'Человек',
        category: n.category || 'npc',
        role: ['main', 'secondary', 'tertiary'].includes(n.role) ? n.role : 'secondary',
        appearance: n.appearance || '',
        background: n.background || '',
        stats: n.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        hp: n.hp || 30,
        max_hp: n.max_hp || 30,
        level: n.level || 1,
        armor_class: n.armor_class || 10,
        initiative: n.initiative || 0,
        saving_throws: n.saving_throws && typeof n.saving_throws === 'object' ? n.saving_throws : {},
        status_tags: n.status_tags || [],
        habits: n.habits || [],
        catchphrases: n.catchphrases || [],
        location_id: locationId,
        state_id: stateId,
        // Combat fields
        special_attacks: Array.isArray(n.special_attacks) ? n.special_attacks : [],
        base_attacks: Array.isArray(n.base_attacks) ? n.base_attacks : [],
        is_pack_instance: n.is_pack === true,
        pack_size: n.is_pack ? (n.pack_size || 2) : 1,
      };
    });
    
    const { error: npcError } = await supabase.from('npcs').insert(npcs);
    if (npcError) throw npcError;
    npcCount = npcs.length;
  }

  return {
    world,
    stats: {
      loreCount,
      stateCount,
      locationCount,
      npcCount,
      hasGeography: stateCount > 0,
      hasBestiary: npcCount > 0,
    },
  };
}

// ===================== NPC BESTIARY =====================

export async function getNpcsByWorld(worldId) {
  const { data, error } = await supabase
    .from('npcs')
    .select('*, locations(name)')
    .eq('world_id', worldId)
    .order('role', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  // Flatten location name for easier access
  return data?.map(npc => ({
    ...npc,
    location_name: npc.locations?.name || null,
    locations: undefined,
  })) || [];
}

export async function getNpc(id) {
  const { data, error } = await supabase
    .from('npcs')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createNpc(npc) {
  const { data, error } = await supabase
    .from('npcs')
    .insert(npc)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateNpc(id, updates) {
  // Resolve location_name to location_id if provided
  if (updates.location_name !== undefined) {
    const locationName = updates.location_name;
    delete updates.location_name;
    if (locationName) {
      const { data: location } = await supabase
        .from('locations')
        .select('id')
        .ilike('name', locationName)
        .maybeSingle();
      updates.location_id = location?.id || null;
    } else {
      updates.location_id = null;
    }
  }
  
  const { data, error } = await supabase
    .from('npcs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteNpc(id) {
  const { error } = await supabase.from('npcs').delete().eq('id', id);
  if (error) throw error;
}

export async function exportPlayer(playerId) {
  const player = await getPlayer(playerId);
  const inventory = await getPlayerInventory(playerId);

  const exportData = {
    version: '2.0',
    exported_at: new Date().toISOString(),
    player: {
      name: player.name,
      race: player.race,
      class: player.class,
      appearance: player.appearance,
      personality: player.personality,
      bio: player.bio,
      power_level: player.power_level,
      stats: player.stats,
      hp: player.hp,
      max_hp: player.max_hp,
      money: player.money,
    },
    inventory: inventory.map((item) => ({
      item_name: item.item_name,
      quantity: item.quantity,
      type: item.type,
      attributes: item.attributes,
    })),
  };

  return exportData;
}
