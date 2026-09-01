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
