-- 024_add_session_storyline.sql
-- Добавление структурированной сюжетной линии (storyline) в сессии

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS storyline JSONB DEFAULT NULL;

COMMENT ON COLUMN public.sessions.storyline IS 'Сюжетная линия: пролог (появление), массив арок (актов) с целями, ключевыми NPC/локациями и автоматическим отслеживанием прогресса';

-- Индекс для быстрого поиска по статусу сюжета
CREATE INDEX IF NOT EXISTS idx_sessions_storyline_status 
  ON public.sessions (((storyline->>'status')));
