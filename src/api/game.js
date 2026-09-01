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

  const exportData = {
    version: '2.0',
    exported_at: new Date().toISOString(),
    world: {
      name: world.name,
      settings: world.settings,
    },
    lore_files: loreFiles.map((f) => ({
      folder: f.folder,
      title: f.title,
      content: f.content,
      tags: f.tags,
    })),
    folders,
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

export async function importWorld(jsonData, ownerId) {
  const worldData = JSON.parse(jsonData);

  const world = await createWorld({
    owner_id: ownerId,
    name: worldData.world.name,
    settings: worldData.world.settings,
  });

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
  }

  return world;
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
