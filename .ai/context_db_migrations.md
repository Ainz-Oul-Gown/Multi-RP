This file is a merged representation of a subset of the codebase, containing specifically included files and files not matching ignore patterns, combined into a single document by Repomix.
The content has been processed where content has been compressed (code blocks are separated by ⋮---- delimiter), security check has been disabled.

# File Summary

## Purpose
This file contains a packed representation of a subset of the repository's contents that is considered the most important context.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Only files matching these patterns are included: supabase/migrations/**/*
- Files matching these patterns are excluded: node_modules/**, dist/**, .git/**, .playwright-mcp/**, .ai/**
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Content has been compressed - code blocks are separated by ⋮---- delimiter
- Security check has been disabled - content may contain sensitive information
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
supabase/
  migrations/
    001_initial_schema.sql
    002_user_settings.sql
    003_character_cards.sql
    004_derived_combat_stats.sql
    005_injuries_and_rest.sql
    006_world_geography_and_npcs.sql
    007_npc_inventory_rpc.sql
    008_fix_rls_recursion.sql
    009_npc_category_and_geography.sql
    010_user_settings_models.sql
    011_npc_combat_stats.sql
    012_creature_templates_and_combat.sql
    013_add_world_description.sql
    014_add_hit_dice.sql
    015_add_npc_missing_fields.sql
    016_game_time_and_ai_models.sql
    017_apply_turn_mutations.sql
    018_npc_relationships_and_memories.sql
    019_first_turn_starting_location.sql
    020_skills_leveling_and_npc_combat.sql
    021_open_world_and_npc_alive.sql
    022_dnd_item_taxonomy_and_level_fix.sql
    023_fix_inventory_rpcs_and_npc_hostile.sql
    024_add_session_storyline.sql
    025_safe_session_deletion.sql
    026_fog_of_war.sql
    027_fog_terrain_type.sql
    028_npc_personality_and_dialogue.sql
    029_npc_world_logs.sql
    030_locations_zones_and_map.sql
    031_safe_world_deletion.sql
    032_account_isolation_and_player_delete.sql
    033_add_session_ai_key_mode.sql
    034_creator_can_delete_session_players.sql
    035_party_system.sql
    036_add_sessions_to_realtime.sql
    037_physical_space_and_time.sql
    038_state_border_polygons.sql
```

# Files

## File: supabase/migrations/001_initial_schema.sql
```sql
-- ============================================
-- MultiRP AI — Initial Schema Migration v2
-- All tables first, then policies/indexes/triggers
-- ============================================

-- Clean slate
DROP TABLE IF EXISTS turn_queue CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS lore_files CASCADE;
DROP TABLE IF EXISTS worlds CASCADE;
DROP FUNCTION IF EXISTS update_updated_at CASCADE;
DROP FUNCTION IF EXISTS roll_d20 CASCADE;
DROP FUNCTION IF EXISTS roll_d20_advantage CASCADE;
DROP FUNCTION IF EXISTS roll_d20_disadvantage CASCADE;
DROP FUNCTION IF EXISTS update_player_hp CASCADE;
DROP FUNCTION IF EXISTS add_item_to_inventory CASCADE;
DROP FUNCTION IF EXISTS remove_item_from_inventory CASCADE;

-- Enable UUID extension (gen_random_uuid is built-in for PG 13+)

-- ============================================
-- TABLES (order matters for FK references)
-- ============================================

CREATE TABLE worlds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lore_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  folder TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE RESTRICT,
  difficulty TEXT NOT NULL DEFAULT 'normal' CHECK (difficulty IN ('easy', 'normal', 'hard')),
  is_pvp_enabled BOOLEAN DEFAULT FALSE,
  current_plot_stage TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE players (
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
  stats JSONB DEFAULT '{"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10}',
  hp INT DEFAULT 30,
  max_hp INT DEFAULT 30,
  money INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity INT DEFAULT 1 CHECK (quantity >= 0),
  type TEXT NOT NULL DEFAULT 'misc' CHECK (type IN ('weapon', 'armor', 'consumable', 'misc')),
  attributes JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('player', 'master', 'system')),
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name TEXT DEFAULT '',
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE turn_queue (
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

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_worlds_owner ON worlds(owner_id);
CREATE INDEX idx_lore_files_world ON lore_files(world_id);
CREATE INDEX idx_lore_files_folder ON lore_files(world_id, folder);
CREATE INDEX idx_lore_files_tags ON lore_files USING GIN(tags);
CREATE INDEX idx_sessions_world ON sessions(world_id);
CREATE INDEX idx_players_session ON players(session_id);
CREATE INDEX idx_players_user ON players(user_id);
CREATE INDEX idx_inventory_player ON inventory(player_id);
CREATE INDEX idx_messages_session ON messages(session_id, created_at DESC);
CREATE INDEX idx_turn_queue_session ON turn_queue(session_id, status);
CREATE INDEX idx_turn_queue_player ON turn_queue(player_id);

-- ============================================
-- RLS POLICIES (all tables now exist)
-- ============================================

ALTER TABLE worlds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Worlds: owner read/write" ON worlds FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "Worlds: anyone can read" ON worlds FOR SELECT USING (true);

ALTER TABLE lore_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lore: read for all authenticated" ON lore_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lore: owner write" ON lore_files FOR ALL USING (world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid()));

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sessions: read for authenticated" ON sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sessions: create for authenticated" ON sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Sessions: update for participants" ON sessions FOR UPDATE TO authenticated USING (id IN (SELECT session_id FROM players WHERE user_id = auth.uid()));

ALTER TABLE players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players: read in same session" ON players FOR SELECT TO authenticated USING (session_id IN (SELECT session_id FROM players WHERE user_id = auth.uid()));
CREATE POLICY "Players: join session" ON players FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Players: update own" ON players FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Players: system update" ON players FOR UPDATE USING (true);

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Inventory: read for owner" ON inventory FOR SELECT TO authenticated USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));
CREATE POLICY "Inventory: manage for owner" ON inventory FOR ALL TO authenticated USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));
CREATE POLICY "Inventory: system manage" ON inventory FOR ALL USING (true);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Messages: read for session players" ON messages FOR SELECT TO authenticated USING (session_id IN (SELECT session_id FROM players WHERE user_id = auth.uid()));
CREATE POLICY "Messages: players send" ON messages FOR INSERT TO authenticated WITH CHECK (sender_type = 'player' AND sender_id = auth.uid() AND session_id IN (SELECT session_id FROM players WHERE user_id = auth.uid()));
CREATE POLICY "Messages: system insert" ON messages FOR INSERT WITH CHECK (sender_type IN ('master', 'system'));

ALTER TABLE turn_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Turn: read for session players" ON turn_queue FOR SELECT TO authenticated USING (session_id IN (SELECT session_id FROM players WHERE user_id = auth.uid()));
CREATE POLICY "Turn: system manage" ON turn_queue FOR ALL USING (true);

-- ============================================
-- RPC FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trigger_worlds_updated_at BEFORE UPDATE ON worlds FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_sessions_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_players_updated_at BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_lore_files_updated_at BEFORE UPDATE ON lore_files FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION roll_d20(stat_value INT, difficulty_mod INT DEFAULT 0)
RETURNS TABLE (roll INT, total INT, success BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE d20_roll INT; stat_mod INT; total_val INT;
BEGIN
  d20_roll := floor(random() * 20 + 1)::INT;
  stat_mod := floor((stat_value - 10) / 2.0)::INT;
  total_val := d20_roll + stat_mod + difficulty_mod;
  RETURN QUERY SELECT d20_roll AS roll, total_val AS total, (total_val >= 10) AS success;
END;
$$;

CREATE OR REPLACE FUNCTION roll_d20_advantage(stat_value INT)
RETURNS TABLE (rolls INT[], best_roll INT, total INT, success BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r1 INT; r2 INT; best INT; stat_mod INT; total_val INT;
BEGIN
  r1 := floor(random() * 20 + 1)::INT;
  r2 := floor(random() * 20 + 1)::INT;
  best := GREATEST(r1, r2);
  stat_mod := floor((stat_value - 10) / 2.0)::INT;
  total_val := best + stat_mod;
  RETURN QUERY SELECT ARRAY[r1, r2] AS rolls, best AS best_roll, total_val AS total, (total_val >= 10) AS success;
END;
$$;

CREATE OR REPLACE FUNCTION roll_d20_disadvantage(stat_value INT)
RETURNS TABLE (rolls INT[], worst_roll INT, total INT, success BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r1 INT; r2 INT; worst INT; stat_mod INT; total_val INT;
BEGIN
  r1 := floor(random() * 20 + 1)::INT;
  r2 := floor(random() * 20 + 1)::INT;
  worst := LEAST(r1, r2);
  stat_mod := floor((stat_value - 10) / 2.0)::INT;
  total_val := worst + stat_mod;
  RETURN QUERY SELECT ARRAY[r1, r2] AS rolls, worst AS worst_roll, total_val AS total, (total_val >= 10) AS success;
END;
$$;

CREATE OR REPLACE FUNCTION update_player_hp(p_player_id UUID, p_hp_change INT)
RETURNS TABLE (new_hp INT, new_max_hp INT, is_alive BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE current_hp_val INT; max_hp_val INT; new_hp_val INT;
BEGIN
  SELECT hp, max_hp INTO current_hp_val, max_hp_val FROM players WHERE id = p_player_id FOR UPDATE;
  new_hp_val := GREATEST(0, LEAST(max_hp_val, current_hp_val + p_hp_change));
  UPDATE players SET hp = new_hp_val WHERE id = p_player_id;
  RETURN QUERY SELECT new_hp_val AS new_hp, max_hp_val AS new_max_hp, (new_hp_val > 0) AS is_alive;
END;
$$;

CREATE OR REPLACE FUNCTION add_item_to_inventory(p_player_id UUID, p_item_name TEXT, p_quantity INT DEFAULT 1, p_type TEXT DEFAULT 'misc', p_attributes JSONB DEFAULT '{}')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE existing_item_id UUID; new_id UUID;
BEGIN
  SELECT id INTO existing_item_id FROM inventory WHERE player_id = p_player_id AND item_name = p_item_name AND type = p_type FOR UPDATE;
  IF existing_item_id IS NOT NULL THEN
    UPDATE inventory SET quantity = quantity + p_quantity WHERE id = existing_item_id;
    RETURN existing_item_id;
  ELSE
    new_id := gen_random_uuid();
    INSERT INTO inventory (id, player_id, item_name, quantity, type, attributes) VALUES (new_id, p_player_id, p_item_name, p_quantity, p_type, p_attributes);
    RETURN new_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION remove_item_from_inventory(p_player_id UUID, p_item_name TEXT, p_quantity INT DEFAULT 1)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE existing_item RECORD;
BEGIN
  SELECT id, quantity INTO existing_item FROM inventory WHERE player_id = p_player_id AND item_name = p_item_name FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF existing_item.quantity <= p_quantity THEN
    DELETE FROM inventory WHERE id = existing_item.id;
  ELSE
    UPDATE inventory SET quantity = quantity - p_quantity WHERE id = existing_item.id;
  END IF;
  RETURN TRUE;
END;
$$;

-- ============================================
-- ENABLE REALTIME
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE turn_queue;
```

## File: supabase/migrations/002_user_settings.sql
```sql
-- ============================================
-- MultiRP AI — Migration 002: User Settings
-- ============================================

-- Таблица настроек пользователя (API-ключи и пр.)
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  openrouter_key TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drop existing policies to allow re-running
DROP POLICY IF EXISTS "UserSettings: owner read" ON user_settings;
DROP POLICY IF EXISTS "UserSettings: owner insert" ON user_settings;
DROP POLICY IF EXISTS "UserSettings: owner update" ON user_settings;
DROP POLICY IF EXISTS "UserSettings: service read" ON user_settings;

-- RLS: пользователь видит и редактирует ТОЛЬКО свою строку
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "UserSettings: owner read"
  ON user_settings FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "UserSettings: owner insert"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "UserSettings: owner update"
  ON user_settings FOR UPDATE
  USING (auth.uid() = id);

-- Service role (Edge Functions) может читать настройки любого пользователя
CREATE POLICY "UserSettings: service read"
  ON user_settings FOR SELECT
  USING (true);

-- Drop existing trigger to allow re-running
DROP TRIGGER IF EXISTS trigger_user_settings_updated_at ON user_settings;

-- Триггер auto-updated_at
CREATE TRIGGER trigger_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RPC: Upsert настроек пользователя
-- ============================================
CREATE OR REPLACE FUNCTION upsert_user_settings(
  p_user_id UUID,
  p_openrouter_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_id UUID;
BEGIN
  SELECT id INTO existing_id FROM user_settings WHERE id = p_user_id;

  IF existing_id IS NOT NULL THEN
    UPDATE user_settings
    SET openrouter_key = COALESCE(p_openrouter_key, openrouter_key),
        updated_at = NOW()
    WHERE id = p_user_id;
    RETURN existing_id;
  ELSE
    INSERT INTO user_settings (id, openrouter_key)
    VALUES (p_user_id, p_openrouter_key);
    RETURN p_user_id;
  END IF;
END;
$$;

-- ============================================
-- RPC: Получить ключ пользователя (для Edge Functions)
-- ============================================
CREATE OR REPLACE FUNCTION get_user_openrouter_key(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_key TEXT;
BEGIN
  SELECT openrouter_key INTO v_key
  FROM user_settings
  WHERE id = p_user_id;

  RETURN v_key;
END;
$$;
```

## File: supabase/migrations/003_character_cards.sql
```sql
-- ============================================
-- MultiRP AI — Migration 003: Character Cards
-- Шаблоны персонажей, привязанные к пользователю
-- ============================================

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

-- Drop existing policies to allow re-running
DROP POLICY IF EXISTS "CharCards: owner read" ON character_cards;
DROP POLICY IF EXISTS "CharCards: owner insert" ON character_cards;
DROP POLICY IF EXISTS "CharCards: owner update" ON character_cards;
DROP POLICY IF EXISTS "CharCards: owner delete" ON character_cards;

CREATE INDEX IF NOT EXISTS idx_character_cards_owner ON character_cards(owner_id);

ALTER TABLE character_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CharCards: owner read" ON character_cards
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "CharCards: owner insert" ON character_cards
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "CharCards: owner update" ON character_cards
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "CharCards: owner delete" ON character_cards
  FOR DELETE USING (auth.uid() = owner_id);

DROP TRIGGER IF EXISTS trigger_character_cards_updated_at ON character_cards;
CREATE TRIGGER trigger_character_cards_updated_at
  BEFORE UPDATE ON character_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

## File: supabase/migrations/004_derived_combat_stats.sql
```sql
-- ============================================
-- MultiRP AI — Migration 004: Derived combat stats
-- Инициатива, AC, спасброски, отдых
-- ============================================

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS initiative INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS armor_class INT DEFAULT 10,
  ADD COLUMN IF NOT EXISTS saving_throws JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_rested_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE character_cards
  ADD COLUMN IF NOT EXISTS initiative INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS armor_class INT DEFAULT 10,
  ADD COLUMN IF NOT EXISTS saving_throws JSONB DEFAULT '{}';
```

## File: supabase/migrations/005_injuries_and_rest.sql
```sql
-- ============================================
-- MultiRP AI — Migration 005: Injuries and rest
-- Травмы, дебаффы и отслеживание отдыха
-- ============================================

CREATE TABLE IF NOT EXISTS player_injuries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  injury_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'minor',
  description TEXT DEFAULT '',
  stat_penalties JSONB DEFAULT '{}',
  hp_penalty INT DEFAULT 0,
  duration_hours INT DEFAULT 0,
  is_permanent BOOLEAN DEFAULT false,
  cured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_injuries_player ON player_injuries(player_id);
CREATE INDEX IF NOT EXISTS idx_player_injuries_session ON player_injuries(session_id);

ALTER TABLE player_injuries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to allow re-running
DROP POLICY IF EXISTS "Injuries: session players read" ON player_injuries;
DROP POLICY IF EXISTS "Injuries: system insert" ON player_injuries;
DROP POLICY IF EXISTS "Injuries: system update" ON player_injuries;

CREATE POLICY "Injuries: session players read" ON player_injuries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM players p
      WHERE p.id = player_injuries.player_id
        AND p.session_id = player_injuries.session_id
    )
  );

CREATE POLICY "Injuries: system insert" ON player_injuries
  FOR INSERT WITH CHECK (false);

CREATE POLICY "Injuries: system update" ON player_injuries
  FOR UPDATE USING (false);

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS active_injuries JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS rest_penalty_hours INT DEFAULT 0;
```

## File: supabase/migrations/006_world_geography_and_npcs.sql
```sql
-- ============================================
-- MultiRP AI — Migration 006: World Geography & NPC Matrix
-- География мира (государства, локации, маршруты) и Матрица NPC с векторной памятью (RAG)
-- ============================================

-- Задача 1: Активация pgvector
-- Критично для работы RAG-системы с векторными эмбеддингами
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- Задача 2 & 3: География и Матрица NPC
-- Создаём таблицы без циклических FK, затем добавляем FK через ALTER TABLE
-- ============================================

-- Государства (без ruler_id — добавим позже)
CREATE TABLE IF NOT EXISTS states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  ruler_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_states_world ON states(world_id);

-- Локации (города, деревни, руины, достопримечательности)
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id UUID NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'city' CHECK (type IN ('capital', 'city', 'village', 'ruins', 'landmark')),
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_locations_state ON locations(state_id);
CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(type);

-- Маршруты (дороги/связи между локациями)
CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_a_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  location_b_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  distance_km INT DEFAULT 0 CHECK (distance_km >= 0),
  travel_days INT DEFAULT 0 CHECK (travel_days >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routes_location_a ON routes(location_a_id);
CREATE INDEX IF NOT EXISTS idx_routes_location_b ON routes(location_b_id);

-- Добавляем ограничения после создания таблицы для идемпотентности
ALTER TABLE routes
  DROP CONSTRAINT IF EXISTS routes_no_duplicates,
  ADD CONSTRAINT routes_no_duplicates CHECK (location_a_id < location_b_id);

ALTER TABLE routes
  DROP CONSTRAINT IF EXISTS routes_different_locations,
  ADD CONSTRAINT routes_different_locations CHECK (location_a_id != location_b_id);

-- Матрица NPC (без location_id и state_id — добавим позже)
CREATE TABLE IF NOT EXISTS npcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  location_id UUID,
  state_id UUID,
  -- Лор
  role TEXT NOT NULL DEFAULT 'secondary' CHECK (role IN ('main', 'secondary')),
  name TEXT NOT NULL,
  race TEXT NOT NULL DEFAULT 'Человек',
  appearance TEXT DEFAULT '',
  background TEXT DEFAULT '',
  status_tags TEXT[] DEFAULT '{}',
  habits TEXT[] DEFAULT '{}',
  catchphrases TEXT[] DEFAULT '{}',
  -- Механика
  stats JSONB DEFAULT '{"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10}',
  hp INT DEFAULT 30,
  max_hp INT DEFAULT 30,
  -- Системные
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_npcs_world ON npcs(world_id);
CREATE INDEX IF NOT EXISTS idx_npcs_location ON npcs(location_id);
CREATE INDEX IF NOT EXISTS idx_npcs_state ON npcs(state_id);
CREATE INDEX IF NOT EXISTS idx_npcs_role ON npcs(role);
CREATE INDEX IF NOT EXISTS idx_npcs_status_tags ON npcs USING GIN(status_tags);

-- Теперь добавляем циклические FK через ALTER TABLE
ALTER TABLE states
  DROP CONSTRAINT IF EXISTS fk_states_ruler,
  ADD CONSTRAINT fk_states_ruler FOREIGN KEY (ruler_id) REFERENCES npcs(id) ON DELETE SET NULL;

ALTER TABLE npcs
  DROP CONSTRAINT IF EXISTS fk_npcs_location,
  DROP CONSTRAINT IF EXISTS fk_npcs_state,
  ADD CONSTRAINT fk_npcs_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_npcs_state FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE SET NULL;

-- Изменение таблицы inventory: поддержка NPC
ALTER TABLE inventory
  ALTER COLUMN player_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS npc_id UUID REFERENCES npcs(id) ON DELETE CASCADE;

-- Добавляем ограничение: хотя бы одно из полей должно быть заполнено
ALTER TABLE inventory
  DROP CONSTRAINT IF EXISTS inventory_owner_check,
  ADD CONSTRAINT inventory_owner_check CHECK (
    (player_id IS NOT NULL) OR (npc_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_inventory_npc ON inventory(npc_id);

-- ============================================
-- Задача 4: Каскадная векторная память NPC (RAG)
-- ============================================

CREATE TABLE IF NOT EXISTS npc_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npc_id UUID NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  memory_text TEXT NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'medium' CHECK (memory_type IN ('vivid', 'medium', 'belief')),
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW индекс для быстрого поиска по косинусному расстоянию
CREATE INDEX IF NOT EXISTS idx_npc_memories_embedding ON npc_memories
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_npc_memories_npc ON npc_memories(npc_id);
CREATE INDEX IF NOT EXISTS idx_npc_memories_player ON npc_memories(player_id);
CREATE INDEX IF NOT EXISTS idx_npc_memories_type ON npc_memories(memory_type);

-- ============================================
-- Задача 5: RPC-функция для поиска воспоминаний
-- ============================================

CREATE OR REPLACE FUNCTION match_npc_memories(
  query_embedding vector(1024),
  match_threshold float,
  match_count int,
  p_npc_id uuid,
  p_player_id uuid
)
RETURNS TABLE (
  id uuid,
  npc_id uuid,
  player_id uuid,
  memory_text text,
  memory_type text,
  embedding vector(1024),
  created_at timestamptz,
  similarity float
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    nm.id,
    nm.npc_id,
    nm.player_id,
    nm.memory_text,
    nm.memory_type,
    nm.embedding,
    nm.created_at,
    1 - (nm.embedding <=> query_embedding) AS similarity
  FROM npc_memories nm
  WHERE nm.npc_id = p_npc_id
    AND nm.player_id = p_player_id
    AND nm.embedding IS NOT NULL
    AND 1 - (nm.embedding <=> query_embedding) > match_threshold
  ORDER BY nm.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================
-- TRIGGERS для updated_at
-- ============================================

-- Drop existing triggers to allow re-running
DROP TRIGGER IF EXISTS trigger_states_updated_at ON states;
DROP TRIGGER IF EXISTS trigger_locations_updated_at ON locations;
DROP TRIGGER IF EXISTS trigger_npcs_updated_at ON npcs;

CREATE TRIGGER trigger_states_updated_at BEFORE UPDATE ON states FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_locations_updated_at BEFORE UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_npcs_updated_at BEFORE UPDATE ON npcs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE states ENABLE ROW LEVEL SECURITY;
-- Drop existing policies to allow re-running
DROP POLICY IF EXISTS "States: read for authenticated" ON states;
DROP POLICY IF EXISTS "States: owner write" ON states;
DROP POLICY IF EXISTS "Locations: read for authenticated" ON locations;
DROP POLICY IF EXISTS "Locations: owner write" ON locations;
DROP POLICY IF EXISTS "Routes: read for authenticated" ON routes;
DROP POLICY IF EXISTS "Routes: owner write" ON routes;
DROP POLICY IF EXISTS "NPCs: read for authenticated" ON npcs;
DROP POLICY IF EXISTS "NPCs: owner write" ON npcs;
DROP POLICY IF EXISTS "Memories: read for authenticated" ON npc_memories;
DROP POLICY IF EXISTS "Memories: system manage" ON npc_memories;

CREATE POLICY "States: read for authenticated" ON states FOR SELECT TO authenticated USING (true);
CREATE POLICY "States: owner write" ON states FOR ALL USING (world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid()));

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Locations: read for authenticated" ON locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Locations: owner write" ON locations FOR ALL USING (state_id IN (SELECT id FROM states WHERE world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid())));

ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Routes: read for authenticated" ON routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Routes: owner write" ON routes FOR ALL USING (
  location_a_id IN (SELECT id FROM locations WHERE state_id IN (SELECT id FROM states WHERE world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid())))
);

ALTER TABLE npcs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "NPCs: read for authenticated" ON npcs FOR SELECT TO authenticated USING (true);
CREATE POLICY "NPCs: owner write" ON npcs FOR ALL USING (world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid()));

ALTER TABLE npc_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Memories: read for authenticated" ON npc_memories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Memories: system manage" ON npc_memories FOR ALL USING (true);

-- ============================================
-- TESTS:
-- ============================================
/*
-- Тест 1: Создание государства, столицы, второго города и маршрута

-- Создаем тестовый мир (если нет)
INSERT INTO worlds (owner_id, name, settings)
VALUES ('00000000-0000-0000-0000-000000000000', 'Тестовый мир', '{}')
RETURNING id AS test_world_id;

-- Создаем государство
INSERT INTO states (world_id, name, description)
VALUES (
  '00000000-0000-0000-0000-000000000000',  -- заменить на реальный world_id
  'Королевство Этерия',
  'Древнее королевство, известное своими магами и воинами.'
)
RETURNING id AS state_id;

-- Создаем столицу
INSERT INTO locations (state_id, name, type, description)
VALUES (
  '00000000-0000-0000-0000-000000000000',  -- заменить на реальный state_id
  'Этергард',
  'capital',
  'Великая столица с белокаменными башнями.'
)
RETURNING id AS capital_id;

-- Создаем второй город
INSERT INTO locations (state_id, name, type, description)
VALUES (
  '00000000-0000-0000-0000-000000000000',  -- заменить на реальный state_id
  'Риверхолл',
  'city',
  'Торговый город на реке.'
)
RETURNING id AS city_id;

-- Создаем маршрут между столицей и городом
INSERT INTO routes (location_a_id, location_b_id, distance_km, travel_days)
VALUES (
  '00000000-0000-0000-0000-000000000000',  -- заменить на capital_id
  '00000000-0000-0000-0000-000000000000',  -- заменить на city_id
  120,
  3
);

-- Тест 2: Создание NPC
INSERT INTO npcs (world_id, location_id, role, name, race, appearance, background, status_tags, habits, catchphrases, stats, hp, max_hp)
VALUES (
  '00000000-0000-0000-0000-000000000000',  -- world_id
  '00000000-0000-0000-0000-000000000000',  -- location_id (столица)
  'main',
  'Король Альдрик',
  'Человек',
  'Высокий мужчина с седой бородой и короной.',
  'Наследный король, правящий 30 лет.',
  '{"друг", "наставник"}',
  {'читать книги', 'гулять по саду'},
  {'Корона тяжела', 'Нард превыше всего'},
  '{"STR": 14, "DEX": 10, "CON": 12, "INT": 16, "WIS": 18, "CHA": 20}',
  85,
  85
)
RETURNING id AS npc_id;

-- Тест 3: Создание воспоминания с эмбеддингом
INSERT INTO npc_memories (npc_id, player_id, memory_text, memory_type, embedding)
VALUES (
  '00000000-0000-0000-0000-000000000000',  -- npc_id
  '00000000-0000-0000-0000-000000000000',  -- player_id
  'Игрок спас королю жизнь при покушении.',
  'vivid',
  ARRAY[0.1, 0.2, 0.3]::vector(1024)  -- В реальности 1024 значения, здесь 3 для примера
);

-- Тест 4: Вызов функции поиска воспоминаний
SELECT * FROM match_npc_memories(
  ARRAY[0.1, 0.2, 0.3]::vector(1024),  -- query_embedding (1024 значения)
  0.5,                                 -- match_threshold
  10,                                  -- match_count
  '00000000-0000-0000-0000-000000000000',  -- p_npc_id
  '00000000-0000-0000-0000-000000000000'   -- p_player_id
);
*/

