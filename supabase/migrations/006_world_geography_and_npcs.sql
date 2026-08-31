-- ============================================
-- MultiRP AI — Migration 006: World Geography & NPC Matrix
-- География мира (государства, локации, маршруты) и Матрица NPC с векторной памятью (RAG)
-- ============================================

-- Задача 1: Активация pgvector
-- Критично для работы RAG-системы с векторными эмбеддингами
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- Задача 2 & 3: География и Матрица NPC
-- Создаём таблицы без циклических FK, затем добавляем FK через ALTER TABLE
-- ============================================

-- Государства (без ruler_id — добавим позже)
CREATE TABLE IF NOT EXISTS states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  ruler_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_states_world ON states(world_id);

-- Локации (города, деревни, руины, достопримечательности)
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id UUID NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'city' CHECK (type IN ('capital', 'city', 'village', 'ruins', 'landmark')),
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_locations_state ON locations(state_id);
CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(type);

-- Маршруты (дороги/связи между локациями)
CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_a_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  location_b_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  distance_km INT DEFAULT 0 CHECK (distance_km >= 0),
  travel_days INT DEFAULT 0 CHECK (travel_days >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Запрещаем дубли путей (A->B и B->A)
  CONSTRAINT routes_no_duplicates CHECK (location_a_id < location_b_id),
  CONSTRAINT routes_different_locations CHECK (location_a_id != location_b_id)
);

CREATE INDEX IF NOT EXISTS idx_routes_location_a ON routes(location_a_id);
CREATE INDEX IF NOT EXISTS idx_routes_location_b ON routes(location_b_id);

-- Матрица NPC (без location_id и state_id — добавим позже)
CREATE TABLE IF NOT EXISTS npcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  location_id UUID,
  state_id UUID,
  -- Лор
  role TEXT NOT NULL DEFAULT 'secondary' CHECK (role IN ('main', 'secondary')),
  name TEXT NOT NULL,
  race TEXT NOT NULL DEFAULT 'Человек',
  appearance TEXT DEFAULT '',
  background TEXT DEFAULT '',
  status_tags TEXT[] DEFAULT '{}',
  habits TEXT[] DEFAULT '{}',
  catchphrases TEXT[] DEFAULT '{}',
  -- Механика
  stats JSONB DEFAULT '{"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10}',
  hp INT DEFAULT 30,
  max_hp INT DEFAULT 30,
  -- Системные
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_npcs_world ON npcs(world_id);
CREATE INDEX IF NOT EXISTS idx_npcs_location ON npcs(location_id);
CREATE INDEX IF NOT EXISTS idx_npcs_state ON npcs(state_id);
CREATE INDEX IF NOT EXISTS idx_npcs_role ON npcs(role);
CREATE INDEX IF NOT EXISTS idx_npcs_status_tags ON npcs USING GIN(status_tags);

-- Теперь добавляем циклические FK через ALTER TABLE
ALTER TABLE states
  ADD CONSTRAINT fk_states_ruler FOREIGN KEY (ruler_id) REFERENCES npcs(id) ON DELETE SET NULL;

ALTER TABLE npcs
  ADD CONSTRAINT fk_npcs_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_npcs_state FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE SET NULL;

-- Изменение таблицы inventory: поддержка NPC
ALTER TABLE inventory
  ALTER COLUMN player_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS npc_id UUID REFERENCES npcs(id) ON DELETE CASCADE;

-- Добавляем ограничение: хотя бы одно из полей должно быть заполнено
ALTER TABLE inventory
  ADD CONSTRAINT inventory_owner_check CHECK (
    (player_id IS NOT NULL) OR (npc_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_inventory_npc ON inventory(npc_id);

-- ============================================
-- Задача 4: Каскадная векторная память NPC (RAG)
-- ============================================

CREATE TABLE IF NOT EXISTS npc_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npc_id UUID NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  memory_text TEXT NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'medium' CHECK (memory_type IN ('vivid', 'medium', 'belief')),
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW индекс для быстрого поиска по косинусному расстоянию
CREATE INDEX IF NOT EXISTS idx_npc_memories_embedding ON npc_memories
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_npc_memories_npc ON npc_memories(npc_id);
CREATE INDEX IF NOT EXISTS idx_npc_memories_player ON npc_memories(player_id);
CREATE INDEX IF NOT EXISTS idx_npc_memories_type ON npc_memories(memory_type);

-- ============================================
-- Задача 5: RPC-функция для поиска воспоминаний
-- ============================================

CREATE OR REPLACE FUNCTION match_npc_memories(
  query_embedding vector(1024),
  match_threshold float,
  match_count int,
  p_npc_id uuid,
  p_player_id uuid
)
RETURNS TABLE (
  id uuid,
  npc_id uuid,
  player_id uuid,
  memory_text text,
  memory_type text,
  embedding vector(1024),
  created_at timestamptz,
  similarity float
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    nm.id,
    nm.npc_id,
    nm.player_id,
    nm.memory_text,
    nm.memory_type,
    nm.embedding,
    nm.created_at,
    1 - (nm.embedding <=> query_embedding) AS similarity
  FROM npc_memories nm
  WHERE nm.npc_id = p_npc_id
    AND nm.player_id = p_player_id
    AND nm.embedding IS NOT NULL
    AND 1 - (nm.embedding <=> query_embedding) > match_threshold
  ORDER BY nm.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================
-- TRIGGERS для updated_at
-- ============================================

CREATE TRIGGER trigger_states_updated_at BEFORE UPDATE ON states FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_locations_updated_at BEFORE UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_npcs_updated_at BEFORE UPDATE ON npcs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "States: read for authenticated" ON states FOR SELECT TO authenticated USING (true);
CREATE POLICY "States: owner write" ON states FOR ALL USING (world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid()));

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Locations: read for authenticated" ON locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Locations: owner write" ON locations FOR ALL USING (state_id IN (SELECT id FROM states WHERE world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid())));

ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Routes: read for authenticated" ON routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Routes: owner write" ON routes FOR ALL USING (
  location_a_id IN (SELECT id FROM locations WHERE state_id IN (SELECT id FROM states WHERE world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid())))
);

