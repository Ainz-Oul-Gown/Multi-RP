-- ============================================
-- MultiRP AI — Migration 008: Fix RLS Infinite Recursion
-- ============================================
-- Исправляет ошибку "infinite recursion detected in policy for relation players"
-- Создаём SECURITY DEFINER функцию, которая обходит RLS при проверке участия в сессии

-- Функция для получения session_id пользователя (обходит RLS через SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_user_session_ids(p_user_id UUID)
RETURNS TABLE(session_id UUID)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT DISTINCT p.session_id FROM public.players p WHERE p.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Функция для получения player_id пользователя (обходит RLS через SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_user_player_ids(p_user_id UUID)
RETURNS TABLE(player_id UUID)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT p.id FROM public.players p WHERE p.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ИСПРАВЛЕНИЕ ПОЛИТИК players
-- ============================================

-- Удаляем рекурсивную политику
DROP POLICY IF EXISTS "Players: read in same session" ON players;

-- Создаём нерекурсивную политику через функцию
CREATE POLICY "Players: read in same session" ON players FOR SELECT TO authenticated
USING (
  session_id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid()))
  OR user_id = auth.uid()
);

-- ============================================
-- ИСПРАВЛЕНИЕ ПОЛИТИК sessions
-- ============================================

DROP POLICY IF EXISTS "Sessions: update for participants" ON sessions;

CREATE POLICY "Sessions: update for participants" ON sessions FOR UPDATE TO authenticated
USING (id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid())));

-- ============================================
-- ИСПРАВЛЕНИЕ ПОЛИТИК inventory
-- ============================================

DROP POLICY IF EXISTS "Inventory: read for owner" ON inventory;
DROP POLICY IF EXISTS "Inventory: manage for owner" ON inventory;

CREATE POLICY "Inventory: read for owner" ON inventory FOR SELECT TO authenticated
USING (player_id IN (SELECT player_id FROM public.get_user_player_ids(auth.uid())));

CREATE POLICY "Inventory: manage for owner" ON inventory FOR ALL TO authenticated
USING (player_id IN (SELECT player_id FROM public.get_user_player_ids(auth.uid())));

-- ============================================
-- ИСПРАВЛЕНИЕ ПОЛИТИК messages
-- ============================================

DROP POLICY IF EXISTS "Messages: read for session players" ON messages;
DROP POLICY IF EXISTS "Messages: players send" ON messages;

CREATE POLICY "Messages: read for session players" ON messages FOR SELECT TO authenticated
USING (session_id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid())));

CREATE POLICY "Messages: players send" ON messages FOR INSERT TO authenticated
WITH CHECK (
  sender_type = 'player'
  AND sender_id = auth.uid()
  AND session_id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid()))
);

-- ============================================
-- ИСПРАВЛЕНИЕ ПОЛИТИК turn_queue
-- ============================================

DROP POLICY IF EXISTS "Turn: read for session players" ON turn_queue;

CREATE POLICY "Turn: read for session players" ON turn_queue FOR SELECT TO authenticated
USING (session_id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid())));

-- ============================================
-- ДОБАВЛЕНИЕ ВОЗМОЖНОСТИ СОЗДАВАТЬ NPC ВРУЧНУЮ
-- ============================================

-- Функция для создания NPC со всеми полями (вызывается из Edge Function или напрямую)
CREATE OR REPLACE FUNCTION public.create_npc(
  p_world_id UUID,
  p_name TEXT,
  p_role TEXT DEFAULT 'secondary',
  p_race TEXT DEFAULT 'Человек',
  p_appearance TEXT DEFAULT '',
  p_background TEXT DEFAULT '',
  p_status_tags TEXT[] DEFAULT '{}',
  p_habits TEXT[] DEFAULT '{}',
  p_catchphrases TEXT[] DEFAULT '{}',
  p_stats JSONB DEFAULT '{"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10}',
  p_hp INT DEFAULT 30,
  p_max_hp INT DEFAULT 30,
  p_location_id UUID DEFAULT NULL,
  p_state_id UUID DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_npc_id UUID;
BEGIN
  -- Проверяем, что мир существует
  IF NOT EXISTS (SELECT 1 FROM worlds WHERE id = p_world_id) THEN
    RAISE EXCEPTION 'World with id % not found', p_world_id;
  END IF;

  new_npc_id := gen_random_uuid();

  INSERT INTO npcs (
    id, world_id, location_id, state_id, role, name, race,
    appearance, background, status_tags, habits, catchphrases,
    stats, hp, max_hp
  ) VALUES (
    new_npc_id, p_world_id, p_location_id, p_state_id, p_role, p_name, p_race,
    p_appearance, p_background, p_status_tags, p_habits, p_catchphrases,
    p_stats, p_hp, p_max_hp
  );

  RETURN new_npc_id;
END;
$$ LANGUAGE plpgsql;
