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

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLES (order matters for FK references)
-- ============================================

CREATE TABLE worlds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lore_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  folder TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE RESTRICT,
  difficulty TEXT NOT NULL DEFAULT 'normal' CHECK (difficulty IN ('easy', 'normal', 'hard')),
  is_pvp_enabled BOOLEAN DEFAULT FALSE,
  current_plot_stage TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity INT DEFAULT 1 CHECK (quantity >= 0),
  type TEXT NOT NULL DEFAULT 'misc' CHECK (type IN ('weapon', 'armor', 'consumable', 'misc')),
  attributes JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('player', 'master', 'system')),
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name TEXT DEFAULT '',
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE turn_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    new_id := uuid_generate_v4();
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
