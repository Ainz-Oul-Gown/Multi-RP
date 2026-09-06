-- ============================================
-- MultiRP AI — Migration 032: Account Isolation & Player Deletion
-- Позволяет игрокам удалять своих персонажей из сессий (покидать сессию)
-- ============================================

-- 1. Политика удаления своего игрока из таблицы players
DROP POLICY IF EXISTS "Players: delete own" ON public.players;

CREATE POLICY "Players: delete own" ON public.players
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
