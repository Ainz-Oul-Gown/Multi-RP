-- ============================================
-- MultiRP AI — Migration 034: Session Creator Can Delete Players
-- Позволяет Создателю сессии (Хосту) удалять участников сессии
-- ============================================

-- 1. Обновляем RLS-политику удаления игроков:
-- Удалить запись игрока может либо сам игрок (user_id = auth.uid()),
-- либо создатель мира этой сессии (Хост)
DROP POLICY IF EXISTS "Players: delete own" ON public.players;
DROP POLICY IF EXISTS "Players: delete own or session host" ON public.players;

CREATE POLICY "Players: delete own or session host" ON public.players
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR session_id IN (
      SELECT s.id 
      FROM public.sessions s
      JOIN public.worlds w ON s.world_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );

-- 2. Безопасная RPC-функция для удаления участника сессии Создателем
CREATE OR REPLACE FUNCTION public.remove_session_player(
  p_session_id UUID,
  p_player_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_world_owner UUID;
  v_player_name TEXT;
  v_player_user_id UUID;
BEGIN
  -- Получаем создателя мира сессии
  SELECT w.owner_id INTO v_world_owner
  FROM public.sessions s
  JOIN public.worlds w ON s.world_id = w.id
  WHERE s.id = p_session_id;

  -- Получаем имя и user_id игрока
  SELECT name, user_id INTO v_player_name, v_player_user_id
  FROM public.players
  WHERE id = p_player_id AND session_id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Игрок не найден в этой сессии');
  END IF;

  -- Проверка прав: вызывающий должен быть владельцем мира сессии или самим игроком
  IF auth.uid() IS NOT NULL AND auth.uid() != v_world_owner AND auth.uid() != v_player_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'У вас нет прав на удаление этого участника');
  END IF;

  -- Очистка очереди ходов для этого игрока
  DELETE FROM public.turn_queue WHERE player_id = p_player_id;

  -- Очистка травм игрока
  DELETE FROM public.player_injuries WHERE player_id = p_player_id;

  -- Очистка навыков игрока
  DELETE FROM public.player_skills WHERE player_id = p_player_id;

  -- Очистка инвентаря игрока
  DELETE FROM public.inventory WHERE player_id = p_player_id;

  -- Удаление самого игрока
  DELETE FROM public.players WHERE id = p_player_id;

  -- Системное уведомление в чат сессии
  INSERT INTO public.messages (
    session_id,
    sender_type,
    sender_name,
    content
  ) VALUES (
    p_session_id,
    'system',
    'Система',
    '🚪 Участник «' || COALESCE(v_player_name, 'Неизвестный') || '» был исключен из сессии Создателем.'
  );

  RETURN jsonb_build_object('success', true, 'player_id', p_player_id, 'player_name', v_player_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.remove_session_player(UUID, UUID) TO authenticated, anon, service_role;

-- 3. Обновление кеша PostgREST
NOTIFY pgrst, 'reload schema';