-- ============================================
-- ОБНОВЛЕНИЕ RPC ФУНКЦИЙ ИНВЕНТАРЯ ДЛЯ ПОДДЕРЖКИ NPC
-- ============================================

-- Обновление функции add_item_to_inventory для поддержки NPC
CREATE OR REPLACE FUNCTION add_item_to_inventory(
  p_player_id UUID DEFAULT NULL,
  p_item_name TEXT DEFAULT NULL,
  p_quantity INT DEFAULT 1,
  p_type TEXT DEFAULT 'misc',
  p_attributes JSONB DEFAULT '{}',
  p_npc_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE existing_item_id UUID; new_id UUID;
BEGIN
  -- Ищем существующий предмет по player_id или npc_id
  SELECT id INTO existing_item_id
  FROM inventory
  WHERE (
    (p_player_id IS NOT NULL AND player_id = p_player_id)
    OR (p_npc_id IS NOT NULL AND npc_id = p_npc_id)
  )
  AND item_name = p_item_name
  AND type = p_type
  FOR UPDATE;

  IF existing_item_id IS NOT NULL THEN
    UPDATE inventory SET quantity = quantity + p_quantity WHERE id = existing_item_id;
    RETURN existing_item_id;
  ELSE
    new_id := gen_random_uuid();
    INSERT INTO inventory (id, player_id, npc_id, item_name, quantity, type, attributes)
    VALUES (new_id, p_player_id, p_npc_id, p_item_name, p_quantity, p_type, p_attributes);
    RETURN new_id;
  END IF;
END;
$$;

-- Обновление функции remove_item_from_inventory для поддержки NPC
CREATE OR REPLACE FUNCTION remove_item_from_inventory(
  p_player_id UUID DEFAULT NULL,
  p_item_name TEXT DEFAULT NULL,
  p_quantity INT DEFAULT 1,
  p_npc_id UUID DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE existing_item RECORD;
BEGIN
  -- Ищем существующий предмет по player_id или npc_id
  SELECT id, quantity INTO existing_item
  FROM inventory
  WHERE (
    (p_player_id IS NOT NULL AND player_id = p_player_id)
    OR (p_npc_id IS NOT NULL AND npc_id = p_npc_id)
  )
  AND item_name = p_item_name
  FOR UPDATE;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  IF existing_item.quantity <= p_quantity THEN
    DELETE FROM inventory WHERE id = existing_item.id;
  ELSE
    UPDATE inventory SET quantity = quantity - p_quantity WHERE id = existing_item.id;
  END IF;

  RETURN TRUE;
END;
$$;
```

## File: supabase/migrations/007_npc_inventory_rpc.sql
```sql
-- Обновление RPC функций инвентаря для поддержки NPC
-- Применять после миграции 006

-- Обновление функции add_item_to_inventory для поддержки NPC
CREATE OR REPLACE FUNCTION add_item_to_inventory(
  p_player_id UUID DEFAULT NULL,
  p_item_name TEXT DEFAULT NULL,
  p_quantity INT DEFAULT 1,
  p_type TEXT DEFAULT 'misc',
  p_attributes JSONB DEFAULT '{}',
  p_npc_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE existing_item_id UUID; new_id UUID;
BEGIN
  -- Ищем существующий предмет по player_id или npc_id
  SELECT id INTO existing_item_id
  FROM inventory
  WHERE (
    (p_player_id IS NOT NULL AND player_id = p_player_id)
    OR (p_npc_id IS NOT NULL AND npc_id = p_npc_id)
  )
  AND item_name = p_item_name
  AND type = p_type
  FOR UPDATE;

  IF existing_item_id IS NOT NULL THEN
    UPDATE inventory SET quantity = quantity + p_quantity WHERE id = existing_item_id;
    RETURN existing_item_id;
  ELSE
    new_id := gen_random_uuid();
    INSERT INTO inventory (id, player_id, npc_id, item_name, quantity, type, attributes)
    VALUES (new_id, p_player_id, p_npc_id, p_item_name, p_quantity, p_type, p_attributes);
    RETURN new_id;
  END IF;
END;
$$;

-- Обновление функции remove_item_from_inventory для поддержки NPC
CREATE OR REPLACE FUNCTION remove_item_from_inventory(
  p_player_id UUID DEFAULT NULL,
  p_item_name TEXT DEFAULT NULL,
  p_quantity INT DEFAULT 1,
  p_npc_id UUID DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE existing_item RECORD;
BEGIN
  -- Ищем существующий предмет по player_id или npc_id
  SELECT id, quantity INTO existing_item
  FROM inventory
  WHERE (
    (p_player_id IS NOT NULL AND player_id = p_player_id)
    OR (p_npc_id IS NOT NULL AND npc_id = p_npc_id)
  )
  AND item_name = p_item_name
  FOR UPDATE;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  IF existing_item.quantity <= p_quantity THEN
    DELETE FROM inventory WHERE id = existing_item.id;
  ELSE
    UPDATE inventory SET quantity = quantity - p_quantity WHERE id = existing_item.id;
  END IF;

  RETURN TRUE;
END;
$$;
```

## File: supabase/migrations/008_fix_rls_recursion.sql
```sql
-- ============================================
-- MultiRP AI — Migration 008: Fix RLS Infinite Recursion
-- ============================================
-- Исправляет ошибку "infinite recursion detected in policy for relation players"
-- Создаём SECURITY DEFINER функцию, которая обходит RLS при проверке участия в сессии

-- Функция для получения session_id пользователя (обходит RLS через SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_user_session_ids(p_user_id UUID)
RETURNS TABLE(session_id UUID)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT DISTINCT p.session_id FROM public.players p WHERE p.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Функция для получения player_id пользователя (обходит RLS через SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_user_player_ids(p_user_id UUID)
RETURNS TABLE(player_id UUID)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT p.id FROM public.players p WHERE p.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ИСПРАВЛЕНИЕ ПОЛИТИК players
-- ============================================

-- Удаляем рекурсивную политику
DROP POLICY IF EXISTS "Players: read in same session" ON players;

-- Создаём нерекурсивную политику через функцию
CREATE POLICY "Players: read in same session" ON players FOR SELECT TO authenticated
USING (
  session_id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid()))
  OR user_id = auth.uid()
);

-- ============================================
-- ИСПРАВЛЕНИЕ ПОЛИТИК sessions
-- ============================================

DROP POLICY IF EXISTS "Sessions: update for participants" ON sessions;

CREATE POLICY "Sessions: update for participants" ON sessions FOR UPDATE TO authenticated
USING (id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid())));

-- ============================================
-- ИСПРАВЛЕНИЕ ПОЛИТИК inventory
-- ============================================

DROP POLICY IF EXISTS "Inventory: read for owner" ON inventory;
DROP POLICY IF EXISTS "Inventory: manage for owner" ON inventory;

CREATE POLICY "Inventory: read for owner" ON inventory FOR SELECT TO authenticated
USING (player_id IN (SELECT player_id FROM public.get_user_player_ids(auth.uid())));

CREATE POLICY "Inventory: manage for owner" ON inventory FOR ALL TO authenticated
USING (player_id IN (SELECT player_id FROM public.get_user_player_ids(auth.uid())));

-- ============================================
-- ИСПРАВЛЕНИЕ ПОЛИТИК messages
-- ============================================

DROP POLICY IF EXISTS "Messages: read for session players" ON messages;
DROP POLICY IF EXISTS "Messages: players send" ON messages;

CREATE POLICY "Messages: read for session players" ON messages FOR SELECT TO authenticated
USING (session_id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid())));

