-- ============================================
-- MultiRP AI — Migration 019: Starting Location & Calendar Date
-- Понятная игровая дата (1248 г.) и генерация стартовой локации на 1-м ходе
-- ============================================

-- 1. Обновление значений по умолчанию для даты и времени сессии
ALTER TABLE sessions
  ALTER COLUMN game_year SET DEFAULT 1248,
  ALTER COLUMN game_month SET DEFAULT 5,
  ALTER COLUMN game_day SET DEFAULT 14,
  ALTER COLUMN game_hour SET DEFAULT 10,
  ALTER COLUMN game_minute SET DEFAULT 0;

-- Обновляем старые сессии с датой-заглушкой (1.1.1)
UPDATE sessions
SET
  game_year = 1248,
  game_month = 5,
  game_day = 14,
  game_hour = 10,
  game_minute = 0
WHERE game_year <= 1 OR game_year IS NULL;

-- 2. Обновление таблицы locations: делаем state_id опциональным и добавляем world_id
ALTER TABLE locations
  ALTER COLUMN state_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS world_id UUID REFERENCES worlds(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS weather TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_world ON locations(world_id);

-- Расширяем check constraint для type в locations
ALTER TABLE locations
  DROP CONSTRAINT IF EXISTS locations_type_check;

ALTER TABLE locations
  ADD CONSTRAINT locations_type_check
  CHECK (type IN (
    'capital', 'city', 'village', 'ruins', 'landmark',
    'tavern', 'dungeon', 'wilderness', 'fortress',
    'settlement', 'camp', 'outpost', 'sanctuary'
  ));
