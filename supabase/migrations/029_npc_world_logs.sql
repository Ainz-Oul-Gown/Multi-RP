-- ============================================
-- MultiRP AI — Migration 029: NPC World Logs & Session Round Tracking
-- Логирование фоновой жизни мира и отслеживание кругов (раундов) ходов
-- ============================================

-- 1. Добавление счетчика кругов ходов (раундов) в sessions
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS current_round INT DEFAULT 1;

-- 2. Таблица логов автономных действий персонажей за кадром
CREATE TABLE IF NOT EXISTS npc_world_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round_number INT NOT NULL DEFAULT 1,
  npc_id UUID NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  npc_name TEXT NOT NULL,
  action_type TEXT NOT NULL, -- travel, hunt_combat, trade_craft, train, quest, rest
  description TEXT NOT NULL, -- художественное описание совершенного действия
  location_from_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  location_to_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  level_gained INT DEFAULT 0,
  item_gained TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_npc_world_logs_session_round ON npc_world_logs(session_id, round_number);
CREATE INDEX IF NOT EXISTS idx_npc_world_logs_npc ON npc_world_logs(npc_id);
CREATE INDEX IF NOT EXISTS idx_npc_world_logs_created_at ON npc_world_logs(created_at);

-- 3. RLS Политики
ALTER TABLE npc_world_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "World logs: read for authenticated" ON npc_world_logs;
DROP POLICY IF EXISTS "World logs: system manage" ON npc_world_logs;

CREATE POLICY "World logs: read for authenticated" ON npc_world_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "World logs: system manage" ON npc_world_logs FOR ALL USING (true);

-- 4. Realtime публикация
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'npc_world_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE npc_world_logs;
  END IF;
END $$;

COMMENT ON TABLE npc_world_logs IS 'Хроника автономной жизни мира: действия NPC за кадром после каждого круга ходов';