CREATE POLICY "Messages: players send" ON messages FOR INSERT TO authenticated
WITH CHECK (
  sender_type = 'player'
  AND sender_id = auth.uid()
  AND session_id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid()))
);

-- ============================================
-- ИСПРАВЛЕНИЕ ПОЛИТИК turn_queue
-- ============================================

DROP POLICY IF EXISTS "Turn: read for session players" ON turn_queue;

CREATE POLICY "Turn: read for session players" ON turn_queue FOR SELECT TO authenticated
USING (session_id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid())));

-- ============================================
-- ДОБАВЛЕНИЕ ВОЗМОЖНОСТИ СОЗДАВАТЬ NPC ВРУЧНУЮ
-- ============================================

-- Функция для создания NPC со всеми полями (вызывается из Edge Function или напрямую)
CREATE OR REPLACE FUNCTION public.create_npc(
  p_world_id UUID,
  p_name TEXT,
  p_role TEXT DEFAULT 'secondary',
  p_race TEXT DEFAULT 'Человек',
  p_appearance TEXT DEFAULT '',
  p_background TEXT DEFAULT '',
  p_status_tags TEXT[] DEFAULT '{}',
  p_habits TEXT[] DEFAULT '{}',
  p_catchphrases TEXT[] DEFAULT '{}',
  p_stats JSONB DEFAULT '{"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10}',
  p_hp INT DEFAULT 30,
  p_max_hp INT DEFAULT 30,
  p_location_id UUID DEFAULT NULL,
  p_state_id UUID DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_npc_id UUID;
BEGIN
  -- Проверяем, что мир существует
  IF NOT EXISTS (SELECT 1 FROM worlds WHERE id = p_world_id) THEN
    RAISE EXCEPTION 'World with id % not found', p_world_id;
  END IF;

  new_npc_id := gen_random_uuid();

  INSERT INTO npcs (
    id, world_id, location_id, state_id, role, name, race,
    appearance, background, status_tags, habits, catchphrases,
    stats, hp, max_hp
  ) VALUES (
    new_npc_id, p_world_id, p_location_id, p_state_id, p_role, p_name, p_race,
    p_appearance, p_background, p_status_tags, p_habits, p_catchphrases,
    p_stats, p_hp, p_max_hp
  );

  RETURN new_npc_id;
END;
$$ LANGUAGE plpgsql;
```

## File: supabase/migrations/009_npc_category_and_geography.sql
```sql
-- ============================================
-- MultiRP AI — Migration 009: NPC Category & Location Binding
-- ============================================
-- Добавляет категорию NPC (npc, beast, monster, boss)
-- Привязка NPC к локациям и государствам

-- Добавляем колонку category в таблицу npcs
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'npc' CHECK (category IN ('npc', 'beast', 'monster', 'boss'));

-- Индекс для быстрой фильтрации по категории
CREATE INDEX IF NOT EXISTS idx_npcs_category ON npcs(category);

-- Комментарий к колонке
COMMENT ON COLUMN npcs.category IS 'Категория NPC: npc (разумное существо), beast (зверь), monster (монстр), boss (босс)';

-- RPC функция для получения списка государств и локаций мира
CREATE OR REPLACE FUNCTION get_world_geography(p_world_id UUID)
RETURNS TABLE (
  states JSONB,
  locations JSONB
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'description', s.description
        ) ORDER BY s.name)
      FROM states s WHERE s.world_id = p_world_id),
      '[]'::jsonb
    ) AS states,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'name', l.name,
          'type', l.type,
          'state_id', l.state_id
        ) ORDER BY l.type, l.name)
      FROM locations l
      JOIN states s ON l.state_id = s.id
      WHERE s.world_id = p_world_id),
      '[]'::jsonb
    ) AS locations;
END;
$$;

COMMENT ON FUNCTION get_world_geography IS 'Возвращает список государств и локаций мира для привязки NPC';
```

## File: supabase/migrations/010_user_settings_models.sql
```sql
-- ============================================
-- MultiRP AI — Migration 010: User Settings Models
-- ============================================
-- Добавляет поля card_model и dm_model в таблицу user_settings

-- Добавляем колонки для моделей
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS card_model TEXT DEFAULT 'xiaomi/mimo-v2.5',
  ADD COLUMN IF NOT EXISTS dm_model TEXT DEFAULT 'xiaomi/mimo-v2.5';

-- Обновляем RPC функцию
CREATE OR REPLACE FUNCTION upsert_user_settings(
  p_user_id UUID,
  p_openrouter_key TEXT DEFAULT NULL,
  p_card_model TEXT DEFAULT NULL,
  p_dm_model TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_settings (id, openrouter_key, card_model, dm_model)
  VALUES (
    p_user_id,
    COALESCE(p_openrouter_key, ''),
    COALESCE(p_card_model, 'xiaomi/mimo-v2.5'),
    COALESCE(p_dm_model, 'xiaomi/mimo-v2.5')
  )
  ON CONFLICT (id) DO UPDATE SET
    openrouter_key = CASE WHEN p_openrouter_key IS NOT NULL THEN p_openrouter_key ELSE user_settings.openrouter_key END,
    card_model = CASE WHEN p_card_model IS NOT NULL THEN p_card_model ELSE user_settings.card_model END,
    dm_model = CASE WHEN p_dm_model IS NOT NULL THEN p_dm_model ELSE user_settings.dm_model END,
    updated_at = NOW();
END;
$$;

COMMENT ON COLUMN user_settings.card_model IS 'Модель для генерации карточек (бестиарий)';
COMMENT ON COLUMN user_settings.dm_model IS 'Модель для ДМа (рассказчик)';
```

## File: supabase/migrations/011_npc_combat_stats.sql
```sql
-- Migration 011: Add combat stats to NPCs (level, AC, initiative, saving_throws)
-- NPCs now have the same combat characteristics as player characters

ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS level INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS armor_class INT DEFAULT 10,
  ADD COLUMN IF NOT EXISTS initiative INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saving_throws JSONB DEFAULT '{}';

-- Update role constraint to include 'tertiary'
ALTER TABLE npcs DROP CONSTRAINT IF EXISTS npcs_role_check;
ALTER TABLE npcs ADD CONSTRAINT npcs_role_check 
  CHECK (role IN ('main', 'secondary', 'tertiary'));
```

## File: supabase/migrations/012_creature_templates_and_combat.sql
```sql
-- Migration 012: Creature templates & combat system overhaul
-- Tier = potential, Level = current power (1-100)
-- Separate table for beast/monster species templates
-- Stat sum: creatures 50-200 (player starts at 72)

-- =====================================================
-- CREATURE TEMPLATES: species definitions with level ranges
-- =====================================================
CREATE TABLE IF NOT EXISTS creature_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  
  -- Identity
  species_name TEXT NOT NULL, -- "Волк", "Дракон", "Гоблин" (not individual name)
  race TEXT NOT NULL DEFAULT 'Чудовище',
  category TEXT NOT NULL DEFAULT 'monster' CHECK (category IN ('beast', 'monster', 'boss')),
  
  -- Potential vs Current power
  tier INT NOT NULL CHECK (tier BETWEEN 1 AND 5), -- Max potential (determines special attacks count)
  level_min INT NOT NULL DEFAULT 1 CHECK (level_min >= 1 AND level_min <= 100),
  level_max INT NOT NULL DEFAULT 10 CHECK (level_max >= 1 AND level_max <= 100),
  
  -- Base stats (at level 1) — sum ~50 for weak creatures (player starts at 72)
  stats_base JSONB DEFAULT '{"STR": 8, "DEX": 8, "CON": 8, "INT": 6, "WIS": 6, "CHA": 4}',
  
  -- Combat
  special_attacks JSONB DEFAULT '[]', -- Array of special abilities (count = tier)
  base_attacks JSONB DEFAULT '[]', -- Array of basic attacks (2-3 per 10 levels)
  hp_multiplier DECIMAL DEFAULT 1.5, -- HP = CON * level * multiplier
  
  -- Behavior
  is_pack BOOLEAN DEFAULT false, -- Can appear in packs/groups
  is_unique BOOLEAN DEFAULT false, -- If true, only one instance exists (gets a name)
  
  -- Lore
  description TEXT DEFAULT '',
  habitat TEXT DEFAULT '', -- Preferred environment
  loot_tier INT DEFAULT 1 CHECK (loot_tier BETWEEN 1 AND 5),
  
  -- System
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_level_range CHECK (level_max >= level_min)
);

-- Index for fast lookup
CREATE INDEX idx_creature_templates_world ON creature_templates(world_id);
CREATE INDEX idx_creature_templates_category ON creature_templates(category);
CREATE INDEX idx_creature_templates_species ON creature_templates(species_name);

-- =====================================================
-- Update NPCs table: link to template, add attacks
-- =====================================================
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES creature_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS special_attacks JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS base_attacks JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS is_pack_instance BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pack_size INT DEFAULT 1;

-- Ensure max level is 100
ALTER TABLE npcs DROP CONSTRAINT IF EXISTS npcs_level_check;
ALTER TABLE npcs ADD CONSTRAINT npcs_level_check CHECK (level >= 1 AND level <= 100);

-- Create index for template lookups
CREATE INDEX idx_npcs_template ON npcs(template_id);

-- =====================================================
-- Function to calculate stats at a given level
-- Base sum at level 1: ~50 (creatures weaker than starting player at 72)
-- Each level: +2 to stat sum
-- Each tier: +10 to stat sum (bonus potential)
-- Max at level 100 + tier 5: 50 + 198 + 50 = ~200
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_creature_stats(
  base_stats JSONB,
  current_level INT,
  creature_tier INT
) RETURNS JSONB AS $$
DECLARE
  result JSONB := '{}';
  stat_key TEXT;
  base_val INT;
  scaled_val INT;
  final_sum INT := 0;
  target_sum INT;
  diff INT;
  adjust_stat TEXT;
  max_dist INT := 0;
  current_dist INT;
  stat_count INT := 6;
  per_stat_gain DECIMAL;
  tier_bonus_per_stat DECIMAL;
BEGIN
  -- Target sum: base 50 + (level-1)*2 + (tier-1)*10, capped at 200
  target_sum := 50 + ((current_level - 1) * 2) + ((creature_tier - 1) * 10);
  IF target_sum > 200 THEN target_sum := 200; END IF;
  
  -- Per-stat gain: each level adds ~0.33 to each stat (2 points / 6 stats)
  -- Each tier adds ~1.67 to each stat (10 points / 6 stats)
  per_stat_gain := (current_level - 1) * 0.33;
  tier_bonus_per_stat := (creature_tier - 1) * 1.67;
  
  -- First pass: scale each stat proportionally
  FOR stat_key IN SELECT unnest(ARRAY['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'])
  LOOP
    base_val := COALESCE((base_stats->>stat_key)::INT, 8);
    scaled_val := base_val + (per_stat_gain::INT) + (tier_bonus_per_stat::INT);
    -- Bonus for primary stats (STR for beasts, INT for monsters)
    IF stat_key = 'STR' AND creature_tier >= 3 THEN
      scaled_val := scaled_val + 2;
    ELSIF stat_key = 'INT' AND creature_tier >= 4 THEN
      scaled_val := scaled_val + 2;
    END IF;
    IF scaled_val > 30 THEN scaled_val := 30; END IF;
    IF scaled_val < 1 THEN scaled_val := 1; END IF;
    result := result || jsonb_build_object(stat_key, scaled_val);
    final_sum := final_sum + scaled_val;
  END LOOP;
  
  -- Adjust to match target sum
  diff := target_sum - final_sum;
  IF diff != 0 THEN
    -- Find stat furthest from base 8 to adjust
    adjust_stat := 'STR';
    max_dist := 0;
    FOR stat_key IN SELECT unnest(ARRAY['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'])
    LOOP
      current_dist := ABS((result->>stat_key)::INT - 8);
      IF current_dist > max_dist THEN
        max_dist := current_dist;
        adjust_stat := stat_key;
      END IF;
    END LOOP;
    result := result || jsonb_build_object(adjust_stat, GREATEST(1, LEAST(30, (result->>adjust_stat)::INT + diff)));
  END IF;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- Function to calculate HP from CON and level
-- Unified formula for players AND creatures:
-- HP = (CON * 2 + 10) + level * CON * 0.5
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_creature_hp(
  con_stat INT,
  current_level INT,
  creature_tier INT,
  hp_mult DECIMAL DEFAULT 1.5
) RETURNS INT AS $$
DECLARE
  base_hp INT;
  level_bonus INT;
BEGIN
  -- Unified formula: (CON * 2 + 10) + level * CON * 0.5
  base_hp := GREATEST(1, con_stat * 2 + 10);
  level_bonus := GREATEST(0, (current_level * con_stat * 5 / 10)::INT);
  
  RETURN base_hp + level_bonus;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- Function to calculate special attacks count by tier
-- =====================================================
CREATE OR REPLACE FUNCTION get_special_attacks_count(creature_tier INT)
RETURNS INT AS $$
BEGIN
  -- Tier 1: 1 special attack, Tier 5: 5 special attacks
  RETURN GREATEST(1, LEAST(5, creature_tier));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- Function to calculate base attacks count by level
-- =====================================================
CREATE OR REPLACE FUNCTION get_base_attacks_count(current_level INT)
RETURNS INT AS $$
BEGIN
  -- 2 base attacks at level 1-10, +1 per 10 levels, max 10
  RETURN GREATEST(2, LEAST(10, 2 + ((current_level - 1) / 10)));
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

## File: supabase/migrations/013_add_world_description.sql
```sql
-- Migration 013: Add description to worlds table
-- The export format includes world.description, so we need to store it

ALTER TABLE worlds
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
```

## File: supabase/migrations/014_add_hit_dice.sql
```sql
-- Migration 014: Add hit_dice to NPCs (D&D hit dice system)
-- Level 1: max die + CON mod + 10
-- Each next: average die + CON mod

ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS hit_dice INT DEFAULT 8 CHECK (hit_dice IN (6, 8, 10, 12));
```

## File: supabase/migrations/015_add_npc_missing_fields.sql
```sql
-- ============================================
-- MultiRP AI — Migration 015: NPC Missing Fields
-- Добавляет поля, которые используются в коде/экспорте но отсутствуют в БД
-- ============================================

-- class: класс персонажа (воин/маг/жрец/etc), используется для определения hit_dice
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS class TEXT NOT NULL DEFAULT '';

-- tier: потенциал существа (1-5), определяет количество спецатак
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS tier INT DEFAULT 1 CHECK (tier BETWEEN 1 AND 5);

-- is_unique: уникальный экспр (получает имя), для неуникальных — диапазон уровней
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS is_unique BOOLEAN DEFAULT false;

-- level_min: минимальный уровень при спавне (для неуникальных существ)
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS level_min INT DEFAULT 1 CHECK (level_min >= 1 AND level_min <= 100);

-- level_max: максимальный уровень при спавне (для неуникальных существ)
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS level_max INT DEFAULT 1 CHECK (level_max >= 1 AND level_max <= 100);

-- Ограничение: level_max >= level_min
ALTER TABLE npcs
  DROP CONSTRAINT IF EXISTS npcs_valid_level_range,
  ADD CONSTRAINT npcs_valid_level_range CHECK (level_max >= level_min);

-- Индексы для быстрой фильтрации
CREATE INDEX IF NOT EXISTS idx_npcs_class ON npcs(class);
CREATE INDEX IF NOT EXISTS idx_npcs_tier ON npcs(tier);
CREATE INDEX IF NOT EXISTS idx_npcs_is_unique ON npcs(is_unique);
CREATE INDEX IF NOT EXISTS idx_npcs_level_min ON npcs(level_min);
CREATE INDEX IF NOT EXISTS idx_npcs_level_max ON npcs(level_max);

-- Комментарии
COMMENT ON COLUMN npcs.class IS 'Класс персонажа (воин/маг/жрец/etc), используется для определения hit_dice';
COMMENT ON COLUMN npcs.tier IS 'Потенциал существа (1-5), определяет количество спецатак';
COMMENT ON COLUMN npcs.is_unique IS 'Уникальный экземпляр (получает имя), для неуникальных — диапазон уровней';
COMMENT ON COLUMN npcs.level_min IS 'Минимальный уровень при спавне (для неуникальных существ)';
COMMENT ON COLUMN npcs.level_max IS 'Максимальный уровень при спавне (для неуникальных существ)';
```

