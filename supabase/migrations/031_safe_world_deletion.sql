-- ============================================
-- MultiRP AI — Migration 031: Safe & Complete World Deletion
-- Полная каскадная очистка всех данных мира (география, бестиарий, лор)
-- с сохранением данных активных/прошедших игровых сессий
-- ============================================

-- 1. Удаление существующих осиротевших записей, оставшихся от предыдущих удалений
DELETE FROM public.states WHERE world_id NOT IN (SELECT id FROM public.worlds);
DELETE FROM public.npcs WHERE world_id NOT IN (SELECT id FROM public.worlds);
DELETE FROM public.locations WHERE world_id IS NOT NULL AND world_id NOT IN (SELECT id FROM public.worlds);

-- 2. Добавление каскадных внешних ключей для states и npcs
ALTER TABLE public.states
  DROP CONSTRAINT IF EXISTS fk_states_world;

ALTER TABLE public.states
  ADD CONSTRAINT fk_states_world
  FOREIGN KEY (world_id) REFERENCES public.worlds(id) ON DELETE CASCADE;

ALTER TABLE public.npcs
  DROP CONSTRAINT IF EXISTS fk_npcs_world;

ALTER TABLE public.npcs
  ADD CONSTRAINT fk_npcs_world
  FOREIGN KEY (world_id) REFERENCES public.worlds(id) ON DELETE CASCADE;

-- 3. Обновление таблицы sessions:
--    a) Сохранение названия мира прямо в сессии (world_name)
--    b) Снятие жесткого ограничения NOT NULL и RESTRICT
--    c) Установка ON DELETE SET NULL для world_id
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS world_name TEXT DEFAULT NULL;

UPDATE public.sessions s
SET world_name = w.name
FROM public.worlds w
WHERE s.world_id = w.id AND (s.world_name IS NULL OR s.world_name = '');

ALTER TABLE public.sessions
  ALTER COLUMN world_id DROP NOT NULL;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_world_id_fkey;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_world_id_fkey
  FOREIGN KEY (world_id) REFERENCES public.worlds(id) ON DELETE SET NULL;

-- 4. Атомарная RPC-функция безопасного и полного удаления мира
CREATE OR REPLACE FUNCTION public.delete_world(p_world_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_world RECORD;
  v_sessions_count INT := 0;
  v_npcs_deleted INT := 0;
  v_locations_deleted INT := 0;
  v_states_deleted INT := 0;
  v_lore_deleted INT := 0;
BEGIN
  v_caller_id := auth.uid();

  -- Проверяем существование мира
  SELECT * INTO v_world
  FROM public.worlds
  WHERE id = p_world_id;

  IF v_world.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'WORLD_NOT_FOUND',
      'message', 'Мир не найден'
    );
  END IF;

  -- Проверка прав: вызывающий должен быть владельцем мира (либо системный вызов через service_role)
  IF v_caller_id IS NOT NULL AND v_world.owner_id != v_caller_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'PERMISSION_DENIED',
      'message', 'У вас нет прав на удаление этого мира'
    );
  END IF;

  -- 1. Сохраняем имя мира для всех сессий, созданных по этому миру
  UPDATE public.sessions
  SET world_name = COALESCE(world_name, v_world.name)
  WHERE world_id = p_world_id;

  SELECT count(*) INTO v_sessions_count
  FROM public.sessions
  WHERE world_id = p_world_id;

  -- 2. Отвязываем сессии от удаляемого мира (world_id = NULL)
  -- Это гарантирует сохранность игрового процесса, чата, игроков и прогресса сессий
  UPDATE public.sessions
  SET world_id = NULL
  WHERE world_id = p_world_id;

  -- 3. Каскадно удаляем все исходные данные этого мира
  -- (a) Бестиарий / NPC мира
  DELETE FROM public.npcs WHERE world_id = p_world_id;
  GET DIAGNOSTICS v_npcs_deleted = ROW_COUNT;

  -- (b) Локации мира (по world_id или через привязку к states)
  DELETE FROM public.locations
  WHERE world_id = p_world_id
     OR state_id IN (SELECT id FROM public.states WHERE world_id = p_world_id);
  GET DIAGNOSTICS v_locations_deleted = ROW_COUNT;

  -- (c) Государства мира
  DELETE FROM public.states WHERE world_id = p_world_id;
  GET DIAGNOSTICS v_states_deleted = ROW_COUNT;

  -- (d) Файлы лора
  DELETE FROM public.lore_files WHERE world_id = p_world_id;
  GET DIAGNOSTICS v_lore_deleted = ROW_COUNT;

  -- (e) Шаблоны существ
  DELETE FROM public.creature_templates WHERE world_id = p_world_id;

  -- (f) Сам мир
  DELETE FROM public.worlds WHERE id = p_world_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_world_id', p_world_id,
    'world_name', v_world.name,
    'preserved_sessions_count', v_sessions_count,
    'deleted_npcs', v_npcs_deleted,
    'deleted_locations', v_locations_deleted,
    'deleted_states', v_states_deleted,
    'deleted_lore', v_lore_deleted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_world(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.delete_world IS 'Атомарное удаление мира и всех его данных (география, бестиарий, лор) с сохранением игровых сессий';
