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