## File: supabase/migrations/016_game_time_and_ai_models.sql
```sql
-- ============================================
-- MultiRP AI — Migration 016: Game Time & GPS/Satellite Models
-- ============================================
-- Добавляет поля игрового времени в sessions
-- Добавляет поля gps_model и satellite_model в user_settings

-- ============================================
-- Игровое время сессии (год, месяц, день, час, минута)
-- ============================================
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS game_year INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS game_month INT DEFAULT 1 CHECK (game_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS game_day INT DEFAULT 1 CHECK (game_day BETWEEN 1 AND 30),
  ADD COLUMN IF NOT EXISTS game_hour INT DEFAULT 8 CHECK (game_hour BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS game_minute INT DEFAULT 0 CHECK (game_minute BETWEEN 0 AND 59);

-- Текущая локация сессии (для отслеживания перемещений)
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS current_location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_state_id UUID REFERENCES states(id) ON DELETE SET NULL;

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_sessions_location ON sessions(current_location_id);
CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(current_state_id);

-- ============================================
-- Модели для GPS и Сателлит нейронок
-- ============================================
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS gps_model TEXT DEFAULT 'xiaomi/mimo-v2.5',
  ADD COLUMN IF NOT EXISTS satellite_model TEXT DEFAULT 'xiaomi/mimo-v2.5';

-- Обновляем RPC функцию
CREATE OR REPLACE FUNCTION upsert_user_settings(
  p_user_id UUID,
  p_openrouter_key TEXT DEFAULT NULL,
  p_card_model TEXT DEFAULT NULL,
  p_dm_model TEXT DEFAULT NULL,
  p_gps_model TEXT DEFAULT NULL,
  p_satellite_model TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_settings (id, openrouter_key, card_model, dm_model, gps_model, satellite_model)
  VALUES (
    p_user_id,
    COALESCE(p_openrouter_key, ''),
    COALESCE(p_card_model, 'xiaomi/mimo-v2.5'),
    COALESCE(p_dm_model, 'xiaomi/mimo-v2.5'),
    COALESCE(p_gps_model, 'xiaomi/mimo-v2.5'),
    COALESCE(p_satellite_model, 'xiaomi/mimo-v2.5')
  )
  ON CONFLICT (id) DO UPDATE SET
    openrouter_key = CASE WHEN p_openrouter_key IS NOT NULL THEN p_openrouter_key ELSE user_settings.openrouter_key END,
    card_model = CASE WHEN p_card_model IS NOT NULL THEN p_card_model ELSE user_settings.card_model END,
    dm_model = CASE WHEN p_dm_model IS NOT NULL THEN p_dm_model ELSE user_settings.dm_model END,
    gps_model = CASE WHEN p_gps_model IS NOT NULL THEN p_gps_model ELSE user_settings.gps_model END,
    satellite_model = CASE WHEN p_satellite_model IS NOT NULL THEN p_satellite_model ELSE user_settings.satellite_model END,
    updated_at = NOW();
END;
$$;

-- Комментарии
COMMENT ON COLUMN sessions.game_year IS 'Игровой год сессии';
COMMENT ON COLUMN sessions.game_month IS 'Игровой месяц (1-12)';
COMMENT ON COLUMN sessions.game_day IS 'Игровой день (1-30)';
COMMENT ON COLUMN sessions.game_hour IS 'Игровой час (0-23)';
COMMENT ON COLUMN sessions.game_minute IS 'Игровая минута (0-59)';
COMMENT ON COLUMN sessions.current_location_id IS 'Текущая локация сессии';
COMMENT ON COLUMN sessions.current_state_id IS 'Текущее государство сессии';
COMMENT ON COLUMN user_settings.gps_model IS 'Модель для GPS нейронки (время и локация)';
COMMENT ON COLUMN user_settings.satellite_model IS 'Модель для Сателит нейронки (намерения игрока)';
```

## File: supabase/migrations/017_apply_turn_mutations.sql
```sql
-- ============================================
-- MultiRP AI — Migration 017: Atomic Turn Mutations
-- ============================================
-- Атомарная RPC apply_turn_mutations() для Шага 3
-- Гарантирует ACID-транзакцию для всех мутаций хода (защита от race conditions)

-- ============================================
-- Таблица структур локаций (для build_structure)
-- ============================================
CREATE TABLE IF NOT EXISTS location_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'shelter',
  hp INT DEFAULT 50 CHECK (hp >= 0),
  max_hp INT DEFAULT 50 CHECK (max_hp >= 0),
  created_by UUID REFERENCES players(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_structures_location ON location_structures(location_id);
CREATE INDEX IF NOT EXISTS idx_location_structures_type ON location_structures(type);

COMMENT ON TABLE location_structures IS 'Структуры, построенные игроками (укрытия, мосты, ловушки)';
COMMENT ON COLUMN location_structures.type IS 'Тип структуры: shelter, bridge, trap, decoration, etc.';

-- ============================================
-- Патч колонок инвентаря: durability, condition, updated_at
-- (необходимо для assess-durability и UPDATE_DURABILITY мутаций)
-- ============================================
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS durability INT DEFAULT 100,
  ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'good',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_inventory_durability ON inventory(durability);

COMMENT ON COLUMN inventory.durability IS 'Прочность предмета (0-100). 0 = сломан';
COMMENT ON COLUMN inventory.condition IS 'Состояние: good, worn, damaged, broken';
COMMENT ON COLUMN inventory.updated_at IS 'Время последнего изменения предмета';

-- ============================================
-- RPC: apply_turn_mutations
-- ============================================
CREATE OR REPLACE FUNCTION apply_turn_mutations(
  p_mutations JSONB,
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mutation JSONB;
  v_mutation_type TEXT;
  v_applied_count INT := 0;
  v_current_time JSONB;
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

  -- UPDATE_HP
  v_target_type TEXT;
  v_target_id UUID;
  v_delta INT;
  v_current_hp INT;
  v_max_hp INT;

  -- UPDATE_DURABILITY
  v_item_id UUID;
  v_durability_delta INT;
  v_set_broken BOOLEAN;
  v_current_durability INT;
  v_attrs JSONB;
  v_item_name TEXT;
  v_item_quantity INT;

  -- DELETE_ITEM
  v_delete_qty INT;

  -- INSERT_ITEM
  v_owner_id UUID;
  v_owner_type TEXT;
  v_item JSONB;

  -- TRANSFER_ITEM
  v_from_id UUID;
  v_to_id UUID;
  v_from_type TEXT;
  v_to_type TEXT;
  v_transfer_qty INT;

  -- SPAWN_STRUCTURE
  v_location_id UUID;
  v_structure JSONB;
BEGIN
  -- ============================================
  -- Загружаем текущее время сессии (для ADVANCE_TIME)
  -- ============================================
  SELECT game_year, game_month, game_day, game_hour, game_minute
  INTO v_session_year, v_session_month, v_session_day, v_session_hour, v_session_minute
  FROM sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: %', p_session_id
      USING ERRCODE = 'P0001';
  END IF;

  v_new_year := v_session_year;
  v_new_month := v_session_month;
  v_new_day := v_session_day;
  v_new_hour := v_session_hour;
  v_new_minute := v_session_minute;

  -- ============================================
  -- Цикл по мутациям
  -- ============================================
  FOR v_mutation IN SELECT * FROM jsonb_array_elements(p_mutations)
  LOOP
    v_mutation_type := v_mutation->>'type';

    CASE v_mutation_type
      WHEN 'UPDATE_HP' THEN
        v_target_type := v_mutation->>'target_type';
        v_target_id := (v_mutation->>'id')::UUID;
        v_delta := (v_mutation->>'delta')::INT;

        IF v_target_type = 'player' THEN
          SELECT hp, max_hp INTO v_current_hp, v_max_hp
          FROM players WHERE id = v_target_id FOR UPDATE;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'TARGET_NOT_FOUND: player %', v_target_id
              USING ERRCODE = 'P0001';
          END IF;

          UPDATE players
          SET hp = GREATEST(0, LEAST(max_hp, hp + v_delta)),
              updated_at = NOW()
          WHERE id = v_target_id;

          v_applied_count := v_applied_count + 1;

        ELSIF v_target_type = 'npc' THEN
          SELECT hp, max_hp INTO v_current_hp, v_max_hp
          FROM npcs WHERE id = v_target_id FOR UPDATE;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'TARGET_NOT_FOUND: npc %', v_target_id
              USING ERRCODE = 'P0001';
          END IF;

          UPDATE npcs
          SET hp = GREATEST(0, LEAST(max_hp, hp + v_delta)),
              updated_at = NOW()
          WHERE id = v_target_id;

          v_applied_count := v_applied_count + 1;
        ELSE
          RAISE EXCEPTION 'INVALID_TARGET_TYPE: %', v_target_type
            USING ERRCODE = 'P0001';
        END IF;

      WHEN 'UPDATE_DURABILITY' THEN
        v_item_id := (v_mutation->>'item_id')::UUID;
        v_durability_delta := (v_mutation->>'delta')::INT;
        v_set_broken := COALESCE((v_mutation->>'set_broken')::BOOLEAN, FALSE);

        SELECT item_name, attributes, durability
        INTO v_item_name, v_attrs, v_current_durability
        FROM inventory WHERE id = v_item_id FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'ITEM_NOT_FOUND: %', v_item_id
            USING ERRCODE = 'P0001';
        END IF;

        -- Обновляем durability в attributes JSONB
        v_attrs := COALESCE(v_attrs, '{}'::JSONB);
        v_attrs := v_attrs || jsonb_build_object(
          'durability', GREATEST(0, LEAST(100, COALESCE((v_attrs->>'durability')::INT, 100) + v_durability_delta))
        );

        IF v_set_broken OR (v_attrs->>'durability')::INT = 0 THEN
          v_attrs := v_attrs || jsonb_build_object('condition', 'broken');
        END IF;

        UPDATE inventory
        SET attributes = v_attrs,
            durability = COALESCE((v_attrs->>'durability')::INT, durability),
            updated_at = NOW()
        WHERE id = v_item_id;

        v_applied_count := v_applied_count + 1;

      WHEN 'DELETE_ITEM' THEN
        v_item_id := (v_mutation->>'item_id')::UUID;
        v_delete_qty := COALESCE((v_mutation->>'quantity')::INT, 1);

        SELECT item_name, quantity
        INTO v_item_name, v_item_quantity
        FROM inventory WHERE id = v_item_id FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'ITEM_NOT_AVAILABLE: %', v_item_id
            USING ERRCODE = 'P0001';
        END IF;

        IF v_item_quantity < v_delete_qty THEN
          RAISE EXCEPTION 'ITEM_NOT_AVAILABLE: % (have %, need %)',
            v_item_id, v_item_quantity, v_delete_qty
            USING ERRCODE = 'P0001';
        END IF;

        IF v_item_quantity = v_delete_qty THEN
          DELETE FROM inventory WHERE id = v_item_id;
        ELSE
          UPDATE inventory
          SET quantity = quantity - v_delete_qty,
              updated_at = NOW()
          WHERE id = v_item_id;
        END IF;

        v_applied_count := v_applied_count + 1;

      WHEN 'INSERT_ITEM' THEN
        v_owner_id := (v_mutation->>'owner_id')::UUID;
        v_owner_type := v_mutation->>'owner_type';
        v_item := v_mutation->'item';

        IF v_owner_type = 'player' THEN
          -- Используем существующий add_item_to_inventory
          PERFORM add_item_to_inventory(
            p_player_id := v_owner_id,
            p_item_name := v_item->>'item_name',
            p_quantity := COALESCE((v_item->>'quantity')::INT, 1),
            p_type := COALESCE(v_item->>'type', 'misc'),
            p_attributes := COALESCE(v_item->'attributes', '{}'::JSONB)
          );
        ELSIF v_owner_type = 'npc' THEN
          PERFORM add_item_to_inventory(
            p_npc_id := v_owner_id,
            p_item_name := v_item->>'item_name',
            p_quantity := COALESCE((v_item->>'quantity')::INT, 1),
            p_type := COALESCE(v_item->>'type', 'misc'),
            p_attributes := COALESCE(v_item->'attributes', '{}'::JSONB)
          );
        ELSE
          RAISE EXCEPTION 'INVALID_OWNER_TYPE: %', v_owner_type
            USING ERRCODE = 'P0001';
        END IF;

        v_applied_count := v_applied_count + 1;

      WHEN 'TRANSFER_ITEM' THEN
        v_item_id := (v_mutation->>'item_id')::UUID;
        v_from_id := (v_mutation->>'from_id')::UUID;
        v_to_id := (v_mutation->>'to_id')::UUID;
        v_from_type := v_mutation->>'from_type';
        v_to_type := v_mutation->>'to_type';
        v_transfer_qty := COALESCE((v_mutation->>'quantity')::INT, 1);

        -- Списываем у from (с блокировкой)
        SELECT item_name, quantity
        INTO v_item_name, v_item_quantity
        FROM inventory
        WHERE id = v_item_id
          AND (
            (v_from_type = 'player' AND player_id = v_from_id)
            OR (v_from_type = 'npc' AND npc_id = v_from_id)
          )
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'ITEM_NOT_AVAILABLE_FOR_TRANSFER: %', v_item_id
            USING ERRCODE = 'P0001';
        END IF;

        IF v_item_quantity < v_transfer_qty THEN
          RAISE EXCEPTION 'ITEM_NOT_AVAILABLE_FOR_TRANSFER: % (have %, need %)',
            v_item_id, v_item_quantity, v_transfer_qty
            USING ERRCODE = 'P0001';
        END IF;

        -- Списываем
        IF v_item_quantity = v_transfer_qty THEN
          DELETE FROM inventory WHERE id = v_item_id;
        ELSE
          UPDATE inventory SET quantity = quantity - v_transfer_qty WHERE id = v_item_id;
        END IF;

        -- Начисляем получателю
        IF v_to_type = 'player' THEN
          PERFORM add_item_to_inventory(
            p_player_id := v_to_id,
            p_item_name := v_item_name,
            p_quantity := v_transfer_qty,
            p_type := 'misc',
            p_attributes := jsonb_build_object('transferred', true)
          );
        ELSIF v_to_type = 'npc' THEN
          PERFORM add_item_to_inventory(
            p_npc_id := v_to_id,
            p_item_name := v_item_name,
            p_quantity := v_transfer_qty,
            p_type := 'misc',
            p_attributes := jsonb_build_object('transferred', true)
          );
        END IF;

        v_applied_count := v_applied_count + 1;

      WHEN 'SPAWN_STRUCTURE' THEN
        v_location_id := (v_mutation->>'location_id')::UUID;
        v_structure := v_mutation->'structure';

        INSERT INTO location_structures (location_id, name, type, hp, max_hp, tags)
        VALUES (
          v_location_id,
          COALESCE(v_structure->>'name', 'Структура'),
          COALESCE(v_structure->>'type', 'shelter'),
          COALESCE((v_structure->>'hp')::INT, 50),
          COALESCE((v_structure->>'max_hp')::INT, 50),
          COALESCE(
            ARRAY(SELECT jsonb_array_elements_text(v_structure->'tags')),
            ARRAY[]::TEXT[]
          )
        );

        v_applied_count := v_applied_count + 1;

      WHEN 'ADVANCE_TIME' THEN
        v_total_minutes := (v_mutation->>'minutes')::INT;
        v_total_minutes := v_total_minutes + (v_new_hour * 60) + v_new_minute;

        -- Минуты и часы (0..59, 0..23)
        v_new_minute := v_total_minutes % 60;
        v_new_hour := (v_total_minutes / 60) % 24;

        -- Дни, месяцы и годы (1-based: дни 1..30, месяцы 1..12)
        -- Переводим в 0-based, делим/модулируем, возвращаем в 1-based
        v_new_day := (v_session_day - 1) + (v_total_minutes / 1440);
        v_new_month := (v_session_month - 1) + (v_new_day / 30);
        v_new_day := (v_new_day % 30) + 1;

        v_new_year := v_session_year + (v_new_month / 12);
        v_new_month := (v_new_month % 12) + 1;

        v_applied_count := v_applied_count + 1;

      ELSE
        RAISE EXCEPTION 'UNKNOWN_MUTATION_TYPE: %', v_mutation_type
          USING ERRCODE = 'P0001';
    END CASE;
  END LOOP;

  -- ============================================
  -- Финальное обновление времени
  -- ============================================
  UPDATE sessions
  SET game_year = v_new_year,
      game_month = v_new_month,
      game_day = v_new_day,
      game_hour = v_new_hour,
      game_minute = v_new_minute,
      updated_at = NOW()
  WHERE id = p_session_id;

  v_current_time := jsonb_build_object(
    'year', v_new_year,
    'month', v_new_month,
    'day', v_new_day,
    'hour', v_new_hour,
    'minute', v_new_minute
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'applied_count', v_applied_count,
    'new_time', v_current_time
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Возвращаем ошибку (откат неявный)
    RETURN jsonb_build_object(
      'success', FALSE,
      'error_code', 'RACE_CONDITION_CONFLICT',
      'details', SQLERRM,
      'sql_state', SQLSTATE
    );
END;
$$;

COMMENT ON FUNCTION apply_turn_mutations IS
  'Атомарное применение мутаций хода. Возвращает {success, applied_count, new_time} или {success:false, error_code, details} при ошибке.';
```

