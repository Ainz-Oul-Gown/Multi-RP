-- Migration 026: Fog of War — зоны игроков и карта локации
-- Позволяет системе тумана войны отслеживать положение игроков
-- и расстояния между зонами внутри одной локации.

-- 1. Добавляем текущую подзону игрока (более гранулярно чем current_location_id сессии)
--    Примеры: "tavern_hall", "tavern_kitchen", "market_north", "street_main"
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS current_zone TEXT DEFAULT NULL;

-- 2. Добавляем карту расстояний между подзонами в сессии (кэш, генерируется ИИ)
--    Формат: { "zone_a": { "zone_b": 2, "zone_c": 4 }, ... }
--    Число = Distance Tier: 0=same_room, 1=close, 2=nearby, 3=district, 4=far, 5=very_far
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS location_map JSONB DEFAULT '{}';

-- 3. Индекс для быстрого поиска игроков по зоне
CREATE INDEX IF NOT EXISTS idx_players_current_zone
  ON players (session_id, current_zone)
  WHERE current_zone IS NOT NULL;

-- Комментарии для документирования
COMMENT ON COLUMN players.current_zone IS
  'Подзона игрока внутри текущей локации (напр. "tavern_hall", "market_north"). NULL = в основной зоне локации.';

COMMENT ON COLUMN sessions.location_map IS
  'JSONB карта Distance Tier между подзонами локации. Генерируется ИИ при входе в новую локацию, кэшируется. Формат: {"zone_a": {"zone_b": 2}}';
