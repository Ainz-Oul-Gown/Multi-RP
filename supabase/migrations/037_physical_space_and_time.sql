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