## File: supabase/migrations/018_npc_relationships_and_memories.sql
```sql
-- ============================================
-- MultiRP AI — Migration 018: NPC Relationships & Tiered Memories
-- Шкала отношений NPC (-100..+100), 3 уровня воспоминаний и оценка яркости
-- ============================================

-- 1. Создание таблицы персональных отношений NPC с игроками
CREATE TABLE IF NOT EXISTS npc_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npc_id UUID NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0 CHECK (score BETWEEN -100 AND 100),
  tier TEXT NOT NULL DEFAULT 'neutral' CHECK (tier IN (
    'sworn_enemy', -- -100..-70: Заклятый враг
    'hostile',     -- -69..-35:  Враждебность
    'unfriendly',  -- -34..-10:  Неприязнь / Настороженность
    'neutral',     -- -9..+15:   Нейтралитет / Равнодушие
    'friendly',    -- +16..+50:  Симпатия / Знакомый
    'trusted',     -- +51..+80:  Доверие / Уважение
    'devoted'      -- +81..+100: Преданность / Любовь
  )),
  status_tags TEXT[] DEFAULT '{}',
  interactions_count INT NOT NULL DEFAULT 0,
  last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(npc_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_npc_relationships_npc ON npc_relationships(npc_id);
CREATE INDEX IF NOT EXISTS idx_npc_relationships_player ON npc_relationships(player_id);
CREATE INDEX IF NOT EXISTS idx_npc_relationships_score ON npc_relationships(score);

-- 2. Обновление таблицы npc_memories: добавление яркости и расширение типов
ALTER TABLE npc_memories
  ADD COLUMN IF NOT EXISTS vividness INT DEFAULT 5 CHECK (vividness BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS emotional_tone TEXT DEFAULT 'neutral',
  ADD COLUMN IF NOT EXISTS significance_reason TEXT DEFAULT '';

-- Расширяем check constraint для memory_type: impression, regular, vivid, belief (и medium для обратной совместимости)
ALTER TABLE npc_memories
  DROP CONSTRAINT IF EXISTS npc_memories_memory_type_check;

ALTER TABLE npc_memories
  ADD CONSTRAINT npc_memories_memory_type_check
  CHECK (memory_type IN ('impression', 'regular', 'vivid', 'belief', 'medium'));

CREATE INDEX IF NOT EXISTS idx_npc_memories_vividness ON npc_memories(vividness);

-- 3. RLS политики
ALTER TABLE npc_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Relationships: read for authenticated" ON npc_relationships;
DROP POLICY IF EXISTS "Relationships: system manage" ON npc_relationships;

CREATE POLICY "Relationships: read for authenticated" ON npc_relationships FOR SELECT TO authenticated USING (true);
CREATE POLICY "Relationships: system manage" ON npc_relationships FOR ALL USING (true);

-- 4. Realtime публикация
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'npc_relationships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE npc_relationships;
  END IF;
END $$;
```

## File: supabase/migrations/019_first_turn_starting_location.sql
```sql
-- ============================================
-- MultiRP AI — Migration 019: Starting Location & Calendar Date
-- Понятная игровая дата (1248 г.) и генерация стартовой локации на 1-м ходе
-- ============================================

-- 1. Обновление значений по умолчанию для даты и времени сессии
ALTER TABLE sessions
  ALTER COLUMN game_year SET DEFAULT 1248,
  ALTER COLUMN game_month SET DEFAULT 5,
  ALTER COLUMN game_day SET DEFAULT 14,
  ALTER COLUMN game_hour SET DEFAULT 10,
  ALTER COLUMN game_minute SET DEFAULT 0;

-- Обновляем старые сессии с датой-заглушкой (1.1.1)
UPDATE sessions
SET
  game_year = 1248,
  game_month = 5,
  game_day = 14,
  game_hour = 10,
  game_minute = 0
WHERE game_year <= 1 OR game_year IS NULL;

-- 2. Обновление таблицы locations: делаем state_id опциональным и добавляем world_id
ALTER TABLE locations
  ALTER COLUMN state_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS world_id UUID REFERENCES worlds(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS weather TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_world ON locations(world_id);

-- Расширяем check constraint для type в locations
ALTER TABLE locations
  DROP CONSTRAINT IF EXISTS locations_type_check;

ALTER TABLE locations
  ADD CONSTRAINT locations_type_check
  CHECK (type IN (
    'capital', 'city', 'village', 'ruins', 'landmark',
    'tavern', 'dungeon', 'wilderness', 'fortress',
    'settlement', 'camp', 'outpost', 'sanctuary'
  ));
```

## File: supabase/migrations/020_skills_leveling_and_npc_combat.sql
```sql
-- Migration 020: Player Skills, Leveling (No 20 Cap, Stat Points, MP), NPC Autonomous Activities & Combat Turn Queue

-- =====================================================
-- 1. PLAYER SKILLS TABLE (Только для игроков, 1..100)
-- =====================================================
CREATE TABLE IF NOT EXISTS player_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  skill_key TEXT NOT NULL, -- e.g. "swordsmanship", "gathering", "archery", "leatherworking", "stealth"
  name TEXT NOT NULL, -- "Владение мечом", "Собирательство"
  level INT NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 100),
  xp INT NOT NULL DEFAULT 0,
  xp_to_next_level INT NOT NULL DEFAULT 100,
  description TEXT DEFAULT '',
  effects JSONB DEFAULT '{}', -- e.g. {"damage_bonus_pct": 10, "find_chance_bonus_pct": 15, "time_reduction_pct": 20}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, skill_key)
);

CREATE INDEX IF NOT EXISTS idx_player_skills_player ON player_skills(player_id);
CREATE INDEX IF NOT EXISTS idx_player_skills_key ON player_skills(skill_key);

ALTER TABLE player_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Player skills: read for session players" ON player_skills
  FOR SELECT TO authenticated
  USING (player_id IN (SELECT id FROM players WHERE session_id IN (SELECT session_id FROM players WHERE user_id = auth.uid())));
CREATE POLICY "Player skills: system manage" ON player_skills
  FOR ALL USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE player_skills;

-- =====================================================
-- 2. EXPAND PLAYERS: XP, Stat Points (ОХ), MP
-- =====================================================
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stat_points INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mp INT DEFAULT 50,
  ADD COLUMN IF NOT EXISTS max_mp INT DEFAULT 50;

COMMENT ON COLUMN players.stat_points IS 'Свободные очки характеристик (ОХ), +2 за каждый уровень, качаются без ограничения в 20';
COMMENT ON COLUMN players.mp IS 'Текущие очки маны';
COMMENT ON COLUMN players.max_mp IS 'Максимальные очки маны';

-- =====================================================
-- 3. EXPAND NPCS: XP, Stat Points, Autonomous Activities
-- =====================================================
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stat_points INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_activity TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS activity_data JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_activity_time TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN npcs.current_activity IS 'Текущая долгосрочная деятельность (например: Охота в лесу)';
COMMENT ON COLUMN npcs.activity_data IS 'Данные деятельности: время старта, время окончания, локация, тип';

-- =====================================================
-- 4. EXPAND TURN_QUEUE FOR NPC COMBAT
-- =====================================================
ALTER TABLE turn_queue
  ALTER COLUMN player_id DROP NOT NULL;

ALTER TABLE turn_queue
  ADD COLUMN IF NOT EXISTS npc_id UUID REFERENCES npcs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'player' CHECK (entity_type IN ('player', 'npc')),
  ADD COLUMN IF NOT EXISTS initiative INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_number INT DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_turn_queue_npc ON turn_queue(npc_id);
CREATE INDEX IF NOT EXISTS idx_turn_queue_session_entity ON turn_queue(session_id, entity_type, status);

-- =====================================================
-- 5. RPC: ALLOCATE STAT POINTS (Без ограничения в 20!)
-- =====================================================
CREATE OR REPLACE FUNCTION allocate_stat_points(
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
  v_con_mod INT;
BEGIN
  IF p_points <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Количество очков должно быть больше нуля');
  END IF;

  p_stat_name := UPPER(TRIM(p_stat_name));
  IF p_stat_name NOT IN ('STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Недопустимая характеристика: ' || p_stat_name);
  END IF;

  SELECT * INTO v_player FROM players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Игрок не найден');
  END IF;

  IF COALESCE(v_player.stat_points, 0) < p_points THEN
    RETURN jsonb_build_object('success', false, 'error', 'Недостаточно очков характеристик');
  END IF;

  v_stats := COALESCE(v_player.stats, '{"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10}'::jsonb);
  v_cur_val := COALESCE((v_stats->>p_stat_name)::INT, 10);
  v_new_val := v_cur_val + p_points; -- БЕЗ ограничения в 20!

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

  UPDATE players
  SET
    stats = v_stats,
    stat_points = v_player.stat_points - p_points,
    max_hp = v_new_max_hp,
    hp = LEAST(v_player.hp + (v_new_max_hp - v_player.max_hp), v_new_max_hp),
    max_mp = v_new_max_mp,
    mp = LEAST(COALESCE(v_player.mp, 50) + (v_new_max_mp - COALESCE(v_player.max_mp, 50)), v_new_max_mp),
    updated_at = NOW()
  WHERE id = p_player_id;

  RETURN jsonb_build_object(
    'success', true,
    'stat_name', p_stat_name,
    'old_value', v_cur_val,
    'new_value', v_new_val,
    'remaining_stat_points', v_player.stat_points - p_points,
    'max_hp', v_new_max_hp,
    'max_mp', v_new_max_mp
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. RPC: ADD PLAYER SKILL XP (1..100 с авто-левелапом)
-- =====================================================
CREATE OR REPLACE FUNCTION add_player_skill_xp(
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

  SELECT * INTO v_skill FROM player_skills
  WHERE player_id = p_player_id AND skill_key = p_skill_key
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Создаём начальный навык на уровне 1
    v_cur_lvl := 1;
    v_cur_xp := 0;
    v_next_xp := 100;
  ELSE
    v_cur_lvl := v_skill.level;
    v_cur_xp := v_skill.xp;
    v_next_xp := v_skill.xp_to_next_level;
  END IF;

  -- На максимальном 100 уровне опыт не копится
  IF v_cur_lvl >= 100 THEN
    RETURN jsonb_build_object(
      'success', true,
      'skill_key', p_skill_key,
      'level', 100,
      'xp', v_next_xp,
      'leveled_up', false,
      'is_max', true
    );
  END IF;

  v_new_lvl := v_cur_lvl;
  v_new_xp := v_cur_xp + p_xp_amount;

  WHILE v_new_xp >= v_next_xp AND v_new_lvl < 100 LOOP
    v_new_xp := v_new_xp - v_next_xp;
    v_new_lvl := v_new_lvl + 1;
    v_next_xp := v_new_lvl * 100;
    v_leveled_up := true;
  END LOOP;

  -- Расчёт базовых числовых эффектов от уровня (1..100)
  v_effects := jsonb_build_object(
    'bonus_pct', v_new_lvl,
    'accuracy_bonus', FLOOR(v_new_lvl / 10)::INT,
    'time_reduction_pct', LEAST(50, FLOOR(v_new_lvl * 0.5)::INT)
  );

  INSERT INTO player_skills (player_id, skill_key, name, level, xp, xp_to_next_level, effects, updated_at)
  VALUES (p_player_id, p_skill_key, p_skill_name, v_new_lvl, v_new_xp, v_next_xp, v_effects, NOW())
  ON CONFLICT (player_id, skill_key) DO UPDATE
  SET
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
```

## File: supabase/migrations/021_open_world_and_npc_alive.sql
```sql
-- Migration 021: Open World (wild zones) + npcs.is_alive column
-- =====================================================
-- 1. Add is_alive to npcs (derived from hp > 0, but stored for quick access)
-- =====================================================
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS is_alive BOOLEAN NOT NULL DEFAULT true;

-- Sync is_alive with current hp values
UPDATE npcs SET is_alive = (hp > 0) WHERE hp IS NOT NULL;

COMMENT ON COLUMN npcs.is_alive IS 'Жив ли NPC. false означает что NPC мёртв (hp=0). Синхронизируется с hp через триггер.';

-- Auto-sync is_alive when hp changes
CREATE OR REPLACE FUNCTION sync_npc_is_alive()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.hp IS NOT NULL AND NEW.hp <= 0 THEN
    NEW.is_alive := false;
  ELSIF NEW.hp IS NOT NULL AND NEW.hp > 0 THEN
    NEW.is_alive := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_npc_sync_is_alive ON npcs;
CREATE TRIGGER trg_npc_sync_is_alive
  BEFORE UPDATE OF hp ON npcs
  FOR EACH ROW
  EXECUTE FUNCTION sync_npc_is_alive();

-- =====================================================
-- 2. Open World: wild zone context stored in sessions
-- =====================================================
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS current_wild_zone TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS current_wild_zone_description TEXT DEFAULT NULL;

COMMENT ON COLUMN sessions.current_wild_zone IS 'Название дикой зоны (лес, поле, пещера) — природные места вне именных локаций. null = игрок в именованной локации.';
COMMENT ON COLUMN sessions.current_wild_zone_description IS 'Краткое описание дикой зоны для нарратора';

-- =====================================================
-- 3. Inventory RLS: Ensure items are always readable
-- =====================================================
DROP POLICY IF EXISTS "Inventory: allow all read" ON inventory;
DROP POLICY IF EXISTS "Inventory: allow all manage" ON inventory;
DROP POLICY IF EXISTS "Inventory: read for owner" ON inventory;
DROP POLICY IF EXISTS "Inventory: manage for owner" ON inventory;

CREATE POLICY "Inventory: allow all read" ON inventory FOR SELECT USING (true);
CREATE POLICY "Inventory: allow all manage" ON inventory FOR ALL USING (true);
```

## File: supabase/migrations/022_dnd_item_taxonomy_and_level_fix.sql
```sql
-- Migration 022: Multi-genre item taxonomy, players.level column, and stat allocation permissions
-- =====================================================
-- 1. Add level to players table
-- =====================================================
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 100);

-- Sync any existing players
UPDATE players SET level = 1 WHERE level IS NULL;

COMMENT ON COLUMN players.level IS 'Уровень персонажа (1..100). Повышается при накоплении опыта level * 100.';

-- =====================================================
-- 2. Relax inventory.type check constraint
-- Open for Fantasy, Cyberpunk, Sci-Fi, Post-Apoc items
-- =====================================================
ALTER TABLE inventory
  DROP CONSTRAINT IF EXISTS inventory_type_check;

ALTER TABLE inventory
  ADD CONSTRAINT inventory_type_check
  CHECK (type IS NOT NULL AND length(type) >= 2 AND length(type) <= 50);

COMMENT ON COLUMN inventory.type IS 'Категория предмета (свободный текст: weapon, armor, cyberware, stim, software, electronics, herb, ore, food, misc и др.)';

-- =====================================================
-- 3. Ensure permissions on allocate_stat_points RPC
-- =====================================================
GRANT EXECUTE ON FUNCTION allocate_stat_points(UUID, TEXT, INT) TO authenticated, anon, service_role;
```

