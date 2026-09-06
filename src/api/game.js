// src/api/game.js — API-методы для игровой логики
import { supabase, invokeFunction } from './supabase.js';
import { calculateHpDnd, getHitDice, getDieAverage } from '../config/hitDice.js';
import { getRaceAcBonus } from '../config.js';

// ===================== WORLDS =====================

export async function getWorlds(ownerId = null) {
  let query = supabase
    .from('worlds')
    .select('*')
    .order('created_at', { ascending: false });

  if (ownerId) {
    query = query.eq('owner_id', ownerId);
  }

  const { data, error } = await query;
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
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('delete_world', { p_world_id: id });
    if (!rpcErr && rpcData?.success) {
      return rpcData;
    }
    if (rpcData && rpcData.success === false && rpcData.message) {
      throw new Error(rpcData.message);
    }
  } catch (err) {
    if (err.message && !err.message.includes('Could not find')) {
      throw err;
    }
  }

  const { error } = await supabase.from('worlds').delete().eq('id', id);
  if (error) throw error;
  return { success: true, deleted_world_id: id };
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

export async function getSessions(userId = null) {
  let filterParts = [];

  if (userId) {
    // 1. Получаем сессии, в которых пользователь участвует как игрок
    const { data: userPlayers } = await supabase
      .from('players')
      .select('session_id')
      .eq('user_id', userId);
    const playerSessionIds = [...new Set((userPlayers || []).map((p) => p.session_id).filter(Boolean))];

    // 2. Получаем миры пользователя (сессии, которые созданы на базе его миров)
    const { data: userWorlds } = await supabase
      .from('worlds')
      .select('id')
      .eq('owner_id', userId);
    const userWorldIds = [...new Set((userWorlds || []).map((w) => w.id).filter(Boolean))];

    // Если нет ни персонажей в сессиях, ни собственных миров — сессий у пользователя нет
    if (playerSessionIds.length === 0 && userWorldIds.length === 0) {
      return [];
    }

    if (playerSessionIds.length > 0) {
      filterParts.push(`id.in.(${playerSessionIds.join(',')})`);
    }
    if (userWorldIds.length > 0) {
      filterParts.push(`world_id.in.(${userWorldIds.join(',')})`);
    }
  }

  let query = supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: false });

  if (filterParts.length > 0) {
    query = query.or(filterParts.join(','));
  }

  const { data: sessions, error: sessErr } = await query;
  if (sessErr) throw sessErr;
  if (!sessions || sessions.length === 0) return [];

  const worldIds = [...new Set(sessions.map((s) => s.world_id).filter(Boolean))];
  const sessionIds = sessions.map((s) => s.id);

  // Параллельно забираем миры (включая owner_id для проверки прав) и всех участников всех сессий за 2 запроса
  const [{ data: worlds }, { data: allPlayers }] = await Promise.all([
    supabase.from('worlds').select('id, name, owner_id').in('id', worldIds.length ? worldIds : ['00000000-0000-0000-0000-000000000000']),
    supabase.from('players').select('id, session_id, name, user_id, hp, max_hp, is_active').in('session_id', sessionIds),
  ]);

  const worldMap = {};
  (worlds || []).forEach((w) => { worldMap[w.id] = w; });

  const playersBySession = {};
  (allPlayers || []).forEach((p) => {
    if (!playersBySession[p.session_id]) playersBySession[p.session_id] = [];
    playersBySession[p.session_id].push(p);
  });

  return sessions.map((s) => ({
    ...s,
    worlds: worldMap[s.world_id] || (s.world_name ? { id: s.world_id, name: s.world_name } : null),
    players: playersBySession[s.id] || [],
  }));
}

export async function getSession(id) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*, worlds(id, name, owner_id, settings)')
    .eq('id', id)
    .single();
  if (error) throw error;
  if (data) {
    data.current_location_name = data.current_wild_zone || null;
    data.current_state_name = null;
    if (data.current_location_id) {
      try {
        const { data: locData } = await supabase
          .from('locations')
          .select('id, name, state_id, states(name)')
          .eq('id', data.current_location_id)
          .maybeSingle();
        if (locData) {
          if (!data.current_wild_zone) {
            data.current_location_name = locData.name || null;
          }
          const stateObj = Array.isArray(locData.states) ? locData.states[0] : locData.states;
          data.current_state_name = stateObj?.name || null;
        }
      } catch (locErr) {
        console.warn('Failed to load session location details:', locErr);
      }
    }
  }

  return data;
}

