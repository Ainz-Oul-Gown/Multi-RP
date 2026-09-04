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
