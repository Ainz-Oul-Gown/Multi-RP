-- Migration 022: Multi-genre item taxonomy, players.level column, and stat allocation permissions
-- =====================================================
-- 1. Add level to players table
-- =====================================================
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 100);

-- Sync any existing players
UPDATE players SET level = 1 WHERE level IS NULL;

COMMENT ON COLUMN players.level IS 'Уровень персонажа (1..100). Повышается при накоплении опыта level * 100.';

-- =====================================================
-- 2. Relax inventory.type check constraint
-- Open for Fantasy, Cyberpunk, Sci-Fi, Post-Apoc items
-- =====================================================
ALTER TABLE inventory
  DROP CONSTRAINT IF EXISTS inventory_type_check;

ALTER TABLE inventory
  ADD CONSTRAINT inventory_type_check
  CHECK (type IS NOT NULL AND length(type) >= 2 AND length(type) <= 50);

COMMENT ON COLUMN inventory.type IS 'Категория предмета (свободный текст: weapon, armor, cyberware, stim, software, electronics, herb, ore, food, misc и др.)';

-- =====================================================
-- 3. Ensure permissions on allocate_stat_points RPC
-- =====================================================
GRANT EXECUTE ON FUNCTION allocate_stat_points(UUID, TEXT, INT) TO authenticated, anon, service_role;
