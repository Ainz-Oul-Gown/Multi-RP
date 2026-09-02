-- ============================================
-- MultiRP AI — Migration 015: NPC Missing Fields
-- Добавляет поля, которые используются в коде/экспорте но отсутствуют в БД
-- ============================================

-- class: класс персонажа (воин/маг/жрец/etc), используется для определения hit_dice
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS class TEXT NOT NULL DEFAULT '';

-- tier: потенциал существа (1-5), определяет количество спецатак
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS tier INT DEFAULT 1 CHECK (tier BETWEEN 1 AND 5);

-- is_unique: уникальный экспр (получает имя), для неуникальных — диапазон уровней
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS is_unique BOOLEAN DEFAULT false;

-- level_min: минимальный уровень при спавне (для неуникальных существ)
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS level_min INT DEFAULT 1 CHECK (level_min >= 1 AND level_min <= 100);

-- level_max: максимальный уровень при спавне (для неуникальных существ)
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS level_max INT DEFAULT 1 CHECK (level_max >= 1 AND level_max <= 100);

-- Ограничение: level_max >= level_min
ALTER TABLE npcs
  DROP CONSTRAINT IF EXISTS npcs_valid_level_range,
  ADD CONSTRAINT npcs_valid_level_range CHECK (level_max >= level_min);

-- Индексы для быстрой фильтрации
CREATE INDEX IF NOT EXISTS idx_npcs_class ON npcs(class);
CREATE INDEX IF NOT EXISTS idx_npcs_tier ON npcs(tier);
CREATE INDEX IF NOT EXISTS idx_npcs_is_unique ON npcs(is_unique);
CREATE INDEX IF NOT EXISTS idx_npcs_level_min ON npcs(level_min);
CREATE INDEX IF NOT EXISTS idx_npcs_level_max ON npcs(level_max);

-- Комментарии
COMMENT ON COLUMN npcs.class IS 'Класс персонажа (воин/маг/жрец/etc), используется для определения hit_dice';
COMMENT ON COLUMN npcs.tier IS 'Потенциал существа (1-5), определяет количество спецатак';
COMMENT ON COLUMN npcs.is_unique IS 'Уникальный экземпляр (получает имя), для неуникальных — диапазон уровней';
COMMENT ON COLUMN npcs.level_min IS 'Минимальный уровень при спавне (для неуникальных существ)';
COMMENT ON COLUMN npcs.level_max IS 'Максимальный уровень при спавне (для неуникальных существ)';