ALTER TABLE npcs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "NPCs: read for authenticated" ON npcs FOR SELECT TO authenticated USING (true);
CREATE POLICY "NPCs: owner write" ON npcs FOR ALL USING (world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid()));

ALTER TABLE npc_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Memories: read for authenticated" ON npc_memories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Memories: system manage" ON npc_memories FOR ALL USING (true);

-- ============================================
-- TESTS:
-- ============================================
/*
-- Тест 1: Создание государства, столицы, второго города и маршрута

-- Создаем тестовый мир (если нет)
INSERT INTO worlds (owner_id, name, settings)
VALUES ('00000000-0000-0000-0000-000000000000', 'Тестовый мир', '{}')
RETURNING id AS test_world_id;

-- Создаем государство
INSERT INTO states (world_id, name, description)
VALUES (
  '00000000-0000-0000-0000-000000000000',  -- заменить на реальный world_id
  'Королевство Этерия',
  'Древнее королевство, известное своими магами и воинами.'
)
RETURNING id AS state_id;

-- Создаем столицу
INSERT INTO locations (state_id, name, type, description)
VALUES (
  '00000000-0000-0000-0000-000000000000',  -- заменить на реальный state_id
  'Этергард',
  'capital',
  'Великая столица с белокаменными башнями.'
)
RETURNING id AS capital_id;

-- Создаем второй город
INSERT INTO locations (state_id, name, type, description)
VALUES (
  '00000000-0000-0000-0000-000000000000',  -- заменить на реальный state_id
  'Риверхолл',
  'city',
  'Торговый город на реке.'
)
RETURNING id AS city_id;

-- Создаем маршрут между столицей и городом
INSERT INTO routes (location_a_id, location_b_id, distance_km, travel_days)
VALUES (
  '00000000-0000-0000-0000-000000000000',  -- заменить на capital_id
  '00000000-0000-0000-0000-000000000000',  -- заменить на city_id
  120,
  3
);

-- Тест 2: Создание NPC
INSERT INTO npcs (world_id, location_id, role, name, race, appearance, background, status_tags, habits, catchphrases, stats, hp, max_hp)
VALUES (
  '00000000-0000-0000-0000-000000000000',  -- world_id
  '00000000-0000-0000-0000-000000000000',  -- location_id (столица)
  'main',
  'Король Альдрик',
  'Человек',
  'Высокий мужчина с седой бородой и короной.',
  'Наследный король, правящий 30 лет.',
  '{"друг", "наставник"}',
  {'читать книги', 'гулять по саду'},
  {'Корона тяжела', 'Нард превыше всего'},
  '{"STR": 14, "DEX": 10, "CON": 12, "INT": 16, "WIS": 18, "CHA": 20}',
  85,
  85
)
RETURNING id AS npc_id;

-- Тест 3: Создание воспоминания с эмбеддингом
INSERT INTO npc_memories (npc_id, player_id, memory_text, memory_type, embedding)
VALUES (
  '00000000-0000-0000-0000-000000000000',  -- npc_id
  '00000000-0000-0000-0000-000000000000',  -- player_id
  'Игрок спас королю жизнь при покушении.',
  'vivid',
  ARRAY[0.1, 0.2, 0.3]::vector(1024)  -- В реальности 1024 значения, здесь 3 для примера
);

-- Тест 4: Вызов функции поиска воспоминаний
SELECT * FROM match_npc_memories(
  ARRAY[0.1, 0.2, 0.3]::vector(1024),  -- query_embedding (1024 значения)
  0.5,                                 -- match_threshold
  10,                                  -- match_count
  '00000000-0000-0000-0000-000000000000',  -- p_npc_id
  '00000000-0000-0000-0000-000000000000'   -- p_player_id
);
*/
