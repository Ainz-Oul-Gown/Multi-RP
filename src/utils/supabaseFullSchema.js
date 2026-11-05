// src/utils/supabaseFullSchema.js
// Полный SQL-скрипт для развёртывания MultiRP AI на новой базе данных Supabase
// Скопируйте и запустите его в Supabase SQL Editor на новом проекте.

export const SUPABASE_FULL_SCHEMA_SQL = `-- =========================================================================
-- MultiRP AI — Complete Consolidated Database Schema
-- Скопируйте этот скрипт и запустите в SQL Editor вашего проекта Supabase
-- =========================================================================

-- 1. ТАБЛИЦЫ
CREATE TABLE IF NOT EXISTS worlds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lore_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  folder TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID REFERENCES worlds(id) ON DELETE SET NULL,
  world_name TEXT DEFAULT NULL,
  difficulty TEXT NOT NULL DEFAULT 'normal' CHECK (difficulty IN ('easy', 'normal', 'hard')),
  is_pvp_enabled BOOLEAN DEFAULT FALSE,
  current_plot_stage TEXT DEFAULT NULL,
  storyline JSONB DEFAULT NULL,
  game_year INT DEFAULT 1248,
  game_month INT DEFAULT 5,
  game_day INT DEFAULT 14,
  game_hour INT DEFAULT 10,
  game_minute INT DEFAULT 0,
  current_location_id UUID DEFAULT NULL,
  current_state_id UUID DEFAULT NULL,
  current_wild_zone TEXT DEFAULT NULL,
  current_wild_zone_description TEXT DEFAULT NULL,
  current_terrain_type TEXT DEFAULT 'open',
  location_map JSONB DEFAULT NULL,
  party_groups JSONB DEFAULT '[]',
  round_counter INT DEFAULT 1,
  ai_key_mode TEXT DEFAULT 'host' CHECK (ai_key_mode IN ('host', 'individual')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  race TEXT NOT NULL DEFAULT 'Человек',
  class TEXT NOT NULL DEFAULT 'Воин',
  appearance TEXT DEFAULT '',
  personality JSONB DEFAULT '{"ideals": [], "bonds": [], "flaws": []}',
  bio TEXT DEFAULT '',
  power_level INT DEFAULT 10 CHECK (power_level >= 1 AND power_level <= 100),
  level INT DEFAULT 1,
  experience INT DEFAULT 0,
  xp INT DEFAULT 0,
  stats JSONB DEFAULT '{"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10}',
  stat_points INT DEFAULT 0,
  hp INT DEFAULT 30,
  max_hp INT DEFAULT 30,
  mp INT DEFAULT 50,
  max_mp INT DEFAULT 50,
  initiative INT DEFAULT 0,
  armor_class INT DEFAULT 10,
  saving_throws JSONB DEFAULT '{}',
  race_ac_bonus INT DEFAULT 0,
  hit_dice_current INT DEFAULT 1,
  hit_dice_max INT DEFAULT 1,
  hit_die_type TEXT DEFAULT 'd8',
  last_rested_at TIMESTAMPTZ DEFAULT NOW(),
  money INT DEFAULT 50,
  is_active BOOLEAN DEFAULT TRUE,
  current_zone TEXT DEFAULT NULL,
  party_id UUID DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity INT DEFAULT 1 CHECK (quantity >= 0),
  type TEXT NOT NULL DEFAULT 'misc' CHECK (type IN ('weapon', 'armor', 'consumable', 'misc')),
  attributes JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('player', 'master', 'system', 'npc')),
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name TEXT DEFAULT '',
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS turn_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'waiting', 'completed', 'skipped')),
  action_text TEXT,
  parsed_action JSONB,
  roll_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS character_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  race TEXT NOT NULL DEFAULT 'Человек',
  class TEXT NOT NULL DEFAULT 'Воин',
  appearance TEXT DEFAULT '',
  personality JSONB DEFAULT '{"ideals": [], "bonds": [], "flaws": []}',
  bio TEXT DEFAULT '',
  power_level INT DEFAULT 10 CHECK (power_level >= 1 AND power_level <= 100),
  stats JSONB DEFAULT '{"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10}',
  hp INT DEFAULT 30,
  max_hp INT DEFAULT 30,
  initiative INT DEFAULT 0,
  armor_class INT DEFAULT 10,
  saving_throws JSONB DEFAULT '{}',
  race_ac_bonus INT DEFAULT 0,
  money INT DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  openrouter_key TEXT DEFAULT '',
  card_model TEXT DEFAULT 'google/gemma-4-31b-it:free',
  dm_model TEXT DEFAULT 'minimax/minimax-m3:free',
  gps_model TEXT DEFAULT 'google/gemma-4-31b-it:free',
  satellite_model TEXT DEFAULT 'google/gemma-4-31b-it:free',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  ruler_id UUID DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID REFERENCES worlds(id) ON DELETE CASCADE,
  state_id UUID REFERENCES states(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'city' CHECK (type IN ('capital', 'city', 'village', 'ruins', 'landmark')),
  terrain_type TEXT NOT NULL DEFAULT 'urban',
  description TEXT DEFAULT '',
  zones JSONB DEFAULT '[]',
  location_map JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  from_location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  to_location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  distance_km INT NOT NULL DEFAULT 10,
  travel_time_days NUMERIC(4,1) NOT NULL DEFAULT 1.0,
  danger_level INT NOT NULL DEFAULT 1 CHECK (danger_level BETWEEN 1 AND 5),
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS npcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  state_id UUID REFERENCES states(id) ON DELETE SET NULL,
  category TEXT DEFAULT 'npc',
  role TEXT DEFAULT 'secondary' CHECK (role IN ('main', 'secondary', 'tertiary')),
  name TEXT NOT NULL,
  race TEXT DEFAULT 'Человек',
  class TEXT DEFAULT 'Горожанин',
  appearance TEXT DEFAULT '',
  background TEXT DEFAULT '',
  temperament TEXT DEFAULT '',
  motivation TEXT DEFAULT '',
  current_mood TEXT DEFAULT 'calm',
  speech_style TEXT DEFAULT '',
  current_activity TEXT DEFAULT '',
  daily_routine TEXT DEFAULT '',
  secrets TEXT DEFAULT '',
  rumors TEXT[] DEFAULT '{}',
  habits TEXT[] DEFAULT '{}',
  catchphrases TEXT[] DEFAULT '{}',
  status_tags TEXT[] DEFAULT '{}',
  stats JSONB DEFAULT '{"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10}',
  hp INT DEFAULT 30,
  max_hp INT DEFAULT 30,
  armor_class INT DEFAULT 10,
  level INT DEFAULT 1,
  tier INT DEFAULT 1,
  hit_dice INT DEFAULT 8,
  is_alive BOOLEAN DEFAULT TRUE,
  is_companion BOOLEAN DEFAULT FALSE,
  companion_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS npc_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npc_id UUID NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  event_description TEXT NOT NULL,
  sentiment TEXT DEFAULT 'neutral' CHECK (sentiment IN ('positive', 'negative', 'neutral')),
  importance INT DEFAULT 1 CHECK (importance BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS npc_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npc_id UUID NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  trust_score INT NOT NULL DEFAULT 50 CHECK (trust_score BETWEEN 0 AND 100),
  relationship_tier TEXT NOT NULL DEFAULT 'neutral' CHECK (relationship_tier IN ('hostile', 'unfriendly', 'neutral', 'friendly', 'honored')),
  attitude_notes TEXT DEFAULT '',
  interaction_count INT DEFAULT 0,
  last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(npc_id, player_id, session_id)
);

CREATE TABLE IF NOT EXISTS player_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  skill_key TEXT NOT NULL,
  level INT DEFAULT 1,
  current_xp INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, skill_key)
);

CREATE TABLE IF NOT EXISTS player_injuries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  severity TEXT DEFAULT 'light' CHECK (severity IN ('light', 'medium', 'heavy')),
  stat_penalty JSONB DEFAULT '{}',
  turns_remaining INT DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Миграция колонок для существующих БД:
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ai_key_mode TEXT DEFAULT 'host';
ALTER TABLE players ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS stat_points INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS mp INT DEFAULT 50;
ALTER TABLE players ADD COLUMN IF NOT EXISTS max_mp INT DEFAULT 50;
ALTER TABLE players ADD COLUMN IF NOT EXISTS initiative INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS armor_class INT DEFAULT 10;
ALTER TABLE players ADD COLUMN IF NOT EXISTS saving_throws JSONB DEFAULT '{}';
ALTER TABLE players ADD COLUMN IF NOT EXISTS race_ac_bonus INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS hit_dice_current INT DEFAULT 1;
ALTER TABLE players ADD COLUMN IF NOT EXISTS hit_dice_max INT DEFAULT 1;
ALTER TABLE players ADD COLUMN IF NOT EXISTS hit_die_type TEXT DEFAULT 'd8';
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_rested_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE character_cards ADD COLUMN IF NOT EXISTS initiative INT DEFAULT 0;
ALTER TABLE character_cards ADD COLUMN IF NOT EXISTS armor_class INT DEFAULT 10;
ALTER TABLE character_cards ADD COLUMN IF NOT EXISTS saving_throws JSONB DEFAULT '{}';
ALTER TABLE character_cards ADD COLUMN IF NOT EXISTS race_ac_bonus INT DEFAULT 0;

-- 2. СЛУЖЕБНЫЕ ФУНКЦИИ БЕЗОПАСНОСТИ
CREATE OR REPLACE FUNCTION public.get_user_session_ids(p_user_id UUID)
RETURNS TABLE(session_id UUID)
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT DISTINCT p.session_id FROM public.players p WHERE p.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_user_player_ids(p_user_id UUID)
RETURNS TABLE(player_id UUID)
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT p.id FROM public.players p WHERE p.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- 3. RLS ПОЛИТИКИ
ALTER TABLE worlds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Worlds: owner read/write" ON worlds;
DROP POLICY IF EXISTS "Worlds: anyone can read" ON worlds;
CREATE POLICY "Worlds: owner read/write" ON worlds FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "Worlds: anyone can read" ON worlds FOR SELECT USING (true);

ALTER TABLE lore_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lore: read for all authenticated" ON lore_files;
DROP POLICY IF EXISTS "Lore: owner write" ON lore_files;
CREATE POLICY "Lore: read for all authenticated" ON lore_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lore: owner write" ON lore_files FOR ALL USING (world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid()));

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sessions: read for authenticated" ON sessions;
DROP POLICY IF EXISTS "Sessions: create for authenticated" ON sessions;
DROP POLICY IF EXISTS "Sessions: update for participants" ON sessions;
DROP POLICY IF EXISTS "Sessions: delete for participants or world owner" ON sessions;
CREATE POLICY "Sessions: read for authenticated" ON sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sessions: create for authenticated" ON sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Sessions: update for participants" ON sessions FOR UPDATE TO authenticated USING (
  id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid()))
  OR world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid())
);
CREATE POLICY "Sessions: delete for participants or world owner" ON sessions FOR DELETE TO authenticated USING (
  id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid()))
  OR world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid())
);

ALTER TABLE players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Players: read in same session" ON players;
DROP POLICY IF EXISTS "Players: join session" ON players;
DROP POLICY IF EXISTS "Players: update own" ON players;
DROP POLICY IF EXISTS "Players: system update" ON players;
DROP POLICY IF EXISTS "Players: delete own" ON players;
DROP POLICY IF EXISTS "Players: delete own or session host" ON players;

CREATE POLICY "Players: read in same session" ON players FOR SELECT TO authenticated USING (
  session_id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid()))
  OR user_id = auth.uid()
);
CREATE POLICY "Players: join session" ON players FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Players: update own" ON players FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Players: system update" ON players FOR UPDATE USING (true);
CREATE POLICY "Players: delete own or session host" ON players FOR DELETE TO authenticated USING (
  auth.uid() = user_id
  OR session_id IN (
    SELECT s.id 
    FROM public.sessions s
    JOIN public.worlds w ON s.world_id = w.id
    WHERE w.owner_id = auth.uid()
  )
);

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Inventory: read for owner" ON inventory;
DROP POLICY IF EXISTS "Inventory: manage for owner" ON inventory;
DROP POLICY IF EXISTS "Inventory: system manage" ON inventory;
CREATE POLICY "Inventory: read for owner" ON inventory FOR SELECT TO authenticated USING (player_id IN (SELECT player_id FROM public.get_user_player_ids(auth.uid())));
CREATE POLICY "Inventory: manage for owner" ON inventory FOR ALL TO authenticated USING (player_id IN (SELECT player_id FROM public.get_user_player_ids(auth.uid())));
CREATE POLICY "Inventory: system manage" ON inventory FOR ALL USING (true);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Messages: read for session players" ON messages;
DROP POLICY IF EXISTS "Messages: players send" ON messages;
DROP POLICY IF EXISTS "Messages: system insert" ON messages;
CREATE POLICY "Messages: read for session players" ON messages FOR SELECT TO authenticated USING (session_id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid())));
CREATE POLICY "Messages: players send" ON messages FOR INSERT TO authenticated WITH CHECK (sender_type = 'player' AND sender_id = auth.uid());
CREATE POLICY "Messages: system insert" ON messages FOR INSERT WITH CHECK (sender_type IN ('master', 'system', 'npc'));

ALTER TABLE turn_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Turn: read for session players" ON turn_queue;
DROP POLICY IF EXISTS "Turn: system manage" ON turn_queue;
CREATE POLICY "Turn: read for session players" ON turn_queue FOR SELECT TO authenticated USING (session_id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid())));
CREATE POLICY "Turn: system manage" ON turn_queue FOR ALL USING (true);

ALTER TABLE character_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CharCards: owner read" ON character_cards;
DROP POLICY IF EXISTS "CharCards: owner insert" ON character_cards;
DROP POLICY IF EXISTS "CharCards: owner update" ON character_cards;
DROP POLICY IF EXISTS "CharCards: owner delete" ON character_cards;
CREATE POLICY "CharCards: owner read" ON character_cards FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "CharCards: owner insert" ON character_cards FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "CharCards: owner update" ON character_cards FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "CharCards: owner delete" ON character_cards FOR DELETE USING (auth.uid() = owner_id);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "UserSettings: owner read" ON user_settings;
DROP POLICY IF EXISTS "UserSettings: owner insert" ON user_settings;
DROP POLICY IF EXISTS "UserSettings: owner update" ON user_settings;
DROP POLICY IF EXISTS "UserSettings: service read" ON user_settings;
CREATE POLICY "UserSettings: owner read" ON user_settings FOR SELECT USING (auth.uid() = id);
CREATE POLICY "UserSettings: owner insert" ON user_settings FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "UserSettings: owner update" ON user_settings FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "UserSettings: service read" ON user_settings FOR SELECT USING (true);

ALTER TABLE states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "States: read for authenticated" ON states;
DROP POLICY IF EXISTS "States: owner write" ON states;
CREATE POLICY "States: read for authenticated" ON states FOR SELECT TO authenticated USING (true);
CREATE POLICY "States: owner write" ON states FOR ALL USING (world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid()));

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Locations: read for authenticated" ON locations;
DROP POLICY IF EXISTS "Locations: owner write" ON locations;
CREATE POLICY "Locations: read for authenticated" ON locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Locations: owner write" ON locations FOR ALL USING (world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid()));

ALTER TABLE npcs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "NPCs: read for authenticated" ON npcs;
DROP POLICY IF EXISTS "NPCs: owner write" ON npcs;
CREATE POLICY "NPCs: read for authenticated" ON npcs FOR SELECT TO authenticated USING (true);
CREATE POLICY "NPCs: owner write" ON npcs FOR ALL USING (world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid()));

ALTER TABLE npc_memories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Memories: read for authenticated" ON npc_memories;
DROP POLICY IF EXISTS "Memories: system manage" ON npc_memories;
CREATE POLICY "Memories: read for authenticated" ON npc_memories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Memories: system manage" ON npc_memories FOR ALL USING (true);

ALTER TABLE npc_relationships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Relationships: read for authenticated" ON npc_relationships;
DROP POLICY IF EXISTS "Relationships: system manage" ON npc_relationships;
CREATE POLICY "Relationships: read for authenticated" ON npc_relationships FOR SELECT TO authenticated USING (true);
CREATE POLICY "Relationships: system manage" ON npc_relationships FOR ALL USING (true);

ALTER TABLE player_skills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Player skills: read for session players" ON player_skills;
DROP POLICY IF EXISTS "Player skills: system manage" ON player_skills;
CREATE POLICY "Player skills: read for session players" ON player_skills FOR SELECT TO authenticated USING (
  player_id IN (SELECT id FROM players WHERE session_id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid())))
  OR player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
);
CREATE POLICY "Player skills: system manage" ON player_skills FOR ALL USING (true);

-- 4. RPC ФУНКЦИИ ДЛЯ USER SETTINGS (поддержка обеих сигнатур: JSONB и 6 аргументов)
CREATE OR REPLACE FUNCTION public.upsert_user_settings(
  p_user_id UUID,
  p_openrouter_key TEXT,
  p_models JSONB DEFAULT '{}'
) RETURNS JSONB SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_settings (
    id, openrouter_key, card_model, dm_model, gps_model, satellite_model, updated_at
  ) VALUES (
    p_user_id,
    p_openrouter_key,
    COALESCE(p_models->>'card_model', 'google/gemma-4-31b-it:free'),
    COALESCE(p_models->>'dm_model', 'minimax/minimax-m3:free'),
    COALESCE(p_models->>'gps_model', 'google/gemma-4-31b-it:free'),
    COALESCE(p_models->>'satellite_model', 'google/gemma-4-31b-it:free'),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    openrouter_key = EXCLUDED.openrouter_key,
    card_model = COALESCE(EXCLUDED.card_model, user_settings.card_model),
    dm_model = COALESCE(EXCLUDED.dm_model, user_settings.dm_model),
    gps_model = COALESCE(EXCLUDED.gps_model, user_settings.gps_model),
    satellite_model = COALESCE(EXCLUDED.satellite_model, user_settings.satellite_model),
    updated_at = NOW();

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.upsert_user_settings(
  p_user_id UUID,
  p_openrouter_key TEXT,
  p_card_model TEXT,
  p_dm_model TEXT,
  p_gps_model TEXT,
  p_satellite_model TEXT
) RETURNS VOID SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_settings (
    id, openrouter_key, card_model, dm_model, gps_model, satellite_model, updated_at
  ) VALUES (
    p_user_id,
    COALESCE(p_openrouter_key, ''),
    COALESCE(p_card_model, 'google/gemma-4-31b-it:free'),
    COALESCE(p_dm_model, 'minimax/minimax-m3:free'),
    COALESCE(p_gps_model, 'google/gemma-4-31b-it:free'),
    COALESCE(p_satellite_model, 'google/gemma-4-31b-it:free'),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    openrouter_key = EXCLUDED.openrouter_key,
    card_model = COALESCE(EXCLUDED.card_model, user_settings.card_model),
    dm_model = COALESCE(EXCLUDED.dm_model, user_settings.dm_model),
    gps_model = COALESCE(EXCLUDED.gps_model, user_settings.gps_model),
    satellite_model = COALESCE(EXCLUDED.satellite_model, user_settings.satellite_model),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 4.1 ДОПОЛНИТЕЛЬНЫЕ ТАБЛИЦЫ И КОЛОНКИ (ФИЗИЧЕСКОЕ ПРОСТРАНСТВО, НАВЫКИ, СТРУКТУРЫ)
CREATE TABLE IF NOT EXISTS subzones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  pos_x FLOAT NOT NULL DEFAULT 0,
  pos_y FLOAT NOT NULL DEFAULT 0,
  radius FLOAT NOT NULL DEFAULT 10,
  danger_level TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS location_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'shelter',
  hp INT NOT NULL DEFAULT 50,
  max_hp INT NOT NULL DEFAULT 50,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creature_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  species_name TEXT NOT NULL,
  race TEXT DEFAULT 'Чудовище',
  category TEXT DEFAULT 'beast',
  tier INT DEFAULT 1,
  level_min INT DEFAULT 1,
  level_max INT DEFAULT 5,
  base_attacks JSONB DEFAULT '[]',
  special_attacks JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS scale_unit TEXT NOT NULL DEFAULT 'метры';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_round INT DEFAULT 1;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_wild_zone_danger_level TEXT DEFAULT 'normal';

ALTER TABLE locations ADD COLUMN IF NOT EXISTS pos_x FLOAT NOT NULL DEFAULT 0;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS pos_y FLOAT NOT NULL DEFAULT 0;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS bounds_shape TEXT NOT NULL DEFAULT 'circle';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS bounds_data JSONB NOT NULL DEFAULT '{"radius": 100}'::jsonb;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS danger_level TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS biome TEXT DEFAULT NULL;

ALTER TABLE players ADD COLUMN IF NOT EXISTS pos_x FLOAT NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS pos_y FLOAT NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS subzone_id UUID REFERENCES subzones(id) ON DELETE SET NULL;
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_busy BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE players ADD COLUMN IF NOT EXISTS busy_activity TEXT DEFAULT NULL;
ALTER TABLE players ADD COLUMN IF NOT EXISTS busy_remaining_minutes INT NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS busy_target_minutes INT NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS busy_reward_meta JSONB DEFAULT '{}'::jsonb;

ALTER TABLE npcs ADD COLUMN IF NOT EXISTS is_hostile BOOLEAN DEFAULT FALSE;
ALTER TABLE npcs ADD COLUMN IF NOT EXISTS pos_x FLOAT NOT NULL DEFAULT 0;
ALTER TABLE npcs ADD COLUMN IF NOT EXISTS pos_y FLOAT NOT NULL DEFAULT 0;
ALTER TABLE npcs ADD COLUMN IF NOT EXISTS subzone_id UUID REFERENCES subzones(id) ON DELETE SET NULL;
ALTER TABLE npcs ADD COLUMN IF NOT EXISTS party_id UUID DEFAULT NULL;
ALTER TABLE npcs ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0;
ALTER TABLE npcs ADD COLUMN IF NOT EXISTS stat_points INT DEFAULT 0;
ALTER TABLE npcs ADD COLUMN IF NOT EXISTS base_attacks JSONB DEFAULT '[]';
ALTER TABLE npcs ADD COLUMN IF NOT EXISTS special_attacks JSONB DEFAULT '[]';

ALTER TABLE player_skills ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Навык';
ALTER TABLE player_skills ADD COLUMN IF NOT EXISTS xp INT NOT NULL DEFAULT 0;
ALTER TABLE player_skills ADD COLUMN IF NOT EXISTS xp_to_next_level INT NOT NULL DEFAULT 100;
ALTER TABLE player_skills ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE player_skills ADD COLUMN IF NOT EXISTS effects JSONB DEFAULT '{}';

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS npc_id UUID REFERENCES npcs(id) ON DELETE CASCADE;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS durability INT DEFAULT 100;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'good';

-- 5. RPC ДЛЯ РАСПРЕДЕЛЕНИЯ ОЧКОВ ХАРАКТЕРИСТИК (ОХ)
CREATE OR REPLACE FUNCTION public.allocate_stat_points(
  p_player_id UUID,
  p_stat_name TEXT,
  p_points INT DEFAULT 1
) RETURNS JSONB AS $$
DECLARE
  v_player RECORD;
  v_stats JSONB;
  v_cur_val INT;
  v_new_val INT;
  v_new_max_hp INT;
  v_new_max_mp INT;
  v_new_ac INT;
  v_new_init INT;
  v_con_mod INT;
  v_dex_mod INT;
  v_saves JSONB;
BEGIN
  IF p_points <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Количество очков должно быть больше нуля');
  END IF;

  p_stat_name := UPPER(TRIM(p_stat_name));
  IF p_stat_name NOT IN ('STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Недопустимая характеристика: ' || p_stat_name);
  END IF;

  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Игрок не найден');
  END IF;

  IF COALESCE(v_player.stat_points, 0) < p_points THEN
    RETURN jsonb_build_object('success', false, 'error', 'Недостаточно очков характеристик');
  END IF;

  v_stats := COALESCE(v_player.stats, '{"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10}'::jsonb);
  v_cur_val := COALESCE((v_stats->>p_stat_name)::INT, 10);
  v_new_val := v_cur_val + p_points;

  v_stats := jsonb_set(v_stats, ARRAY[p_stat_name], to_jsonb(v_new_val));

  -- Пересчет Max HP при изменении CON
  v_new_max_hp := v_player.max_hp;
  IF p_stat_name = 'CON' THEN
    v_con_mod := FLOOR((v_new_val - 10) / 2.0)::INT;
    v_new_max_hp := GREATEST(10, v_new_val * 2 + (COALESCE(v_player.level, 1) * GREATEST(1, v_con_mod + 5)));
  END IF;

  -- Пересчет Max MP при изменении INT
  v_new_max_mp := COALESCE(v_player.max_mp, 50);
  IF p_stat_name = 'INT' THEN
    v_new_max_mp := GREATEST(20, v_new_val * 2 + (COALESCE(v_player.level, 1) * 5));
  END IF;

  -- Пересчет AC и Инициативы при изменении DEX
  v_new_ac := COALESCE(v_player.armor_class, 10);
  v_new_init := COALESCE(v_player.initiative, 0);
  IF p_stat_name = 'DEX' THEN
    v_dex_mod := FLOOR((v_new_val - 10) / 2.0)::INT;
    v_new_init := v_dex_mod;
    v_new_ac := 10 + v_dex_mod + COALESCE(v_player.race_ac_bonus, 0);
  END IF;

  v_saves := COALESCE(v_player.saving_throws, '{}'::jsonb);
  v_saves := jsonb_set(v_saves, ARRAY[p_stat_name], to_jsonb(FLOOR((v_new_val - 10) / 2.0)::INT + 2));

  UPDATE public.players
  SET
    stats = v_stats,
    stat_points = v_player.stat_points - p_points,
    max_hp = v_new_max_hp,
    hp = LEAST(v_player.hp + (v_new_max_hp - v_player.max_hp), v_new_max_hp),
    max_mp = v_new_max_mp,
    mp = LEAST(COALESCE(v_player.mp, 50) + (v_new_max_mp - COALESCE(v_player.max_mp, 50)), v_new_max_mp),
    armor_class = v_new_ac,
    initiative = v_new_init,
    saving_throws = v_saves,
    updated_at = NOW()
  WHERE id = p_player_id;

  RETURN jsonb_build_object(
    'success', true,
    'stat_name', p_stat_name,
    'old_value', v_cur_val,
    'new_value', v_new_val,
    'remaining_stat_points', v_player.stat_points - p_points,
    'max_hp', v_new_max_hp,
    'max_mp', v_new_max_mp,
    'armor_class', v_new_ac,
    'initiative', v_new_init
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.allocate_stat_points(UUID, TEXT, INT) TO authenticated, anon, service_role;

-- 5.1 RPC ДЛЯ ПРОКАЧКИ НАВЫКОВ (1..100) И ПРИМЕНЕНИЯ МУТАЦИЙ ХОДА
CREATE OR REPLACE FUNCTION public.add_player_skill_xp(
  p_player_id UUID,
  p_skill_key TEXT,
  p_skill_name TEXT,
  p_xp_amount INT
) RETURNS JSONB AS $$
DECLARE
  v_skill RECORD;
  v_cur_lvl INT;
  v_cur_xp INT;
  v_next_xp INT;
  v_new_lvl INT;
  v_new_xp INT;
  v_leveled_up BOOLEAN := false;
  v_effects JSONB;
BEGIN
  p_skill_key := LOWER(TRIM(p_skill_key));
  IF p_xp_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Количество опыта должно быть больше нуля');
  END IF;

  SELECT * INTO v_skill FROM public.player_skills
  WHERE player_id = p_player_id AND skill_key = p_skill_key
  FOR UPDATE;

  IF NOT FOUND THEN
    v_cur_lvl := 1;
    v_cur_xp := 0;
    v_next_xp := 100;
  ELSE
    v_cur_lvl := COALESCE(v_skill.level, 1);
    v_cur_xp := COALESCE(v_skill.xp, 0);
    v_next_xp := COALESCE(v_skill.xp_to_next_level, 100);
  END IF;

  IF v_cur_lvl >= 100 THEN
    RETURN jsonb_build_object('success', true, 'skill_key', p_skill_key, 'level', 100, 'xp', v_next_xp, 'leveled_up', false, 'is_max', true);
  END IF;

  v_new_lvl := v_cur_lvl;
  v_new_xp := v_cur_xp + p_xp_amount;

  WHILE v_new_xp >= v_next_xp AND v_new_lvl < 100 LOOP
    v_new_xp := v_new_xp - v_next_xp;
    v_new_lvl := v_new_lvl + 1;
    v_next_xp := v_new_lvl * 100;
    v_leveled_up := true;
  END LOOP;

  v_effects := jsonb_build_object(
    'bonus_pct', v_new_lvl,
    'accuracy_bonus', FLOOR(v_new_lvl / 10)::INT,
    'time_reduction_pct', LEAST(50, FLOOR(v_new_lvl * 0.5)::INT)
  );

  INSERT INTO public.player_skills (player_id, skill_key, name, level, xp, xp_to_next_level, effects, updated_at)
  VALUES (p_player_id, p_skill_key, p_skill_name, v_new_lvl, v_new_xp, v_next_xp, v_effects, NOW())
  ON CONFLICT (player_id, skill_key) DO UPDATE SET
    name = EXCLUDED.name,
    level = v_new_lvl,
    xp = v_new_xp,
    xp_to_next_level = v_next_xp,
    effects = v_effects,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'skill_key', p_skill_key,
    'name', p_skill_name,
    'old_level', v_cur_lvl,
    'level', v_new_lvl,
    'xp', v_new_xp,
    'xp_to_next_level', v_next_xp,
    'leveled_up', v_leveled_up,
    'effects', v_effects
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.interrupt_busy_activity(p_player_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_player RECORD;
  v_time_spent INT;
BEGIN
  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player not found');
  END IF;
  IF NOT v_player.is_busy THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player is not busy');
  END IF;
  v_time_spent := GREATEST(0, v_player.busy_target_minutes - v_player.busy_remaining_minutes);
  UPDATE public.players
  SET is_busy = false, busy_activity = NULL, busy_remaining_minutes = 0, busy_target_minutes = 0
  WHERE id = p_player_id;
  RETURN jsonb_build_object(
    'success', true,
    'player_id', p_player_id,
    'interrupted_activity', v_player.busy_activity,
    'time_spent_minutes', v_time_spent,
    'reward_meta', v_player.busy_reward_meta
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_turn_mutations(
  p_mutations JSONB,
  p_session_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_mutation JSONB;
  v_mutation_type TEXT;
  v_applied_count INT := 0;
  v_session_year INT;
  v_session_month INT;
  v_session_day INT;
  v_session_hour INT;
  v_session_minute INT;
  v_total_minutes INT;
  v_new_minute INT;
  v_new_hour INT;
  v_new_day INT;
  v_new_month INT;
  v_new_year INT;
  v_target_type TEXT;
  v_target_id UUID;
  v_delta INT;
  v_current_hp INT;
  v_max_hp INT;
  v_item_id UUID;
  v_durability_delta INT;
  v_set_broken BOOLEAN;
  v_current_durability INT;
  v_attrs JSONB;
  v_item_name TEXT;
  v_item_quantity INT;
  v_delete_qty INT;
  v_owner_id UUID;
  v_owner_type TEXT;
  v_item JSONB;
  v_from_id UUID;
  v_to_id UUID;
  v_from_type TEXT;
  v_to_type TEXT;
  v_transfer_qty INT;
  v_location_id UUID;
  v_structure JSONB;
  v_busy_player_id UUID;
  v_busy_activity TEXT;
  v_busy_minutes INT;
  v_reward_preview TEXT;
  v_entity_type TEXT;
  v_entity_id UUID;
  v_pos_x FLOAT;
  v_pos_y FLOAT;
  v_subzone_id UUID;
BEGIN
  SELECT game_year, game_month, game_day, game_hour, game_minute
  INTO v_session_year, v_session_month, v_session_day, v_session_hour, v_session_minute
  FROM public.sessions WHERE id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: %', p_session_id USING ERRCODE = 'P0001';
  END IF;

  FOR v_mutation IN SELECT * FROM jsonb_array_elements(p_mutations) LOOP
    v_mutation_type := v_mutation->>'type';
    CASE v_mutation_type
      WHEN 'UPDATE_HP' THEN
        v_target_type := v_mutation->>'target_type';
        v_target_id := (v_mutation->>'id')::UUID;
        v_delta := (v_mutation->>'delta')::INT;
        IF v_target_type = 'player' THEN
          SELECT hp, max_hp INTO v_current_hp, v_max_hp FROM public.players WHERE id = v_target_id FOR UPDATE;
          IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_PLAYER_NOT_FOUND: %', v_target_id USING ERRCODE = 'P0001'; END IF;
          UPDATE public.players SET hp = GREATEST(0, LEAST(v_max_hp, v_current_hp + v_delta)) WHERE id = v_target_id;
        ELSIF v_target_type = 'npc' THEN
          SELECT hp, max_hp INTO v_current_hp, v_max_hp FROM public.npcs WHERE id = v_target_id FOR UPDATE;
          IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_NPC_NOT_FOUND: %', v_target_id USING ERRCODE = 'P0001'; END IF;
          UPDATE public.npcs SET hp = GREATEST(0, LEAST(v_max_hp, v_current_hp + v_delta)), is_alive = (GREATEST(0, LEAST(v_max_hp, v_current_hp + v_delta)) > 0) WHERE id = v_target_id;
        END IF;
        v_applied_count := v_applied_count + 1;

      WHEN 'UPDATE_DURABILITY' THEN
        v_item_id := (v_mutation->>'item_id')::UUID;
        v_durability_delta := (v_mutation->>'delta')::INT;
        v_set_broken := COALESCE((v_mutation->>'set_broken')::BOOLEAN, false);
        SELECT durability, attributes INTO v_current_durability, v_attrs FROM public.inventory WHERE id = v_item_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND: %', v_item_id USING ERRCODE = 'P0001'; END IF;
        UPDATE public.inventory SET
          durability = CASE WHEN v_set_broken THEN 0 ELSE GREATEST(0, COALESCE(v_current_durability, 100) + v_durability_delta) END,
          attributes = CASE WHEN v_set_broken THEN jsonb_set(COALESCE(v_attrs, '{}'::jsonb), '{broken}', 'true'::jsonb) ELSE v_attrs END
        WHERE id = v_item_id;
        v_applied_count := v_applied_count + 1;

      WHEN 'DELETE_ITEM' THEN
        v_item_id := (v_mutation->>'item_id')::UUID;
        v_delete_qty := (v_mutation->>'quantity')::INT;
        SELECT quantity INTO v_item_quantity FROM public.inventory WHERE id = v_item_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND: %', v_item_id USING ERRCODE = 'P0001'; END IF;
        IF v_item_quantity <= v_delete_qty THEN
          DELETE FROM public.inventory WHERE id = v_item_id;
        ELSE
          UPDATE public.inventory SET quantity = quantity - v_delete_qty WHERE id = v_item_id;
        END IF;
        v_applied_count := v_applied_count + 1;

      WHEN 'INSERT_ITEM' THEN
        v_owner_id := (v_mutation->>'owner_id')::UUID;
        v_owner_type := v_mutation->>'owner_type';
        v_item := v_mutation->'item';
        IF v_owner_type = 'player' THEN
          INSERT INTO public.inventory (player_id, item_name, quantity, type, attributes)
          VALUES (v_owner_id, COALESCE(v_item->>'item_name', v_item->>'name', 'Предмет'), COALESCE((v_item->>'quantity')::INT, 1), COALESCE(v_item->>'type', 'misc'), COALESCE(v_item->'attributes', '{}'::jsonb));
        END IF;
        v_applied_count := v_applied_count + 1;

      WHEN 'TRANSFER_ITEM' THEN
        v_item_id := (v_mutation->>'item_id')::UUID;
        v_from_id := (v_mutation->>'from_id')::UUID;
        v_to_id := (v_mutation->>'to_id')::UUID;
        v_from_type := v_mutation->>'from_type';
        v_to_type := v_mutation->>'to_type';
        v_transfer_qty := (v_mutation->>'quantity')::INT;
        SELECT item_name, quantity INTO v_item_name, v_item_quantity FROM public.inventory WHERE id = v_item_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND: %', v_item_id USING ERRCODE = 'P0001'; END IF;
        IF v_item_quantity < v_transfer_qty THEN RAISE EXCEPTION 'INSUFFICIENT_QUANTITY: has %, needs %', v_item_quantity, v_transfer_qty USING ERRCODE = 'P0001'; END IF;
        IF v_item_quantity = v_transfer_qty THEN
          DELETE FROM public.inventory WHERE id = v_item_id;
        ELSE
          UPDATE public.inventory SET quantity = quantity - v_transfer_qty WHERE id = v_item_id;
        END IF;
        IF v_to_type = 'player' THEN
          INSERT INTO public.inventory (player_id, item_name, quantity, type, attributes)
          VALUES (v_to_id, v_item_name, v_transfer_qty, 'misc', jsonb_build_object('transferred', true));
        END IF;
        v_applied_count := v_applied_count + 1;

      WHEN 'SPAWN_STRUCTURE' THEN
        v_location_id := (v_mutation->>'location_id')::UUID;
        v_structure := v_mutation->'structure';
        INSERT INTO public.location_structures (location_id, name, type, hp, max_hp)
        VALUES (v_location_id, COALESCE(v_structure->>'name', 'Структура'), COALESCE(v_structure->>'type', 'shelter'), COALESCE((v_structure->>'hp')::INT, 50), COALESCE((v_structure->>'max_hp')::INT, 50));
        v_applied_count := v_applied_count + 1;

      WHEN 'ADVANCE_TIME' THEN
        v_total_minutes := (v_mutation->>'minutes')::INT;
        v_new_minute := v_session_minute + (v_total_minutes % 60);
        v_new_hour := v_session_hour + (v_total_minutes / 60);
        IF v_new_minute >= 60 THEN v_new_hour := v_new_hour + (v_new_minute / 60); v_new_minute := v_new_minute % 60; END IF;
        v_new_day := v_session_day; v_new_month := v_session_month; v_new_year := v_session_year;
        IF v_new_hour >= 24 THEN
          v_new_day := v_new_day + (v_new_hour / 24); v_new_hour := v_new_hour % 24;
          WHILE v_new_day > 30 LOOP
            v_new_day := v_new_day - 30; v_new_month := v_new_month + 1;
            IF v_new_month > 12 THEN v_new_month := 1; v_new_year := v_new_year + 1; END IF;
          END LOOP;
        END IF;
        v_session_minute := v_new_minute; v_session_hour := v_new_hour; v_session_day := v_new_day; v_session_month := v_new_month; v_session_year := v_new_year;
        UPDATE public.sessions SET game_year = v_new_year, game_month = v_new_month, game_day = v_new_day, game_hour = v_new_hour, game_minute = v_new_minute, updated_at = NOW() WHERE id = p_session_id;
        UPDATE public.players SET busy_remaining_minutes = GREATEST(0, busy_remaining_minutes - v_total_minutes), is_busy = (GREATEST(0, busy_remaining_minutes - v_total_minutes) > 0) WHERE session_id = p_session_id AND is_busy = true;
        v_applied_count := v_applied_count + 1;

      WHEN 'SET_PLAYER_BUSY' THEN
        v_busy_player_id := (v_mutation->>'player_id')::UUID;
        v_busy_activity := COALESCE(v_mutation->>'activity', v_mutation->>'activity_description', 'Длительное занятие');
        v_busy_minutes := COALESCE((v_mutation->>'minutes')::INT, (v_mutation->>'duration_minutes')::INT, 60);
        v_reward_preview := v_mutation->>'reward_preview';
        UPDATE public.players
        SET is_busy = true, busy_activity = v_busy_activity, busy_remaining_minutes = v_busy_minutes, busy_target_minutes = v_busy_minutes, busy_reward_meta = jsonb_build_object('preview', v_reward_preview)
        WHERE id = v_busy_player_id;
        v_applied_count := v_applied_count + 1;

      WHEN 'UPDATE_ENTITY_COORDS' THEN
        v_entity_type := v_mutation->>'entity_type';
        v_entity_id := (v_mutation->>'id')::UUID;
        v_pos_x := (v_mutation->>'pos_x')::FLOAT;
        v_pos_y := (v_mutation->>'pos_y')::FLOAT;
        IF v_entity_type = 'player' THEN
          UPDATE public.players SET pos_x = v_pos_x, pos_y = v_pos_y WHERE id = v_entity_id;
        ELSIF v_entity_type = 'npc' THEN
          UPDATE public.npcs SET pos_x = v_pos_x, pos_y = v_pos_y WHERE id = v_entity_id;
        END IF;
        v_applied_count := v_applied_count + 1;

      WHEN 'SET_PLAYER_SUBZONE' THEN
        v_busy_player_id := (v_mutation->>'player_id')::UUID;
        v_subzone_id := NULLIF(v_mutation->>'subzone_id', '')::UUID;
        UPDATE public.players SET subzone_id = v_subzone_id WHERE id = v_busy_player_id;
        v_applied_count := v_applied_count + 1;

      ELSE
        RAISE EXCEPTION 'UNKNOWN_MUTATION_TYPE: %', v_mutation_type USING ERRCODE = 'P0001';
    END CASE;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'applied_count', v_applied_count,
    'new_time', jsonb_build_object('year', v_session_year, 'month', v_session_month, 'day', v_session_day, 'hour', v_session_hour, 'minute', v_session_minute)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'RACE_CONDITION_CONFLICT', 'details', SQLERRM, 'sql_state', SQLSTATE);
END;
$$;

-- 6. RPC ДЛЯ УДАЛЕНИЯ УЧАСТНИКА СЕССИИ СОЗДАТЕЛЕМ
CREATE OR REPLACE FUNCTION public.remove_session_player(
  p_session_id UUID,
  p_player_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_world_owner UUID;
  v_player_name TEXT;
  v_player_user_id UUID;
BEGIN
  SELECT w.owner_id INTO v_world_owner
  FROM public.sessions s
  JOIN public.worlds w ON s.world_id = w.id
  WHERE s.id = p_session_id;

  SELECT name, user_id INTO v_player_name, v_player_user_id
  FROM public.players
  WHERE id = p_player_id AND session_id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Игрок не найден в этой сессии');
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() != v_world_owner AND auth.uid() != v_player_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'У вас нет прав на удаление этого участника');
  END IF;

  DELETE FROM public.turn_queue WHERE player_id = p_player_id;
  DELETE FROM public.player_injuries WHERE player_id = p_player_id;
  DELETE FROM public.player_skills WHERE player_id = p_player_id;
  DELETE FROM public.inventory WHERE player_id = p_player_id;
  DELETE FROM public.players WHERE id = p_player_id;

  INSERT INTO public.messages (
    session_id,
    sender_type,
    sender_name,
    content
  ) VALUES (
    p_session_id,
    'system',
    'Система',
    '🚪 Участник «' || COALESCE(v_player_name, 'Неизвестный') || '» был исключен из сессии Создателем.'
  );

  RETURN jsonb_build_object('success', true, 'player_id', p_player_id, 'player_name', v_player_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.remove_session_player(UUID, UUID) TO authenticated, anon, service_role;

-- 7. REALTIME ПУБЛИКАЦИИ
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
  END IF;
END $$;

-- 8. ОБНОВЛЕНИЕ КЭША POSTGREST
NOTIFY pgrst, 'reload schema';
`;
