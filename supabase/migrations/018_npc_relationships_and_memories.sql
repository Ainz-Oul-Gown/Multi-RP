-- ============================================
-- MultiRP AI — Migration 018: NPC Relationships & Tiered Memories
-- Шкала отношений NPC (-100..+100), 3 уровня воспоминаний и оценка яркости
-- ============================================

-- 1. Создание таблицы персональных отношений NPC с игроками
CREATE TABLE IF NOT EXISTS npc_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npc_id UUID NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0 CHECK (score BETWEEN -100 AND 100),
  tier TEXT NOT NULL DEFAULT 'neutral' CHECK (tier IN (
    'sworn_enemy', -- -100..-70: Заклятый враг
    'hostile',     -- -69..-35:  Враждебность
    'unfriendly',  -- -34..-10:  Неприязнь / Настороженность
    'neutral',     -- -9..+15:   Нейтралитет / Равнодушие
    'friendly',    -- +16..+50:  Симпатия / Знакомый
    'trusted',     -- +51..+80:  Доверие / Уважение
    'devoted'      -- +81..+100: Преданность / Любовь
  )),
  status_tags TEXT[] DEFAULT '{}',
  interactions_count INT NOT NULL DEFAULT 0,
  last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(npc_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_npc_relationships_npc ON npc_relationships(npc_id);
CREATE INDEX IF NOT EXISTS idx_npc_relationships_player ON npc_relationships(player_id);
CREATE INDEX IF NOT EXISTS idx_npc_relationships_score ON npc_relationships(score);

-- 2. Обновление таблицы npc_memories: добавление яркости и расширение типов
ALTER TABLE npc_memories
  ADD COLUMN IF NOT EXISTS vividness INT DEFAULT 5 CHECK (vividness BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS emotional_tone TEXT DEFAULT 'neutral',
  ADD COLUMN IF NOT EXISTS significance_reason TEXT DEFAULT '';

-- Расширяем check constraint для memory_type: impression, regular, vivid, belief (и medium для обратной совместимости)
ALTER TABLE npc_memories
  DROP CONSTRAINT IF EXISTS npc_memories_memory_type_check;

ALTER TABLE npc_memories
  ADD CONSTRAINT npc_memories_memory_type_check
  CHECK (memory_type IN ('impression', 'regular', 'vivid', 'belief', 'medium'));

CREATE INDEX IF NOT EXISTS idx_npc_memories_vividness ON npc_memories(vividness);

-- 3. RLS политики
ALTER TABLE npc_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Relationships: read for authenticated" ON npc_relationships;
DROP POLICY IF EXISTS "Relationships: system manage" ON npc_relationships;

CREATE POLICY "Relationships: read for authenticated" ON npc_relationships FOR SELECT TO authenticated USING (true);
CREATE POLICY "Relationships: system manage" ON npc_relationships FOR ALL USING (true);

-- 4. Realtime публикация
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'npc_relationships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE npc_relationships;
  END IF;
END $$;
