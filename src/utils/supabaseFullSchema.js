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
  round_counter INT DEFAULT 1,
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
  stats JSONB DEFAULT '{"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10}',
  stat_points_available INT DEFAULT 0,
  hp INT DEFAULT 30,
  max_hp INT DEFAULT 30,
  money INT DEFAULT 50,
  is_active BOOLEAN DEFAULT TRUE,
  current_zone TEXT DEFAULT NULL,
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
CREATE POLICY "Players: read in same session" ON players FOR SELECT TO authenticated USING (
  session_id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid()))
  OR user_id = auth.uid()
);
CREATE POLICY "Players: join session" ON players FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Players: update own" ON players FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Players: system update" ON players FOR UPDATE USING (true);
CREATE POLICY "Players: delete own" ON players FOR DELETE TO authenticated USING (auth.uid() = user_id);

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

-- 4. RPC ФУНКЦИЯ ДЛЯ USER SETTINGS
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
`;