## File: supabase/migrations/023_fix_inventory_rpcs_and_npc_hostile.sql
```sql
-- Migration 023: Fix inventory RPCs overload ambiguity and add npcs.is_hostile
-- 1. Add npcs.is_hostile column
ALTER TABLE npcs ADD COLUMN IF NOT EXISTS is_hostile BOOLEAN NOT NULL DEFAULT false;

-- 2. Drop ambiguous legacy functions
DROP FUNCTION IF EXISTS add_item_to_inventory(UUID, TEXT, INT, TEXT, JSONB);
DROP FUNCTION IF EXISTS remove_item_from_inventory(UUID, TEXT, INT);

-- 3. Re-create single authoritative add_item_to_inventory
CREATE OR REPLACE FUNCTION add_item_to_inventory(
  p_player_id UUID DEFAULT NULL,
  p_item_name TEXT DEFAULT NULL,
  p_quantity INT DEFAULT 1,
  p_type TEXT DEFAULT 'misc',
  p_attributes JSONB DEFAULT '{}'::jsonb,
  p_npc_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  existing_item_id UUID;
  new_id UUID;
BEGIN
  SELECT id INTO existing_item_id
  FROM inventory
  WHERE (
    (p_player_id IS NOT NULL AND player_id = p_player_id)
    OR (p_npc_id IS NOT NULL AND npc_id = p_npc_id)
  )
  AND item_name = p_item_name
  AND type = p_type
  FOR UPDATE;

  IF existing_item_id IS NOT NULL THEN
    UPDATE inventory
    SET quantity = quantity + p_quantity,
        attributes = COALESCE(p_attributes, attributes)
    WHERE id = existing_item_id;
    RETURN existing_item_id;
  ELSE
    new_id := gen_random_uuid();
    INSERT INTO inventory (id, player_id, npc_id, item_name, quantity, type, attributes)
    VALUES (new_id, p_player_id, p_npc_id, p_item_name, p_quantity, p_type, COALESCE(p_attributes, '{}'::jsonb));
    RETURN new_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION add_item_to_inventory(UUID, TEXT, INT, TEXT, JSONB, UUID) TO authenticated, anon, service_role;

-- 4. Re-create single authoritative remove_item_from_inventory
CREATE OR REPLACE FUNCTION remove_item_from_inventory(
  p_player_id UUID DEFAULT NULL,
  p_item_name TEXT DEFAULT NULL,
  p_quantity INT DEFAULT 1,
  p_npc_id UUID DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  existing_item RECORD;
BEGIN
  SELECT id, quantity INTO existing_item
  FROM inventory
  WHERE (
    (p_player_id IS NOT NULL AND player_id = p_player_id)
    OR (p_npc_id IS NOT NULL AND npc_id = p_npc_id)
  )
  AND item_name = p_item_name
  FOR UPDATE;

  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF existing_item.quantity <= p_quantity THEN
    DELETE FROM inventory WHERE id = existing_item.id;
  ELSE
    UPDATE inventory SET quantity = quantity - p_quantity WHERE id = existing_item.id;
  END IF;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION remove_item_from_inventory(UUID, TEXT, INT, UUID) TO authenticated, anon, service_role;

-- 5. Update apply_turn_mutations with unambiguous RPC calls
CREATE OR REPLACE FUNCTION apply_turn_mutations(
  p_mutations JSONB,
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mutation JSONB;
  v_mutation_type TEXT;
  v_applied_count INT := 0;
  v_current_time JSONB;
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

  -- UPDATE_HP
  v_target_type TEXT;
  v_target_id UUID;
  v_delta INT;
  v_current_hp INT;
  v_max_hp INT;

  -- UPDATE_DURABILITY
  v_item_id UUID;
  v_durability_delta INT;
  v_set_broken BOOLEAN;
  v_current_durability INT;
  v_attrs JSONB;
  v_item_name TEXT;
  v_item_quantity INT;

  -- DELETE_ITEM
  v_delete_qty INT;

  -- INSERT_ITEM
  v_owner_id UUID;
  v_owner_type TEXT;
  v_item JSONB;

  -- TRANSFER_ITEM
  v_from_id UUID;
  v_to_id UUID;
  v_from_type TEXT;
  v_to_type TEXT;
  v_transfer_qty INT;

  -- SPAWN_STRUCTURE
  v_location_id UUID;
  v_structure JSONB;
BEGIN
  -- Загружаем текущее время сессии
  SELECT game_year, game_month, game_day, game_hour, game_minute
  INTO v_session_year, v_session_month, v_session_day, v_session_hour, v_session_minute
  FROM sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: %', p_session_id
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_mutation IN SELECT * FROM jsonb_array_elements(p_mutations)
  LOOP
    v_mutation_type := v_mutation->>'type';

    CASE v_mutation_type
      WHEN 'UPDATE_HP' THEN
        v_target_type := v_mutation->>'target_type';
        v_target_id := (v_mutation->>'target_id')::UUID;
        v_delta := (v_mutation->>'delta')::INT;

        IF v_target_type = 'player' THEN
          SELECT hp, max_hp INTO v_current_hp, v_max_hp
          FROM players WHERE id = v_target_id FOR UPDATE;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'TARGET_NOT_FOUND: player %', v_target_id USING ERRCODE = 'P0001';
          END IF;

          UPDATE players
          SET hp = GREATEST(0, LEAST(v_max_hp, v_current_hp + v_delta)), updated_at = NOW()
          WHERE id = v_target_id;

        ELSIF v_target_type = 'npc' THEN
          SELECT hp, max_hp INTO v_current_hp, v_max_hp
          FROM npcs WHERE id = v_target_id FOR UPDATE;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'TARGET_NOT_FOUND: npc %', v_target_id USING ERRCODE = 'P0001';
          END IF;

          UPDATE npcs
          SET hp = GREATEST(0, LEAST(v_max_hp, v_current_hp + v_delta)),
              is_alive = (GREATEST(0, LEAST(v_max_hp, v_current_hp + v_delta)) > 0),
              updated_at = NOW()
          WHERE id = v_target_id;
        ELSE
          RAISE EXCEPTION 'INVALID_TARGET_TYPE: %', v_target_type USING ERRCODE = 'P0001';
        END IF;

        v_applied_count := v_applied_count + 1;

      WHEN 'UPDATE_DURABILITY' THEN
        v_item_id := (v_mutation->>'item_id')::UUID;
        v_durability_delta := (v_mutation->>'delta')::INT;
        v_set_broken := COALESCE((v_mutation->>'set_broken')::BOOLEAN, false);

        SELECT attributes INTO v_attrs
        FROM inventory WHERE id = v_item_id FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'ITEM_NOT_FOUND: %', v_item_id USING ERRCODE = 'P0001';
        END IF;

        v_current_durability := COALESCE((v_attrs->>'durability')::INT, 100);
        v_current_durability := GREATEST(0, v_current_durability + v_durability_delta);
        v_attrs := jsonb_set(v_attrs, '{durability}', to_jsonb(v_current_durability));

        IF v_set_broken OR v_current_durability = 0 THEN
          v_attrs := jsonb_set(v_attrs, '{is_broken}', 'true'::JSONB);
        END IF;

        UPDATE inventory SET attributes = v_attrs WHERE id = v_item_id;
        v_applied_count := v_applied_count + 1;

      WHEN 'DELETE_ITEM' THEN
        v_item_id := (v_mutation->>'item_id')::UUID;
        v_delete_qty := COALESCE((v_mutation->>'quantity')::INT, 1);

        SELECT quantity INTO v_item_quantity
        FROM inventory WHERE id = v_item_id FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'ITEM_NOT_FOUND: %', v_item_id USING ERRCODE = 'P0001';
        END IF;

        IF v_item_quantity < v_delete_qty THEN
          RAISE EXCEPTION 'ITEM_NOT_AVAILABLE: % (have %, need %)', v_item_id, v_item_quantity, v_delete_qty USING ERRCODE = 'P0001';
        END IF;

        IF v_item_quantity = v_delete_qty THEN
          DELETE FROM inventory WHERE id = v_item_id;
        ELSE
          UPDATE inventory SET quantity = quantity - v_delete_qty WHERE id = v_item_id;
        END IF;

        v_applied_count := v_applied_count + 1;

      WHEN 'INSERT_ITEM' THEN
        v_owner_id := (v_mutation->>'owner_id')::UUID;
        v_owner_type := v_mutation->>'owner_type';
        v_item := v_mutation->'item';

        IF v_owner_type = 'player' THEN
          PERFORM add_item_to_inventory(
            p_player_id := v_owner_id,
            p_item_name := (v_item->>'item_name')::TEXT,
            p_quantity := COALESCE((v_item->>'quantity')::INT, 1),
            p_type := COALESCE((v_item->>'type')::TEXT, 'misc'),
            p_attributes := COALESCE(v_item->'attributes', '{}'::JSONB),
            p_npc_id := NULL::UUID
          );
        ELSIF v_owner_type = 'npc' THEN
          PERFORM add_item_to_inventory(
            p_player_id := NULL::UUID,
            p_item_name := (v_item->>'item_name')::TEXT,
            p_quantity := COALESCE((v_item->>'quantity')::INT, 1),
            p_type := COALESCE((v_item->>'type')::TEXT, 'misc'),
            p_attributes := COALESCE(v_item->'attributes', '{}'::JSONB),
            p_npc_id := v_owner_id
          );
        ELSE
          RAISE EXCEPTION 'INVALID_OWNER_TYPE: %', v_owner_type USING ERRCODE = 'P0001';
        END IF;

        v_applied_count := v_applied_count + 1;

      WHEN 'TRANSFER_ITEM' THEN
        v_item_id := (v_mutation->>'item_id')::UUID;
        v_from_id := (v_mutation->>'from_id')::UUID;
        v_to_id := (v_mutation->>'to_id')::UUID;
        v_from_type := v_mutation->>'from_type';
        v_to_type := v_mutation->>'to_type';
        v_transfer_qty := COALESCE((v_mutation->>'quantity')::INT, 1);

        SELECT item_name, quantity
        INTO v_item_name, v_item_quantity
        FROM inventory
        WHERE id = v_item_id
          AND (
            (v_from_type = 'player' AND player_id = v_from_id)
            OR (v_from_type = 'npc' AND npc_id = v_from_id)
          )
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'ITEM_NOT_AVAILABLE_FOR_TRANSFER: %', v_item_id USING ERRCODE = 'P0001';
        END IF;

        IF v_item_quantity < v_transfer_qty THEN
          RAISE EXCEPTION 'ITEM_NOT_AVAILABLE_FOR_TRANSFER: % (have %, need %)', v_item_id, v_item_quantity, v_transfer_qty USING ERRCODE = 'P0001';
        END IF;

        IF v_item_quantity = v_transfer_qty THEN
          DELETE FROM inventory WHERE id = v_item_id;
        ELSE
          UPDATE inventory SET quantity = quantity - v_transfer_qty WHERE id = v_item_id;
        END IF;

        IF v_to_type = 'player' THEN
          PERFORM add_item_to_inventory(
            p_player_id := v_to_id,
            p_item_name := v_item_name,
            p_quantity := v_transfer_qty,
            p_type := 'misc',
            p_attributes := jsonb_build_object('transferred', true),
            p_npc_id := NULL::UUID
          );
        ELSIF v_to_type = 'npc' THEN
          PERFORM add_item_to_inventory(
            p_player_id := NULL::UUID,
            p_item_name := v_item_name,
            p_quantity := v_transfer_qty,
            p_type := 'misc',
            p_attributes := jsonb_build_object('transferred', true),
            p_npc_id := v_to_id
          );
        END IF;

        v_applied_count := v_applied_count + 1;

      WHEN 'SPAWN_STRUCTURE' THEN
        v_location_id := (v_mutation->>'location_id')::UUID;
        v_structure := v_mutation->'structure';

        INSERT INTO location_structures (location_id, name, type, hp, max_hp, tags)
        VALUES (
          v_location_id,
          COALESCE(v_structure->>'name', 'Структура'),
          COALESCE(v_structure->>'type', 'shelter'),
          COALESCE((v_structure->>'hp')::INT, 50),
          COALESCE((v_structure->>'max_hp')::INT, 50),
          COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_structure->'tags')), ARRAY[]::TEXT[])
        );

        v_applied_count := v_applied_count + 1;

      WHEN 'ADVANCE_TIME' THEN
        v_total_minutes := (v_mutation->>'minutes')::INT;

        v_new_minute := v_session_minute + (v_total_minutes % 60);
        v_new_hour := v_session_hour + (v_total_minutes / 60);

        IF v_new_minute >= 60 THEN
          v_new_hour := v_new_hour + (v_new_minute / 60);
          v_new_minute := v_new_minute % 60;
        END IF;

        v_new_day := v_session_day;
        v_new_month := v_session_month;
        v_new_year := v_session_year;

        IF v_new_hour >= 24 THEN
          v_new_day := v_new_day + (v_new_hour / 24);
          v_new_hour := v_new_hour % 24;

          WHILE v_new_day > 30 LOOP
            v_new_day := v_new_day - 30;
            v_new_month := v_new_month + 1;
            IF v_new_month > 12 THEN
              v_new_month := 1;
              v_new_year := v_new_year + 1;
            END IF;
          END LOOP;
        END IF;

        v_session_minute := v_new_minute;
        v_session_hour := v_new_hour;
        v_session_day := v_new_day;
        v_session_month := v_new_month;
        v_session_year := v_new_year;

        UPDATE sessions
        SET game_year = v_new_year,
            game_month = v_new_month,
            game_day = v_new_day,
            game_hour = v_new_hour,
            game_minute = v_new_minute,
            updated_at = NOW()
        WHERE id = p_session_id;

        v_applied_count := v_applied_count + 1;

      ELSE
        RAISE EXCEPTION 'UNKNOWN_MUTATION_TYPE: %', v_mutation_type USING ERRCODE = 'P0001';
    END CASE;
  END LOOP;

  v_current_time := jsonb_build_object(
    'year', v_session_year,
    'month', v_session_month,
    'day', v_session_day,
    'hour', v_session_hour,
    'minute', v_session_minute
  );

  RETURN jsonb_build_object(
    'success', true,
    'applied_count', v_applied_count,
    'new_time', v_current_time
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'RACE_CONDITION_CONFLICT',
      'details', SQLERRM,
      'sql_state', SQLSTATE
    );
END;
$$;

GRANT EXECUTE ON FUNCTION apply_turn_mutations(JSONB, UUID) TO authenticated, anon, service_role;
```

## File: supabase/migrations/024_add_session_storyline.sql
```sql
-- 024_add_session_storyline.sql
-- Добавление структурированной сюжетной линии (storyline) в сессии

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS storyline JSONB DEFAULT NULL;

COMMENT ON COLUMN public.sessions.storyline IS 'Сюжетная линия: пролог (появление), массив арок (актов) с целями, ключевыми NPC/локациями и автоматическим отслеживанием прогресса';

-- Индекс для быстрого поиска по статусу сюжета
CREATE INDEX IF NOT EXISTS idx_sessions_storyline_status 
  ON public.sessions (((storyline->>'status')));
```

## File: supabase/migrations/025_safe_session_deletion.sql
```sql
-- 025_safe_session_deletion.sql
-- Безопасное удаление сессий и каскадная очистка всех связанных данных без ущерба для карточек персонажей и миров

-- 1. Добавляем RLS политику на удаление сессий для участников или владельца мира
DROP POLICY IF EXISTS "Sessions: delete for participants or world owner" ON public.sessions;

CREATE POLICY "Sessions: delete for participants or world owner" ON public.sessions
  FOR DELETE TO authenticated
  USING (
    id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid()))
    OR world_id IN (SELECT id FROM public.worlds WHERE owner_id = auth.uid())
  );

-- 2. Создаем RPC функцию для атомарного и безопасного удаления сессии
CREATE OR REPLACE FUNCTION public.delete_session(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_world_id UUID;
  v_caller_id UUID;
  v_is_participant BOOLEAN := FALSE;
  v_is_world_owner BOOLEAN := FALSE;
  v_players_count INT := 0;
  v_messages_count INT := 0;
BEGIN
  v_caller_id := auth.uid();

  -- Проверяем существование сессии
  SELECT world_id INTO v_world_id
  FROM public.sessions
  WHERE id = p_session_id;

  IF v_world_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SESSION_NOT_FOUND',
      'message', 'Сессия не найдена'
    );
  END IF;

  -- Проверка прав: вызывающий должен быть либо участником сессии, либо владельцем мира
  -- (если вызов идёт из service_role, v_caller_id может быть NULL)
  IF v_caller_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.players
      WHERE session_id = p_session_id AND user_id = v_caller_id
    ) INTO v_is_participant;

    SELECT EXISTS (
      SELECT 1 FROM public.worlds
      WHERE id = v_world_id AND owner_id = v_caller_id
    ) INTO v_is_world_owner;

    IF NOT v_is_participant AND NOT v_is_world_owner THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'PERMISSION_DENIED',
        'message', 'У вас нет прав на удаление этой сессии'
      );
    END IF;
  END IF;

  -- Считаем удаляемые связанные сущности для аудита
  SELECT COUNT(*) INTO v_players_count FROM public.players WHERE session_id = p_session_id;
  SELECT COUNT(*) INTO v_messages_count FROM public.messages WHERE session_id = p_session_id;

  -- Очищаем инвентарь NPC, привязанный к этой сессии через attributes
  DELETE FROM public.inventory
  WHERE attributes->>'harvested_at' = p_session_id::TEXT;

  -- Удаляем саму сессию (БД автоматически каскадирует удаление:
  -- players -> inventory, player_skills, player_injuries, npc_relationships, npc_memories,
  -- messages, turn_queue)
  DELETE FROM public.sessions WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_session_id', p_session_id,
    'cleaned_players', v_players_count,
    'cleaned_messages', v_messages_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_session(UUID) TO service_role;
```

## File: supabase/migrations/026_fog_of_war.sql
```sql
-- Migration 026: Fog of War — зоны игроков и карта локации
-- Позволяет системе тумана войны отслеживать положение игроков
-- и расстояния между зонами внутри одной локации.

-- 1. Добавляем текущую подзону игрока (более гранулярно чем current_location_id сессии)
--    Примеры: "tavern_hall", "tavern_kitchen", "market_north", "street_main"
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS current_zone TEXT DEFAULT NULL;

-- 2. Добавляем карту расстояний между подзонами в сессии (кэш, генерируется ИИ)
--    Формат: { "zone_a": { "zone_b": 2, "zone_c": 4 }, ... }
--    Число = Distance Tier: 0=same_room, 1=close, 2=nearby, 3=district, 4=far, 5=very_far
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS location_map JSONB DEFAULT '{}';

-- 3. Индекс для быстрого поиска игроков по зоне
CREATE INDEX IF NOT EXISTS idx_players_current_zone
  ON players (session_id, current_zone)
  WHERE current_zone IS NOT NULL;

-- Комментарии для документирования
COMMENT ON COLUMN players.current_zone IS
  'Подзона игрока внутри текущей локации (напр. "tavern_hall", "market_north"). NULL = в основной зоне локации.';

COMMENT ON COLUMN sessions.location_map IS
  'JSONB карта Distance Tier между подзонами локации. Генерируется ИИ при входе в новую локацию, кэшируется. Формат: {"zone_a": {"zone_b": 2}}';
```

