-- Migration 021: Open World (wild zones) + npcs.is_alive column
-- =====================================================
-- 1. Add is_alive to npcs (derived from hp > 0, but stored for quick access)
-- =====================================================
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS is_alive BOOLEAN NOT NULL DEFAULT true;

-- Sync is_alive with current hp values
UPDATE npcs SET is_alive = (hp > 0) WHERE hp IS NOT NULL;

COMMENT ON COLUMN npcs.is_alive IS 'Жив ли NPC. false означает что NPC мёртв (hp=0). Синхронизируется с hp через триггер.';

-- Auto-sync is_alive when hp changes
CREATE OR REPLACE FUNCTION sync_npc_is_alive()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.hp IS NOT NULL AND NEW.hp <= 0 THEN
    NEW.is_alive := false;
  ELSIF NEW.hp IS NOT NULL AND NEW.hp > 0 THEN
    NEW.is_alive := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_npc_sync_is_alive ON npcs;
CREATE TRIGGER trg_npc_sync_is_alive
  BEFORE UPDATE OF hp ON npcs
  FOR EACH ROW
  EXECUTE FUNCTION sync_npc_is_alive();

-- =====================================================
-- 2. Open World: wild zone context stored in sessions
-- =====================================================
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS current_wild_zone TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS current_wild_zone_description TEXT DEFAULT NULL;

COMMENT ON COLUMN sessions.current_wild_zone IS 'Название дикой зоны (лес, поле, пещера) — природные места вне именных локаций. null = игрок в именованной локации.';
COMMENT ON COLUMN sessions.current_wild_zone_description IS 'Краткое описание дикой зоны для нарратора';

-- =====================================================
-- 3. Inventory RLS: Ensure items are always readable
-- =====================================================
DROP POLICY IF EXISTS "Inventory: allow all read" ON inventory;
DROP POLICY IF EXISTS "Inventory: allow all manage" ON inventory;
DROP POLICY IF EXISTS "Inventory: read for owner" ON inventory;
DROP POLICY IF EXISTS "Inventory: manage for owner" ON inventory;

CREATE POLICY "Inventory: allow all read" ON inventory FOR SELECT USING (true);
CREATE POLICY "Inventory: allow all manage" ON inventory FOR ALL USING (true);

