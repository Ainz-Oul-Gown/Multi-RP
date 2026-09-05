-- ============================================
-- MultiRP AI — Migration 028: NPC Personality, Dynamic Mood & Daily Routine
-- Полноценная карточка психологии, настроения, секретов, слухов и суточного распорядка
-- ============================================

-- 1. Добавление колонок личности и поведения в npcs
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS temperament TEXT DEFAULT 'pragmatist',
  ADD COLUMN IF NOT EXISTS motivation TEXT DEFAULT 'Жить в безопасности и достатке',
  ADD COLUMN IF NOT EXISTS current_mood TEXT DEFAULT 'calm',
  ADD COLUMN IF NOT EXISTS secrets TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS rumors TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS speech_style TEXT DEFAULT 'Спокойный, вежливый',
  ADD COLUMN IF NOT EXISTS daily_routine TEXT DEFAULT 'Утром — дела, днём — служба, вечером — отдых, ночью — сон';

-- 2. Ограничение допустимых значений настроения (current_mood)
ALTER TABLE npcs
  DROP CONSTRAINT IF EXISTS npcs_current_mood_check;

ALTER TABLE npcs
  ADD CONSTRAINT npcs_current_mood_check
  CHECK (current_mood IN (
    'calm',        -- Спокоен, уравновешен
    'suspicious',  -- Насторожен, подозрителен
    'cheerful',    -- Весел, доброжелателен
    'irritated',   -- Раздражён, недоволен
    'frightened',  -- Напуган, осторожничает
    'impressed',   -- Впечатлён, уважает
    'mournful'     -- Подавлен, печален
  ));

-- 3. Индексы для быстрой выборки
CREATE INDEX IF NOT EXISTS idx_npcs_current_mood ON npcs(current_mood);
CREATE INDEX IF NOT EXISTS idx_npcs_temperament ON npcs(temperament);

-- 4. Комментарии к колонкам
COMMENT ON COLUMN npcs.temperament IS 'Психотип/архетип: pragmatist, cynic, sanguine, zealot, coward, philosopher, trickster, veteran';
COMMENT ON COLUMN npcs.motivation IS 'Главная текущая цель или глубинное желание персонажа';
COMMENT ON COLUMN npcs.current_mood IS 'Динамическое эмоциональное состояние: calm, suspicious, cheerful, irritated, frightened, impressed, mournful';
COMMENT ON COLUMN npcs.secrets IS 'Массив секретов персонажа с условиями раскрытия (порог отношений, проверки)';
COMMENT ON COLUMN npcs.rumors IS 'Массив локальных слухов и новостей, которыми NPC может поделиться';
COMMENT ON COLUMN npcs.speech_style IS 'Характеристики речи: манера, любимые обращения, длина предложений';
COMMENT ON COLUMN npcs.daily_routine IS 'Суточный распорядок занятий по фазам дня (morning, afternoon, evening, night)';