## File: supabase/migrations/027_fog_terrain_type.sql
```sql
-- Migration 027: Fog of War — тип местности для акустики/видимости
-- terrain_type определяется ИИ при генерации/смене локации
-- и напрямую влияет на дальность fog-восприятия.

-- Возможные значения terrain_type:
--   'open'      — открытое пространство (поляна, поле, морской берег)
--                 Звук/видимость: +1 тир к аудио, +2 тира к визуальному
--   'forest'    — густой лес / джунгли
--                 Звук: -1 тир (деревья гасят), Видимость: -2 тира
--   'cave'      — пещера / подземелье (эхо!)
--                 Звук: +2 тира (эхо), Видимость: -3 тира (темнота)
--   'urban'     — городская среда (стены, переулки)
--                 Звук: 0, Видимость: -1 тир
--   'building'  — внутри здания / таверна / замок
--                 Звук: -1 тир, Видимость: -2 тира
--   'mountain'  — горный рельеф
--                 Звук: -1 тир, Видимость: +1 тир
--   null        — не определено (нейтральные модификаторы, как 'urban')

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS terrain_type TEXT DEFAULT NULL;

-- Добавляем terrain_type и в session (для wild zones, где нет locations-записи)
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS current_terrain_type TEXT DEFAULT NULL;

COMMENT ON COLUMN locations.terrain_type IS
  'Тип местности: open|forest|cave|urban|building|mountain. Влияет на дальность звука и видимости.';
COMMENT ON COLUMN sessions.current_terrain_type IS
  'Тип местности текущей зоны/wild_zone (для fog of war). Синхронизируется с locations.terrain_type или задаётся ИИ для wild zone.';
```

## File: supabase/migrations/028_npc_personality_and_dialogue.sql
```sql
-- ============================================
-- MultiRP AI — Migration 028: NPC Personality, Dynamic Mood & Daily Routine
-- Полноценная карточка психологии, настроения, секретов, слухов и суточного распорядка
-- ============================================

-- 1. Добавление колонок личности и поведения в npcs
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS temperament TEXT DEFAULT 'pragmatist',
  ADD COLUMN IF NOT EXISTS motivation TEXT DEFAULT 'Жить в безопасности и достатке',
  ADD COLUMN IF NOT EXISTS current_mood TEXT DEFAULT 'calm',
  ADD COLUMN IF NOT EXISTS secrets TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS rumors TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS speech_style TEXT DEFAULT 'Спокойный, вежливый',
  ADD COLUMN IF NOT EXISTS daily_routine TEXT DEFAULT 'Утром — дела, днём — служба, вечером — отдых, ночью — сон';

-- 2. Ограничение допустимых значений настроения (current_mood)
ALTER TABLE npcs
  DROP CONSTRAINT IF EXISTS npcs_current_mood_check;

ALTER TABLE npcs
  ADD CONSTRAINT npcs_current_mood_check
  CHECK (current_mood IN (
    'calm',        -- Спокоен, уравновешен
    'suspicious',  -- Насторожен, подозрителен
    'cheerful',    -- Весел, доброжелателен
    'irritated',   -- Раздражён, недоволен
    'frightened',  -- Напуган, осторожничает
    'impressed',   -- Впечатлён, уважает
    'mournful'     -- Подавлен, печален
  ));

-- 3. Индексы для быстрой выборки
CREATE INDEX IF NOT EXISTS idx_npcs_current_mood ON npcs(current_mood);
CREATE INDEX IF NOT EXISTS idx_npcs_temperament ON npcs(temperament);

-- 4. Комментарии к колонкам
COMMENT ON COLUMN npcs.temperament IS 'Психотип/архетип: pragmatist, cynic, sanguine, zealot, coward, philosopher, trickster, veteran';
COMMENT ON COLUMN npcs.motivation IS 'Главная текущая цель или глубинное желание персонажа';
COMMENT ON COLUMN npcs.current_mood IS 'Динамическое эмоциональное состояние: calm, suspicious, cheerful, irritated, frightened, impressed, mournful';
COMMENT ON COLUMN npcs.secrets IS 'Массив секретов персонажа с условиями раскрытия (порог отношений, проверки)';
COMMENT ON COLUMN npcs.rumors IS 'Массив локальных слухов и новостей, которыми NPC может поделиться';
COMMENT ON COLUMN npcs.speech_style IS 'Характеристики речи: манера, любимые обращения, длина предложений';
COMMENT ON COLUMN npcs.daily_routine IS 'Суточный распорядок занятий по фазам дня (morning, afternoon, evening, night)';
```

## File: supabase/migrations/029_npc_world_logs.sql
```sql
-- ============================================
-- MultiRP AI — Migration 029: NPC World Logs & Session Round Tracking
-- Логирование фоновой жизни мира и отслеживание кругов (раундов) ходов
-- ============================================

-- 1. Добавление счетчика кругов ходов (раундов) в sessions
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS current_round INT DEFAULT 1;

-- 2. Таблица логов автономных действий персонажей за кадром
CREATE TABLE IF NOT EXISTS npc_world_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round_number INT NOT NULL DEFAULT 1,
  npc_id UUID NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  npc_name TEXT NOT NULL,
  action_type TEXT NOT NULL, -- travel, hunt_combat, trade_craft, train, quest, rest
  description TEXT NOT NULL, -- художественное описание совершенного действия
  location_from_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  location_to_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  level_gained INT DEFAULT 0,
  item_gained TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_npc_world_logs_session_round ON npc_world_logs(session_id, round_number);
CREATE INDEX IF NOT EXISTS idx_npc_world_logs_npc ON npc_world_logs(npc_id);
CREATE INDEX IF NOT EXISTS idx_npc_world_logs_created_at ON npc_world_logs(created_at);

-- 3. RLS Политики
ALTER TABLE npc_world_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "World logs: read for authenticated" ON npc_world_logs;
DROP POLICY IF EXISTS "World logs: system manage" ON npc_world_logs;

CREATE POLICY "World logs: read for authenticated" ON npc_world_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "World logs: system manage" ON npc_world_logs FOR ALL USING (true);

-- 4. Realtime публикация
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'npc_world_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE npc_world_logs;
  END IF;
END $$;

COMMENT ON TABLE npc_world_logs IS 'Хроника автономной жизни мира: действия NPC за кадром после каждого круга ходов';
```

## File: supabase/migrations/030_locations_zones_and_map.sql
```sql
-- Migration 030: Add zones and location_map to locations table
-- Позволяет сохранять подзоны и матрицы расстояний локаций для Тумана Войны

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS zones JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS location_map JSONB DEFAULT '{}';

COMMENT ON COLUMN locations.zones IS 'Подзоны локации: массив объектов { id, name, type }';
COMMENT ON COLUMN locations.location_map IS 'Симметричная матрица расстояний между подзонами в метрах';
```

## File: supabase/migrations/031_safe_world_deletion.sql
```sql
-- ============================================
-- MultiRP AI — Migration 031: Safe & Complete World Deletion
-- Полная каскадная очистка всех данных мира (география, бестиарий, лор)
-- с сохранением данных активных/прошедших игровых сессий
-- ============================================

-- 1. Удаление существующих осиротевших записей, оставшихся от предыдущих удалений
DELETE FROM public.states WHERE world_id NOT IN (SELECT id FROM public.worlds);
DELETE FROM public.npcs WHERE world_id NOT IN (SELECT id FROM public.worlds);
DELETE FROM public.locations WHERE world_id IS NOT NULL AND world_id NOT IN (SELECT id FROM public.worlds);

-- 2. Добавление каскадных внешних ключей для states и npcs
ALTER TABLE public.states
  DROP CONSTRAINT IF EXISTS fk_states_world;

ALTER TABLE public.states
  ADD CONSTRAINT fk_states_world
  FOREIGN KEY (world_id) REFERENCES public.worlds(id) ON DELETE CASCADE;

ALTER TABLE public.npcs
  DROP CONSTRAINT IF EXISTS fk_npcs_world;

ALTER TABLE public.npcs
  ADD CONSTRAINT fk_npcs_world
  FOREIGN KEY (world_id) REFERENCES public.worlds(id) ON DELETE CASCADE;

-- 3. Обновление таблицы sessions:
--    a) Сохранение названия мира прямо в сессии (world_name)
--    b) Снятие жесткого ограничения NOT NULL и RESTRICT
--    c) Установка ON DELETE SET NULL для world_id
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS world_name TEXT DEFAULT NULL;

UPDATE public.sessions s
SET world_name = w.name
FROM public.worlds w
WHERE s.world_id = w.id AND (s.world_name IS NULL OR s.world_name = '');

ALTER TABLE public.sessions
  ALTER COLUMN world_id DROP NOT NULL;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_world_id_fkey;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_world_id_fkey
  FOREIGN KEY (world_id) REFERENCES public.worlds(id) ON DELETE SET NULL;

-- 4. Атомарная RPC-функция безопасного и полного удаления мира
CREATE OR REPLACE FUNCTION public.delete_world(p_world_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_world RECORD;
  v_sessions_count INT := 0;
  v_npcs_deleted INT := 0;
  v_locations_deleted INT := 0;
  v_states_deleted INT := 0;
  v_lore_deleted INT := 0;
BEGIN
  v_caller_id := auth.uid();

  -- Проверяем существование мира
  SELECT * INTO v_world
  FROM public.worlds
  WHERE id = p_world_id;

  IF v_world.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'WORLD_NOT_FOUND',
      'message', 'Мир не найден'
    );
  END IF;

  -- Проверка прав: вызывающий должен быть владельцем мира (либо системный вызов через service_role)
  IF v_caller_id IS NOT NULL AND v_world.owner_id != v_caller_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'PERMISSION_DENIED',
      'message', 'У вас нет прав на удаление этого мира'
    );
  END IF;

  -- 1. Сохраняем имя мира для всех сессий, созданных по этому миру
  UPDATE public.sessions
  SET world_name = COALESCE(world_name, v_world.name)
  WHERE world_id = p_world_id;

  SELECT count(*) INTO v_sessions_count
  FROM public.sessions
  WHERE world_id = p_world_id;

  -- 2. Отвязываем сессии от удаляемого мира (world_id = NULL)
  -- Это гарантирует сохранность игрового процесса, чата, игроков и прогресса сессий
  UPDATE public.sessions
  SET world_id = NULL
  WHERE world_id = p_world_id;

  -- 3. Каскадно удаляем все исходные данные этого мира
  -- (a) Бестиарий / NPC мира
  DELETE FROM public.npcs WHERE world_id = p_world_id;
  GET DIAGNOSTICS v_npcs_deleted = ROW_COUNT;

  -- (b) Локации мира (по world_id или через привязку к states)
  DELETE FROM public.locations
  WHERE world_id = p_world_id
     OR state_id IN (SELECT id FROM public.states WHERE world_id = p_world_id);
  GET DIAGNOSTICS v_locations_deleted = ROW_COUNT;

  -- (c) Государства мира
  DELETE FROM public.states WHERE world_id = p_world_id;
  GET DIAGNOSTICS v_states_deleted = ROW_COUNT;

  -- (d) Файлы лора
  DELETE FROM public.lore_files WHERE world_id = p_world_id;
  GET DIAGNOSTICS v_lore_deleted = ROW_COUNT;

  -- (e) Шаблоны существ
  DELETE FROM public.creature_templates WHERE world_id = p_world_id;

  -- (f) Сам мир
  DELETE FROM public.worlds WHERE id = p_world_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_world_id', p_world_id,
    'world_name', v_world.name,
    'preserved_sessions_count', v_sessions_count,
    'deleted_npcs', v_npcs_deleted,
    'deleted_locations', v_locations_deleted,
    'deleted_states', v_states_deleted,
    'deleted_lore', v_lore_deleted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_world(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.delete_world IS 'Атомарное удаление мира и всех его данных (география, бестиарий, лор) с сохранением игровых сессий';
```

## File: supabase/migrations/032_account_isolation_and_player_delete.sql
```sql
-- ============================================
-- MultiRP AI — Migration 032: Account Isolation & Player Deletion
-- Позволяет игрокам удалять своих персонажей из сессий (покидать сессию)
-- ============================================

-- 1. Политика удаления своего игрока из таблицы players
DROP POLICY IF EXISTS "Players: delete own" ON public.players;

CREATE POLICY "Players: delete own" ON public.players
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
```

## File: supabase/migrations/033_add_session_ai_key_mode.sql
```sql
-- ============================================
-- MultiRP AI — Migration 033: Add ai_key_mode & Character Stats Alignment
-- ============================================

-- 1. Добавляем колонку ai_key_mode в таблицу sessions
ALTER TABLE public.sessions 
  ADD COLUMN IF NOT EXISTS ai_key_mode TEXT DEFAULT 'host' CHECK (ai_key_mode IN ('host', 'individual'));

-- 2. Обеспечиваем наличие всех боевых характеристик и очков в players
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stat_points INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mp INT DEFAULT 50,
  ADD COLUMN IF NOT EXISTS max_mp INT DEFAULT 50,
  ADD COLUMN IF NOT EXISTS initiative INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS armor_class INT DEFAULT 10,
  ADD COLUMN IF NOT EXISTS saving_throws JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS race_ac_bonus INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hit_dice_current INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS hit_dice_max INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS hit_die_type TEXT DEFAULT 'd8',
  ADD COLUMN IF NOT EXISTS last_rested_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Обеспечиваем наличие колонок в карточках персонажей
ALTER TABLE public.character_cards
  ADD COLUMN IF NOT EXISTS initiative INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS armor_class INT DEFAULT 10,
  ADD COLUMN IF NOT EXISTS saving_throws JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS race_ac_bonus INT DEFAULT 0;

-- 4. Функция распределения очков характеристик (allocate_stat_points)
-- Поддерживает CON (HP), INT (MP), DEX (AC + Инициатива) без ограничения в 20!
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

  -- Обновление спасброска для прокачиваемой характеристики
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

-- 5. Принудительное обновление кеша схемы PostgREST
NOTIFY pgrst, 'reload schema';
```

## File: supabase/migrations/034_creator_can_delete_session_players.sql
```sql
-- ============================================
-- MultiRP AI — Migration 034: Session Creator Can Delete Players
-- Позволяет Создателю сессии (Хосту) удалять участников сессии
-- ============================================

-- 1. Обновляем RLS-политику удаления игроков:
-- Удалить запись игрока может либо сам игрок (user_id = auth.uid()),
-- либо создатель мира этой сессии (Хост)
DROP POLICY IF EXISTS "Players: delete own" ON public.players;
DROP POLICY IF EXISTS "Players: delete own or session host" ON public.players;

CREATE POLICY "Players: delete own or session host" ON public.players
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR session_id IN (
      SELECT s.id 
      FROM public.sessions s
      JOIN public.worlds w ON s.world_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );

-- 2. Безопасная RPC-функция для удаления участника сессии Создателем
CREATE OR REPLACE FUNCTION public.remove_session_player(
  p_session_id UUID,
  p_player_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_world_owner UUID;
  v_player_name TEXT;
  v_player_user_id UUID;
BEGIN
  -- Получаем создателя мира сессии
  SELECT w.owner_id INTO v_world_owner
  FROM public.sessions s
  JOIN public.worlds w ON s.world_id = w.id
  WHERE s.id = p_session_id;

  -- Получаем имя и user_id игрока
  SELECT name, user_id INTO v_player_name, v_player_user_id
  FROM public.players
  WHERE id = p_player_id AND session_id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Игрок не найден в этой сессии');
  END IF;

  -- Проверка прав: вызывающий должен быть владельцем мира сессии или самим игроком
  IF auth.uid() IS NOT NULL AND auth.uid() != v_world_owner AND auth.uid() != v_player_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'У вас нет прав на удаление этого участника');
  END IF;

  -- Очистка очереди ходов для этого игрока
  DELETE FROM public.turn_queue WHERE player_id = p_player_id;

  -- Очистка травм игрока
  DELETE FROM public.player_injuries WHERE player_id = p_player_id;

  -- Очистка навыков игрока
  DELETE FROM public.player_skills WHERE player_id = p_player_id;

  -- Очистка инвентаря игрока
  DELETE FROM public.inventory WHERE player_id = p_player_id;

  -- Удаление самого игрока
  DELETE FROM public.players WHERE id = p_player_id;

  -- Системное уведомление в чат сессии
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

-- 3. Обновление кеша PostgREST
NOTIFY pgrst, 'reload schema';
```

## File: supabase/migrations/035_party_system.sql
```sql
-- 035_party_system.sql: Поддержка системы отрядов (Party System) для совместного передвижения игроков

ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS party_groups JSONB DEFAULT '[]';

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS party_id UUID DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
```

## File: supabase/migrations/036_add_sessions_to_realtime.sql
```sql
-- 036_add_sessions_to_realtime.sql: Включение таблицы sessions в публикацию supabase_realtime
-- для мгновенного обновления игрового времени, календаря, локации и статуса отрядов у всех участников

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
```

