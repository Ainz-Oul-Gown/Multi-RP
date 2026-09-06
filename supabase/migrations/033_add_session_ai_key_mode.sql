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
