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

-- Обновляем существующих NPC: если имя содержит ключевые слова монстров/зверей, ставим соответствующую категорию
UPDATE npcs SET category = 'beast'
WHERE category = 'npc' AND (
  lower(name) LIKE '%волк%' OR lower(name) LIKE '%медведь%' OR lower(name) LIKE '%дракон%' OR
  lower(name) LIKE '%крыса%' OR lower(name) LIKE '%паук%' OR lower(name) LIKE '%змея%' OR
  lower(race) LIKE '%зверь%' OR lower(race) LIKE '%волк%' OR lower(race) LIKE '%дракон%'
);

UPDATE npcs SET category = 'monster'
WHERE category = 'npc' AND (
  lower(name) LIKE '%гоблин%' OR lower(name) LIKE '%орк%' OR lower(name) LIKE '%тролль%' OR
  lower(name) LIKE '%скелет%' OR lower(name) LIKE '%зомби%' OR lower(name) LIKE '%демон%' OR
  lower(race) LIKE '%гоблин%' OR lower(race) LIKE '%орк%' OR lower(race) LIKE '%тролль%' OR lower(race) LIKE '%демон%'
);

UPDATE npcs SET category = 'boss'
WHERE category = 'npc' AND (
  lower(name) LIKE '%король%' OR lower(name) LIKE '%лорд%' OR lower(name) LIKE '%архидемон%' OR
  lower(name) LIKE '%древний%' OR lower(name) LIKE '%титан%' OR lower(name) LIKE '%владыка%'
);

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
