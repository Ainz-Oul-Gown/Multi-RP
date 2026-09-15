-- ============================================
-- MultiRP AI — Migration 039: Wild Zone & Subzone Danger Levels
-- ============================================

-- 1. Таблица sessions: уровень опасности текущей дикой зоны
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS current_wild_zone_danger_level TEXT DEFAULT 'normal'
  CHECK (current_wild_zone_danger_level IN ('safe', 'normal', 'danger', 'lethal'));

COMMENT ON COLUMN sessions.current_wild_zone_danger_level IS 'Уровень опасности дикой зоны, в которой находится игрок (safe, normal, danger, lethal)';

-- 2. Таблица subzones: опциональный уровень опасности подзоны
ALTER TABLE subzones
  ADD COLUMN IF NOT EXISTS danger_level TEXT DEFAULT NULL
  CHECK (danger_level IN ('safe', 'normal', 'danger', 'lethal'));

COMMENT ON COLUMN subzones.danger_level IS 'Уровень опасности подзоны. Если NULL — наследуется от родительской locations.danger_level';
