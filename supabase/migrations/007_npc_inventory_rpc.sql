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
