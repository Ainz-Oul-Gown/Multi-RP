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
  const { data, error } = await supabase
    .from('sessions')
    .select('*, worlds(name), players(id, name, user_id, hp, max_hp, is_active)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
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
  // Вызываем Edge Function для обработки действия
  const { data, error } = await supabase.functions.invoke('process-turn', {
    body: { session_id: sessionId, player_id: playerId, action_text: actionText },
  });
  if (error) throw error;
  return data;
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

export async function upsertUserSettings(userId, openrouterKey) {
  const { data, error } = await supabase.rpc('upsert_user_settings', {
    p_user_id: userId,
    p_openrouter_key: openrouterKey || null,
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

// Export player character
export async function exportPlayer(playerId) {
  const player = await getPlayer(playerId);
  return {
    version: '2.0',
    exported_at: new Date().toISOString(),
    character: {
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
    inventory: player.inventory || [],
  };
}