export async function createSession(session) {
  let worldName = session.world_name || null;
  if (!worldName && session.world_id) {
    try {
      const { data: w } = await supabase
        .from('worlds')
        .select('name')
        .eq('id', session.world_id)
        .maybeSingle();
      if (w?.name) worldName = w.name;
    } catch {}
  }

  const sessionData = {
    game_year: 1248,
    game_month: 5,
    game_day: 14,
    game_hour: 10,
    game_minute: 0,
    world_name: worldName,
    ...session,
  };
  const { data, error } = await supabase
    .from('sessions')
    .insert(sessionData)
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

export async function deleteSession(id) {
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('delete_session', { p_session_id: id });
    if (!rpcErr && rpcData?.success) {
      return rpcData;
    }
    if (rpcData && rpcData.success === false && rpcData.message) {
      throw new Error(rpcData.message);
    }
  } catch (err) {
    if (err.message && !err.message.includes('Could not find')) {
      throw err;
    }
  }

  // Fallback: direct DELETE query with RLS cascade
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return { success: true, deleted_session_id: id };
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

// ===================== FOG OF WAR =====================

/**
 * Обновить текущую подзону игрока (для системы тумана войны).
 * Вызывается при смене зоны в рамках текущей локации.
 * @param {string} playerId
 * @param {string|null} zone - название подзоны, например "tavern_kitchen". null = основная зона.
 */
export async function updatePlayerZone(playerId, zone) {
  const { data, error } = await supabase
    .from('players')
    .update({ current_zone: zone || null })
    .eq('id', playerId)
    .select('id, current_zone')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Сохранить сгенерированную ИИ карту расстояний между зонами локации.
 * @param {string} sessionId
 * @param {object} locationMap - { "zone_a": { "zone_b": 2 }, ... }
 */
export async function updateLocationMap(sessionId, locationMap) {
  const { data, error } = await supabase
    .from('sessions')
    .update({ location_map: locationMap })
    .eq('id', sessionId)
    .select('id, location_map')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Загрузить всех игроков сессии с их зонами (облегчённый запрос для fog matrix).
 * @param {string} sessionId
 * @returns {Array<{id, name, user_id, current_zone}>}
 */
export async function getSessionPlayersWithZones(sessionId) {
  const { data, error } = await supabase
    .from('players')
    .select('id, name, user_id, current_zone')
    .eq('session_id', sessionId);
  if (error) throw error;
  return data || [];
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
    .limit(1)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function getTurnQueue(sessionId) {
  const { data, error } = await supabase
    .from('turn_queue')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function initTurnQueue(sessionId, players = []) {
  if (!sessionId || !players.length) return null;

  // 1. Получаем существующую очередь для сессии
  const { data: existing, error: fetchErr } = await supabase
    .from('turn_queue')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (fetchErr) {
    console.warn('Failed to fetch turn_queue:', fetchErr);
    return null;
  }

  // 2. Если очереди ещё нет — создаём для каждого игрока
  if (!existing || existing.length === 0) {
    const toInsert = players.map((p, idx) => ({
      session_id: sessionId,
      player_id: p.id,
      status: idx === 0 ? 'active' : 'waiting',
    }));
    const { data: created, error: insertErr } = await supabase
      .from('turn_queue')
      .insert(toInsert)
      .select();
    if (insertErr) {
      console.warn('Failed to insert turn_queue:', insertErr);
      return null;
    }
    return created?.find((t) => t.status === 'active') || created?.[0] || null;
  }

  // 3. Проверяем, есть ли игроки, которых ещё нет в очереди (зашли позже)
  const existingPlayerIds = new Set(existing.map((t) => t.player_id));
  const missingPlayers = players.filter((p) => !existingPlayerIds.has(p.id));
  if (missingPlayers.length > 0) {
    const toInsert = missingPlayers.map((p) => ({
      session_id: sessionId,
      player_id: p.id,
      status: 'waiting',
    }));
    await supabase.from('turn_queue').insert(toInsert);
  }

  // 4. Проверяем активный ход
  const activeTurn = existing.find((t) => t.status === 'active');
  if (activeTurn) {
    return activeTurn;
  }

  // Если активного хода нет, но есть ожидающие — активируем первый waiting
  const waitingTurn = existing.find((t) => t.status === 'waiting');
  if (waitingTurn) {
    const { data: updated } = await supabase
      .from('turn_queue')
      .update({ status: 'active' })
      .eq('id', waitingTurn.id)
      .select()
      .maybeSingle();
    return updated || waitingTurn;
  }

  // Если все ходы завершены (completed) — перезапускаем раунд
  const firstTurn = existing[0];
  const otherIds = existing.slice(1).map((t) => t.id);
  if (otherIds.length > 0) {
    await supabase.from('turn_queue').update({ status: 'waiting', resolved_at: null }).in('id', otherIds);
  }
  const { data: updated } = await supabase
    .from('turn_queue')
    .update({ status: 'active', resolved_at: null })
    .eq('id', firstTurn.id)
    .select()
    .maybeSingle();
  return updated || firstTurn;
}

export async function passTurn(sessionId, targetPlayerId) {
  if (!sessionId || !targetPlayerId) return;
  // Переводим все активные ходы в waiting
  await supabase
    .from('turn_queue')
    .update({ status: 'waiting' })
    .eq('session_id', sessionId)
    .eq('status', 'active');

  // Активируем ход целевого игрока
  const { data: updated } = await supabase
    .from('turn_queue')
    .update({ status: 'active', resolved_at: null })
    .eq('session_id', sessionId)
    .eq('player_id', targetPlayerId)
    .select()
    .maybeSingle();

  // Если у целевого игрока ещё не было записи в turn_queue, создаём её
  if (!updated) {
    await supabase.from('turn_queue').insert({
      session_id: sessionId,
      player_id: targetPlayerId,
      status: 'active',
    });
  }
}

export async function submitAction(sessionId, playerId, actionText) {
  try {
    return await invokeFunction('process-turn', {
      session_id: sessionId,
      player_id: playerId,
      action_text: actionText,
    });
  } catch (err) {
    if (err?.data?.code === 'MISSING_API_KEY' || err?.status === 402) {
      throw new Error('MISSING_API_KEY');
    }
    throw new Error(err.message || 'Неизвестная ошибка');
  }
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
    p_gps_model: models.gps_model || null,
    p_satellite_model: models.satellite_model || null,
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
          terrain_type: l.terrain_type || 'open',
          description: l.description,
          zones: l.zones || [],
          location_map: l.location_map || {},
        })) || [],
      })) || [],
    },
    bestiary: {
      npcs: npcs?.map(n => ({
        id: n.id,
        name: n.name,
        race: n.race,
        class: n.class || '',
        category: n.category,
        role: n.role,
        appearance: n.appearance,
        background: n.background,
        stats: n.stats,
        temperament: n.temperament || '',
        motivation: n.motivation || '',
        current_mood: n.current_mood || 'calm',
        speech_style: n.speech_style || '',
        secrets: n.secrets || '',
        rumors: n.rumors || [],
        daily_routine: n.daily_routine || '',
        current_activity: n.current_activity || '',
        // Расчётные поля (hp, max_hp, armor_class, initiative, saving_throws) исключаены — рассчитываются автоматически
        level: n.level,
        tier: n.tier,
        hit_dice: n.hit_dice || 8,
        // Для неуникальных существ — диапазон уровней при спавне
        level_min: n.level_min || n.level || 1,
        level_max: n.level_max || n.level || 1,
        status_tags: n.status_tags,
        habits: n.habits,
        catchphrases: n.catchphrases,
        location_id: n.location_id,
        state_id: n.state_id,
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
          class: 'string - класс (воин/маг/жрец/etc)',
          category: 'npc|beast|monster|boss',
          role: 'main|secondary|tertiary',
          appearance: 'string - внешность',
          background: 'string - предыстория',
          stats: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
          tier: 'number - потенциал (1-5)',
          level: 'number - конкретный уровень (для уникальных)',
          level_min: 'number - мин. уровень (для неуникальных, 5-15 для волка)',
          level_max: 'number - макс. уровень (для неуникальных)',
          hit_dice: 'number - кость хитов (6/8/10/12)',
          status_tags: ['string'],
          habits: ['string - привычки'],
          catchphrases: ['string - фразы'],
          location_id: 'UUID - ID локации (только для NPC)',
          state_id: 'UUID - ID государства',
          special_attacks: [{ name, description, damage_type, damage_dice, is_dot, dot_duration }],
          base_attacks: [{ name, description, damage_type, damage_dice }],
          is_pack: 'boolean - ходит стаей',
          is_unique: 'boolean - уникальный экземпляр (получает имя)',
          // Расчётные поля (не включаются в экспорт): hp, max_hp, armor_class, initiative, saving_throws
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

function formatSecretsForDb(secrets) {
  if (Array.isArray(secrets)) {
    return secrets.map(s => {
      if (typeof s === 'object' && s !== null) {
        if (s.secret) {
          return `${s.secret}${s.reveal_threshold ? ` (доверие > ${s.reveal_threshold})` : ''}`;
        }
        return JSON.stringify(s);
      }
      return String(s || '').trim();
    }).filter(Boolean).join('\n');
  }
  return typeof secrets === 'string' ? secrets.trim() : '';
}

function formatSpeechStyleForDb(speech) {
  if (typeof speech === 'object' && speech !== null) {
    const parts = [];
    if (speech.tone) parts.push(speech.tone);
    if (speech.greeting) parts.push(`Приветствие: «${speech.greeting}»`);
    if (Array.isArray(speech.address_forms) && speech.address_forms.length > 0) {
      parts.push(`Обращения: ${speech.address_forms.join(', ')}`);
    }
    return parts.join('. ') || 'Спокойный, вежливый';
  }
  return typeof speech === 'string' && speech.trim() ? speech.trim() : 'Спокойный, вежливый';
}

function formatDailyRoutineForDb(routine) {
  if (typeof routine === 'object' && routine !== null) {
    const parts = [];
    if (routine.morning) parts.push(`Утро: ${routine.morning}`);
    if (routine.afternoon) parts.push(`День: ${routine.afternoon}`);
    if (routine.evening) parts.push(`Вечер: ${routine.evening}`);
    if (routine.night) parts.push(`Ночь: ${routine.night}`);
    return parts.join('. ') || 'Утром — дела, днём — служба, вечером — отдых, ночью — сон';
  }
  return typeof routine === 'string' && routine.trim() ? routine.trim() : 'Утром — дела, днём — служба, вечером — отдых, ночью — сон';
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
  const locationNameMap = {}; // name -> new ID (for JSON without IDs)
  const stateIdMap = {}; // old ID -> new ID
  const stateNameMap = {}; // name -> new ID (for JSON without IDs)
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
      stateNameMap[state.name.toLowerCase().trim()] = newState.id;
      stateCount++;
      
      // Import locations for this state
      if (state.locations?.length) {
        const locations = state.locations.map(l => ({
          state_id: newState.id,
          name: l.name,
          type: l.type || 'city',
          terrain_type: l.terrain_type || null,
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
            locationNameMap[oldLoc.name.toLowerCase().trim()] = newLocations[idx].id;
          }
        });
      }
    }
  }

  // Import NPCs
  let npcCount = 0;
  if (worldData.bestiary?.npcs?.length) {
    // Build name-based lookups for locations and states from DB
    const locationNameToId = {};
    const stateNameToId = {};
    
    // Fetch all states for this world to build name lookup
    const { data: allStates } = await supabase
      .from('states')
      .select('id, name')
      .eq('world_id', world.id);
    
    if (allStates) {
      allStates.forEach(s => {
        stateNameToId[s.name.toLowerCase().trim()] = s.id;
      });
    }
    
    // Fetch all locations for this world (via states)
    if (allStates?.length) {
      const stateIds = allStates.map(s => s.id);
      const { data: allLocations } = await supabase
        .from('locations')
        .select('id, name')
        .in('state_id', stateIds);
      
      if (allLocations) {
        allLocations.forEach(l => {
          locationNameToId[l.name.toLowerCase().trim()] = l.id;
        });
      }
    }
    
    const npcs = worldData.bestiary.npcs.map(n => {
      // Resolve location_id: can be UUID (from export) or name (manual JSON)
      let locationId = null;
      if (n.location_id) {
        // Try UUID mapping first (from export)
        locationId = locationIdMap[n.location_id] || null;
        // Try name mapping from imported locations
        if (!locationId && typeof n.location_id === 'string') {
          locationId = locationNameMap[n.location_id.toLowerCase().trim()] || null;
        }
        // Fallback: search all locations in DB by name
        if (!locationId && typeof n.location_id === 'string') {
          locationId = locationNameToId[n.location_id.toLowerCase().trim()] || null;
        }
      }
      
      // Resolve state_id: can be UUID (from export) or name (manual JSON)
      let stateId = null;
      if (n.state_id) {
        // Try UUID mapping first (from export)
        stateId = stateIdMap[n.state_id] || null;
        // Try name mapping from imported states
        if (!stateId && typeof n.state_id === 'string') {
          stateId = stateNameMap[n.state_id.toLowerCase().trim()] || null;
        }
        // Fallback: search all states in DB by name
        if (!stateId && typeof n.state_id === 'string') {
          stateId = stateNameToId[n.state_id.toLowerCase().trim()] || null;
        }
      }
      
      // Расчётные поля
      const safeStats = {
        STR: Number(n.stats?.STR) || 10,
        DEX: Number(n.stats?.DEX) || 10,
        CON: Number(n.stats?.CON) || 10,
        INT: Number(n.stats?.INT) || 10,
        WIS: Number(n.stats?.WIS) || 10,
        CHA: Number(n.stats?.CHA) || 10,
      };
      const nLevel = Number(n.level) || 1;
      const nHitDie = [6, 8, 10, 12].includes(Number(n.hit_dice)) ? Number(n.hit_dice) : 8;
      const nRace = n.race || 'Человек';
      
      // HP: уровень 1 = макс кости + CON mod + 10, каждый следующий = среднее + CON mod
      const calculatedHp = calculateHpDnd(safeStats.CON, nLevel, nHitDie);
      
      // AC: 10 + DEX mod + расовый бонус
      const dexMod = Math.floor((safeStats.DEX - 10) / 2);
      const raceBonus = getRaceAcBonus(nRace);
      const calculatedAC = 10 + dexMod + raceBonus;
      
      // Initiative: DEX mod
      const calculatedInit = dexMod;
      
      // Saving throws: stat mod + proficiency bonus
      const proficiencyBonus = Math.ceil(nLevel / 4) + 1;
      const calculatedSaves = {};
      for (const stat of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
        const statMod = Math.floor((safeStats[stat] - 10) / 2);
        calculatedSaves[stat] = statMod + proficiencyBonus;
      }
      
      return {
        world_id: world.id,
        name: n.name,
        race: nRace,
        category: n.category || 'npc',
        class: n.class || '',
        role: ['main', 'secondary', 'tertiary'].includes(n.role) ? n.role : 'secondary',
        appearance: n.appearance || '',
        background: n.background || '',
        stats: safeStats,
        // Расчётные поля
        hp: calculatedHp,
        max_hp: calculatedHp,
        armor_class: calculatedAC,
        initiative: calculatedInit,
        saving_throws: calculatedSaves,
        level: nLevel,
        tier: n.tier || 1,
        hit_dice: nHitDie,
        level_min: Number(n.level_min) || nLevel,
        level_max: Number(n.level_max) || nLevel,
        status_tags: n.status_tags || [],
        habits: n.habits || [],
        catchphrases: n.catchphrases || [],
        location_id: locationId,
        state_id: stateId,
        // Новые поля психологии и отыгрыша NPC
        temperament: (typeof n.temperament === 'string' && n.temperament.trim()) ? n.temperament.trim() : 'pragmatist',
        motivation: (typeof n.motivation === 'string' && n.motivation.trim()) ? n.motivation.trim() : 'Жить в безопасности и достатке',
        current_mood: ['calm', 'suspicious', 'cheerful', 'irritated', 'frightened', 'impressed', 'mournful'].includes(n.current_mood)
          ? n.current_mood
          : 'calm',
        secrets: formatSecretsForDb(n.secrets),
        rumors: Array.isArray(n.rumors)
          ? n.rumors.map(r => typeof r === 'string' ? r : JSON.stringify(r))
          : (typeof n.rumors === 'string' && n.rumors.trim() ? [n.rumors.trim()] : []),
        speech_style: formatSpeechStyleForDb(n.speech_style),
        daily_routine: formatDailyRoutineForDb(n.daily_routine),
        current_activity: (typeof n.current_activity === 'string' && n.current_activity.trim())
          ? n.current_activity.trim()
          : ((Array.isArray(n.habits) && n.habits[0]) || 'Занят своими делами'),
        // Combat fields
        special_attacks: Array.isArray(n.special_attacks) ? n.special_attacks : [],
        base_attacks: Array.isArray(n.base_attacks) ? n.base_attacks : [],
        is_pack_instance: n.is_pack === true,
        pack_size: n.is_pack ? (n.pack_size || 2) : 1,
        is_unique: n.is_unique === true,
        is_hostile: n.is_hostile === true,
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
  const payload = { ...npc };
  if (payload.location_name !== undefined) {
    const locationName = payload.location_name;
    delete payload.location_name;
    if (locationName) {
      const { data: location } = await supabase
        .from('locations')
        .select('id')
        .ilike('name', locationName)
        .maybeSingle();
      payload.location_id = location?.id || null;
    } else {
      payload.location_id = null;
    }
  }

  const { data, error } = await supabase
    .from('npcs')
    .insert(payload)
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

export async function updateLocation(id, updates) {
  const { data, error } = await supabase
    .from('locations')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createLocation(location) {
  const { data, error } = await supabase
    .from('locations')
    .insert(location)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLocation(id) {
  const { error } = await supabase.from('locations').delete().eq('id', id);
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

// ===================== NPC RELATIONSHIPS & MEMORIES =====================

export function getRelationshipTierLabelClient(tier) {
  switch (tier) {
    case 'sworn_enemy': return 'Заклятый враг';
    case 'hostile': return 'Враждебность';
    case 'unfriendly': return 'Неприязнь';
    case 'neutral': return 'Нейтралитет';
    case 'friendly': return 'Симпатия';
    case 'trusted': return 'Доверие';
    case 'devoted': return 'Преданность';
    default: return 'Нейтралитет';
  }
}

export async function getNpcRelationships(sessionId, playerId) {
  // Получаем сессию чтобы узнать current_location_id
  const { data: session } = await supabase
    .from('sessions')
    .select('current_location_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session?.current_location_id) return [];

  // Получаем NPC в локации
  const { data: npcs, error: npcsError } = await supabase
    .from('npcs')
    .select('id, name, race, role, status_tags, appearance, background, temperament, current_mood, current_activity')
    .eq('location_id', session.current_location_id);

  if (npcsError) throw npcsError;
  if (!npcs || npcs.length === 0) return [];

  // Получаем сохраненные отношения для этих NPC и текущего игрока
  const npcIds = npcs.map((n) => n.id);
  const { data: rels } = await supabase
    .from('npc_relationships')
    .select('*')
    .in('npc_id', npcIds)
    .eq('player_id', playerId);

  const relMap = new Map((rels || []).map((r) => [r.npc_id, r]));

  return npcs.map((npc) => {
    const rel = relMap.get(npc.id);
    const score = rel?.score ?? 0;
    const tier = rel?.tier ?? 'neutral';
    const statusTags = Array.from(new Set([...(npc.status_tags || []), ...(rel?.status_tags || [])]));
    return {
      npc,
      relationship: {
        score,
        tier,
        tier_label: getRelationshipTierLabelClient(tier),
        status_tags: statusTags,
        interactions_count: rel?.interactions_count ?? 0,
        last_interaction_at: rel?.last_interaction_at,
      },
    };
  });
}

export async function getNpcMemories(npcId, playerId) {
  const { data, error } = await supabase
    .from('npc_memories')
    .select('*')
    .eq('npc_id', npcId)
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// ===================== PLAYER SKILLS & STAT ALLOCATION =====================

export async function getPlayerSkills(playerId) {
  const { data, error } = await supabase
    .from('player_skills')
    .select('*')
    .eq('player_id', playerId)
    .order('level', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function allocateStatPoints(playerId, statName, points = 1) {
  const { data, error } = await supabase.rpc('allocate_stat_points', {
    p_player_id: playerId,
    p_stat_name: statName,
    p_points: points,
  });

  if (error) throw error;
  return data;
}