## File: supabase/migrations/037_physical_space_and_time.sql
```sql
-- ============================================
-- MultiRP AI — Migration 037: Physical Space, Coordinates & Time Management
-- Физическое пространство, система координат, подзоны и механика занятости (Busy State)
-- ============================================

-- 1. Таблица sessions: единица измерения масштаба мира
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS scale_unit TEXT NOT NULL DEFAULT 'метры';

-- 2. Локации: координаты, форма и уровень опасности
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS pos_x FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pos_y FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bounds_shape TEXT NOT NULL DEFAULT 'circle' CHECK (bounds_shape IN ('circle', 'rect', 'polygon')),
  ADD COLUMN IF NOT EXISTS bounds_data JSONB NOT NULL DEFAULT '{"radius": 100}'::jsonb,
  ADD COLUMN IF NOT EXISTS danger_level TEXT NOT NULL DEFAULT 'normal' CHECK (danger_level IN ('safe', 'normal', 'danger', 'lethal'));

CREATE INDEX IF NOT EXISTS idx_locations_pos ON locations(pos_x, pos_y);

-- 3. Новая таблица subzones (физические подзоны внутри локаций)
CREATE TABLE IF NOT EXISTS subzones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  pos_x FLOAT NOT NULL DEFAULT 0,
  pos_y FLOAT NOT NULL DEFAULT 0,
  radius FLOAT NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subzones_location ON subzones(location_id);
CREATE INDEX IF NOT EXISTS idx_subzones_pos ON subzones(pos_x, pos_y);

-- RLS для subzones
ALTER TABLE subzones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Subzones: read for authenticated" ON subzones;
DROP POLICY IF EXISTS "Subzones: owner write" ON subzones;

CREATE POLICY "Subzones: read for authenticated" ON subzones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Subzones: owner write" ON subzones FOR ALL USING (
  location_id IN (
    SELECT l.id FROM locations l
    JOIN states s ON s.id = l.state_id
    JOIN worlds w ON w.id = s.world_id
    WHERE w.owner_id = auth.uid()
  )
);

-- Trigger updated_at для subzones
DROP TRIGGER IF EXISTS trigger_subzones_updated_at ON subzones;
CREATE TRIGGER trigger_subzones_updated_at BEFORE UPDATE ON subzones FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. Сущности с координатами и статусом занятости

-- 4.1 Таблица players
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS pos_x FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pos_y FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subzone_id UUID REFERENCES subzones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_busy BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS busy_activity TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS busy_remaining_minutes INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS busy_target_minutes INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS busy_reward_meta JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_players_pos ON players(pos_x, pos_y);
CREATE INDEX IF NOT EXISTS idx_players_subzone ON players(subzone_id);
CREATE INDEX IF NOT EXISTS idx_players_is_busy ON players(is_busy);

-- 4.2 Таблица npcs
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS pos_x FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pos_y FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subzone_id UUID REFERENCES subzones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS party_id UUID DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_npcs_pos ON npcs(pos_x, pos_y);
CREATE INDEX IF NOT EXISTS idx_npcs_subzone ON npcs(subzone_id);
CREATE INDEX IF NOT EXISTS idx_npcs_party ON npcs(party_id);

-- 5. RPC-функция для прерывания длительного действия игроком
CREATE OR REPLACE FUNCTION interrupt_busy_activity(p_player_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_player RECORD;
  v_time_spent INT;
  v_result JSONB;
BEGIN
  SELECT * INTO v_player FROM players WHERE id = p_player_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player not found');
  END IF;

  IF NOT v_player.is_busy THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player is not busy');
  END IF;

  v_time_spent := GREATEST(0, v_player.busy_target_minutes - v_player.busy_remaining_minutes);

  UPDATE players
  SET
    is_busy = false,
    busy_activity = NULL,
    busy_remaining_minutes = 0,
    busy_target_minutes = 0
  WHERE id = p_player_id;

  v_result := jsonb_build_object(
    'success', true,
    'player_id', p_player_id,
    'interrupted_activity', v_player.busy_activity,
    'time_spent_minutes', v_time_spent,
    'reward_meta', v_player.busy_reward_meta
  );

  RETURN v_result;
END;
$$;

-- 6. Расширение apply_turn_mutations для поддержки координат и занятости
CREATE OR REPLACE FUNCTION apply_turn_mutations(
  p_mutations JSONB,
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mutation JSONB;
  v_mutation_type TEXT;
  v_applied_count INT := 0;
  v_current_time JSONB;
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

  -- UPDATE_HP
  v_target_type TEXT;
  v_target_id UUID;
  v_delta INT;
  v_current_hp INT;
  v_max_hp INT;

  -- UPDATE_DURABILITY
  v_item_id UUID;
  v_durability_delta INT;
  v_set_broken BOOLEAN;
  v_current_durability INT;
  v_attrs JSONB;
  v_item_name TEXT;
  v_item_quantity INT;

  -- DELETE_ITEM
  v_delete_qty INT;

  -- INSERT_ITEM
  v_owner_id UUID;
  v_owner_type TEXT;
  v_item JSONB;

  -- TRANSFER_ITEM
  v_from_id UUID;
  v_to_id UUID;
  v_from_type TEXT;
  v_to_type TEXT;
  v_transfer_qty INT;

  -- SPAWN_STRUCTURE
  v_location_id UUID;
  v_structure JSONB;

  -- КООРДИНАТЫ И ЗАНЯТОСТЬ
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
  -- Загружаем текущее время сессии
  SELECT game_year, game_month, game_day, game_hour, game_minute
  INTO v_session_year, v_session_month, v_session_day, v_session_hour, v_session_minute
  FROM sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: %', p_session_id
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_mutation IN SELECT * FROM jsonb_array_elements(p_mutations)
  LOOP
    v_mutation_type := v_mutation->>'type';

    CASE v_mutation_type
      WHEN 'UPDATE_HP' THEN
        v_target_type := v_mutation->>'target_type';
        v_target_id := (v_mutation->>'id')::UUID;
        v_delta := (v_mutation->>'delta')::INT;

        IF v_target_type = 'player' THEN
          SELECT hp, max_hp INTO v_current_hp, v_max_hp
          FROM players WHERE id = v_target_id FOR UPDATE;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'TARGET_PLAYER_NOT_FOUND: %', v_target_id USING ERRCODE = 'P0001';
          END IF;

          UPDATE players
          SET hp = GREATEST(0, LEAST(v_max_hp, v_current_hp + v_delta))
          WHERE id = v_target_id;

        ELSIF v_target_type = 'npc' THEN
          SELECT hp, max_hp INTO v_current_hp, v_max_hp
          FROM npcs WHERE id = v_target_id FOR UPDATE;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'TARGET_NPC_NOT_FOUND: %', v_target_id USING ERRCODE = 'P0001';
          END IF;

          UPDATE npcs
          SET hp = GREATEST(0, LEAST(v_max_hp, v_current_hp + v_delta)),
              is_alive = (GREATEST(0, LEAST(v_max_hp, v_current_hp + v_delta)) > 0)
          WHERE id = v_target_id;
        END IF;

        v_applied_count := v_applied_count + 1;

      WHEN 'UPDATE_DURABILITY' THEN
        v_item_id := (v_mutation->>'item_id')::UUID;
        v_durability_delta := (v_mutation->>'delta')::INT;
        v_set_broken := COALESCE((v_mutation->>'set_broken')::BOOLEAN, false);

        SELECT durability, attributes INTO v_current_durability, v_attrs
        FROM inventory WHERE id = v_item_id FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'ITEM_NOT_FOUND: %', v_item_id USING ERRCODE = 'P0001';
        END IF;

        UPDATE inventory
        SET durability = CASE
              WHEN v_set_broken THEN 0
              ELSE GREATEST(0, COALESCE(v_current_durability, 100) + v_durability_delta)
            END,
            attributes = CASE
              WHEN v_set_broken THEN jsonb_set(COALESCE(v_attrs, '{}'::jsonb), '{broken}', 'true'::jsonb)
              ELSE v_attrs
            END
        WHERE id = v_item_id;

        v_applied_count := v_applied_count + 1;

      WHEN 'DELETE_ITEM' THEN
        v_item_id := (v_mutation->>'item_id')::UUID;
        v_delete_qty := (v_mutation->>'quantity')::INT;

        SELECT quantity INTO v_item_quantity
        FROM inventory WHERE id = v_item_id FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'ITEM_NOT_FOUND: %', v_item_id USING ERRCODE = 'P0001';
        END IF;

        IF v_item_quantity <= v_delete_qty THEN
          DELETE FROM inventory WHERE id = v_item_id;
        ELSE
          UPDATE inventory SET quantity = quantity - v_delete_qty WHERE id = v_item_id;
        END IF;

        v_applied_count := v_applied_count + 1;

      WHEN 'INSERT_ITEM' THEN
        v_owner_id := (v_mutation->>'owner_id')::UUID;
        v_owner_type := v_mutation->>'owner_type';
        v_item := v_mutation->'item';

        IF v_owner_type = 'player' THEN
          PERFORM add_item_to_inventory(
            p_player_id := v_owner_id,
            p_item_name := COALESCE(v_item->>'item_name', v_item->>'name', 'Предмет'),
            p_quantity := COALESCE((v_item->>'quantity')::INT, 1),
            p_type := COALESCE(v_item->>'type', 'misc'),
            p_attributes := COALESCE(v_item->'attributes', '{}'::jsonb),
            p_npc_id := NULL::UUID
          );
        ELSIF v_owner_type = 'npc' THEN
          PERFORM add_item_to_inventory(
            p_player_id := NULL::UUID,
            p_item_name := COALESCE(v_item->>'item_name', v_item->>'name', 'Предмет'),
            p_quantity := COALESCE((v_item->>'quantity')::INT, 1),
            p_type := COALESCE(v_item->>'type', 'misc'),
            p_attributes := COALESCE(v_item->'attributes', '{}'::jsonb),
            p_npc_id := v_owner_id
          );
        END IF;

        v_applied_count := v_applied_count + 1;

      WHEN 'TRANSFER_ITEM' THEN
        v_item_id := (v_mutation->>'item_id')::UUID;
        v_from_id := (v_mutation->>'from_id')::UUID;
        v_to_id := (v_mutation->>'to_id')::UUID;
        v_from_type := v_mutation->>'from_type';
        v_to_type := v_mutation->>'to_type';
        v_transfer_qty := (v_mutation->>'quantity')::INT;

        SELECT item_name, quantity INTO v_item_name, v_item_quantity
        FROM inventory WHERE id = v_item_id FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'ITEM_NOT_FOUND: %', v_item_id USING ERRCODE = 'P0001';
        END IF;

        IF v_item_quantity < v_transfer_qty THEN
          RAISE EXCEPTION 'INSUFFICIENT_QUANTITY: has %, needs %', v_item_quantity, v_transfer_qty
            USING ERRCODE = 'P0001';
        END IF;

        IF v_item_quantity = v_transfer_qty THEN
          DELETE FROM inventory WHERE id = v_item_id;
        ELSE
          UPDATE inventory SET quantity = quantity - v_transfer_qty WHERE id = v_item_id;
        END IF;

        IF v_to_type = 'player' THEN
          PERFORM add_item_to_inventory(
            p_player_id := v_to_id,
            p_item_name := v_item_name,
            p_quantity := v_transfer_qty,
            p_type := 'misc',
            p_attributes := jsonb_build_object('transferred', true),
            p_npc_id := NULL::UUID
          );
        ELSIF v_to_type = 'npc' THEN
          PERFORM add_item_to_inventory(
            p_player_id := NULL::UUID,
            p_item_name := v_item_name,
            p_quantity := v_transfer_qty,
            p_type := 'misc',
            p_attributes := jsonb_build_object('transferred', true),
            p_npc_id := v_to_id
          );
        END IF;

        v_applied_count := v_applied_count + 1;

      WHEN 'SPAWN_STRUCTURE' THEN
        v_location_id := (v_mutation->>'location_id')::UUID;
        v_structure := v_mutation->'structure';

        INSERT INTO location_structures (location_id, name, type, hp, max_hp, tags)
        VALUES (
          v_location_id,
          COALESCE(v_structure->>'name', 'Структура'),
          COALESCE(v_structure->>'type', 'shelter'),
          COALESCE((v_structure->>'hp')::INT, 50),
          COALESCE((v_structure->>'max_hp')::INT, 50),
          COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_structure->'tags')), ARRAY[]::TEXT[])
        );

        v_applied_count := v_applied_count + 1;

      WHEN 'ADVANCE_TIME' THEN
        v_total_minutes := (v_mutation->>'minutes')::INT;

        v_new_minute := v_session_minute + (v_total_minutes % 60);
        v_new_hour := v_session_hour + (v_total_minutes / 60);

        IF v_new_minute >= 60 THEN
          v_new_hour := v_new_hour + (v_new_minute / 60);
          v_new_minute := v_new_minute % 60;
        END IF;

        v_new_day := v_session_day;
        v_new_month := v_session_month;
        v_new_year := v_session_year;

        IF v_new_hour >= 24 THEN
          v_new_day := v_new_day + (v_new_hour / 24);
          v_new_hour := v_new_hour % 24;

          WHILE v_new_day > 30 LOOP
            v_new_day := v_new_day - 30;
            v_new_month := v_new_month + 1;
            IF v_new_month > 12 THEN
              v_new_month := 1;
              v_new_year := v_new_year + 1;
            END IF;
          END LOOP;
        END IF;

        v_session_minute := v_new_minute;
        v_session_hour := v_new_hour;
        v_session_day := v_new_day;
        v_session_month := v_new_month;
        v_session_year := v_new_year;

        UPDATE sessions
        SET game_year = v_new_year,
            game_month = v_new_month,
            game_day = v_new_day,
            game_hour = v_new_hour,
            game_minute = v_new_minute,
            updated_at = NOW()
        WHERE id = p_session_id;

        -- АВТОМАТИЧЕСКИЙ ТИК ВРЕМЕНИ ДЛЯ ЗАНЯТЫХ ИГРОКОВ В ЭТОЙ СЕССИИ
        UPDATE players
        SET busy_remaining_minutes = GREATEST(0, busy_remaining_minutes - v_total_minutes),
            is_busy = (GREATEST(0, busy_remaining_minutes - v_total_minutes) > 0)
        WHERE session_id = p_session_id AND is_busy = true;

        v_applied_count := v_applied_count + 1;

      WHEN 'SET_PLAYER_BUSY' THEN
        v_busy_player_id := (v_mutation->>'player_id')::UUID;
        v_busy_activity := v_mutation->>'activity';
        v_busy_minutes := (v_mutation->>'minutes')::INT;
        v_reward_preview := v_mutation->>'reward_preview';

        UPDATE players
        SET is_busy = true,
            busy_activity = v_busy_activity,
            busy_remaining_minutes = v_busy_minutes,
            busy_target_minutes = v_busy_minutes,
            busy_reward_meta = jsonb_build_object('preview', v_reward_preview)
        WHERE id = v_busy_player_id;

        v_applied_count := v_applied_count + 1;

      WHEN 'UPDATE_ENTITY_COORDS' THEN
        v_entity_type := v_mutation->>'entity_type';
        v_entity_id := (v_mutation->>'id')::UUID;
        v_pos_x := (v_mutation->>'pos_x')::FLOAT;
        v_pos_y := (v_mutation->>'pos_y')::FLOAT;

        IF v_entity_type = 'player' THEN
          UPDATE players SET pos_x = v_pos_x, pos_y = v_pos_y WHERE id = v_entity_id;
        ELSIF v_entity_type = 'npc' THEN
          UPDATE npcs SET pos_x = v_pos_x, pos_y = v_pos_y WHERE id = v_entity_id;
        END IF;

        v_applied_count := v_applied_count + 1;

      WHEN 'SET_PLAYER_SUBZONE' THEN
        v_busy_player_id := (v_mutation->>'player_id')::UUID;
        v_subzone_id := (v_mutation->>'subzone_id')::UUID;

        UPDATE players
        SET subzone_id = v_subzone_id
        WHERE id = v_busy_player_id;

        v_applied_count := v_applied_count + 1;

      ELSE
        RAISE EXCEPTION 'UNKNOWN_MUTATION_TYPE: %', v_mutation_type USING ERRCODE = 'P0001';
    END CASE;
  END LOOP;

  v_current_time := jsonb_build_object(
    'year', v_session_year,
    'month', v_session_month,
    'day', v_session_day,
    'hour', v_session_hour,
    'minute', v_session_minute
  );

  RETURN jsonb_build_object(
    'success', true,
    'applied_count', v_applied_count,
    'new_time', v_current_time
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'RACE_CONDITION_CONFLICT',
      'details', SQLERRM,
      'sql_state', SQLSTATE
    );
END;
$$;

GRANT EXECUTE ON FUNCTION apply_turn_mutations(JSONB, UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION interrupt_busy_activity(UUID) TO authenticated, anon, service_role;
```

## File: supabase/migrations/038_state_border_polygons.sql
```sql
-- Migration 038: Add border polygon data to states table
-- Adds border_shape and border_data columns to states,
-- matching the existing pattern used by locations.bounds_shape / locations.bounds_data

ALTER TABLE public.states
  ADD COLUMN IF NOT EXISTS border_shape TEXT NOT NULL DEFAULT 'auto' 
    CHECK (border_shape IN ('auto', 'circle', 'polygon')),
  ADD COLUMN IF NOT EXISTS border_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS map_color TEXT DEFAULT NULL;

COMMENT ON COLUMN public.states.border_shape IS 
  'auto = compute convex hull from city coords at runtime. polygon = use explicit vertices in border_data.points. circle = use border_data.radius.';

COMMENT ON COLUMN public.states.border_data IS
  'For polygon: { "points": [{x, y}, ...] }. For circle: { "radius": N, "center_x": X, "center_y": Y }. Empty for auto.';

COMMENT ON COLUMN public.states.map_color IS
  'Optional hex color for this state on the world map (e.g. "#f472b6"). If NULL, a color is derived from the state id hash.';
```
