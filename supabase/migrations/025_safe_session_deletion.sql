-- 025_safe_session_deletion.sql
-- Безопасное удаление сессий и каскадная очистка всех связанных данных без ущерба для карточек персонажей и миров

-- 1. Добавляем RLS политику на удаление сессий для участников или владельца мира
DROP POLICY IF EXISTS "Sessions: delete for participants or world owner" ON public.sessions;

CREATE POLICY "Sessions: delete for participants or world owner" ON public.sessions
  FOR DELETE TO authenticated
  USING (
    id IN (SELECT session_id FROM public.get_user_session_ids(auth.uid()))
    OR world_id IN (SELECT id FROM public.worlds WHERE owner_id = auth.uid())
  );

-- 2. Создаем RPC функцию для атомарного и безопасного удаления сессии
CREATE OR REPLACE FUNCTION public.delete_session(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_world_id UUID;
  v_caller_id UUID;
  v_is_participant BOOLEAN := FALSE;
  v_is_world_owner BOOLEAN := FALSE;
  v_players_count INT := 0;
  v_messages_count INT := 0;
BEGIN
  v_caller_id := auth.uid();

  -- Проверяем существование сессии
  SELECT world_id INTO v_world_id
  FROM public.sessions
  WHERE id = p_session_id;

  IF v_world_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SESSION_NOT_FOUND',
      'message', 'Сессия не найдена'
    );
  END IF;

  -- Проверка прав: вызывающий должен быть либо участником сессии, либо владельцем мира
  -- (если вызов идёт из service_role, v_caller_id может быть NULL)
  IF v_caller_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.players
      WHERE session_id = p_session_id AND user_id = v_caller_id
    ) INTO v_is_participant;

    SELECT EXISTS (
      SELECT 1 FROM public.worlds
      WHERE id = v_world_id AND owner_id = v_caller_id
    ) INTO v_is_world_owner;

    IF NOT v_is_participant AND NOT v_is_world_owner THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'PERMISSION_DENIED',
        'message', 'У вас нет прав на удаление этой сессии'
      );
    END IF;
  END IF;

  -- Считаем удаляемые связанные сущности для аудита
  SELECT COUNT(*) INTO v_players_count FROM public.players WHERE session_id = p_session_id;
  SELECT COUNT(*) INTO v_messages_count FROM public.messages WHERE session_id = p_session_id;

  -- Очищаем инвентарь NPC, привязанный к этой сессии через attributes
  DELETE FROM public.inventory
  WHERE attributes->>'harvested_at' = p_session_id::TEXT;

  -- Удаляем саму сессию (БД автоматически каскадирует удаление:
  -- players -> inventory, player_skills, player_injuries, npc_relationships, npc_memories,
  -- messages, turn_queue)
  DELETE FROM public.sessions WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_session_id', p_session_id,
    'cleaned_players', v_players_count,
    'cleaned_messages', v_messages_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_session(UUID) TO service_role;
