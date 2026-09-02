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
