-- ============================================
-- MultiRP AI — Migration 016: Game Time & GPS/Satellite Models
-- ============================================
-- Добавляет поля игрового времени в sessions
-- Добавляет поля gps_model и satellite_model в user_settings

-- ============================================
-- Игровое время сессии (год, месяц, день, час, минута)
-- ============================================
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS game_year INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS game_month INT DEFAULT 1 CHECK (game_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS game_day INT DEFAULT 1 CHECK (game_day BETWEEN 1 AND 30),
  ADD COLUMN IF NOT EXISTS game_hour INT DEFAULT 8 CHECK (game_hour BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS game_minute INT DEFAULT 0 CHECK (game_minute BETWEEN 0 AND 59);

-- Текущая локация сессии (для отслеживания перемещений)
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS current_location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_state_id UUID REFERENCES states(id) ON DELETE SET NULL;

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_sessions_location ON sessions(current_location_id);
CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(current_state_id);

-- ============================================
-- Модели для GPS и Сателлит нейронок
-- ============================================
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS gps_model TEXT DEFAULT 'xiaomi/mimo-v2.5',
  ADD COLUMN IF NOT EXISTS satellite_model TEXT DEFAULT 'xiaomi/mimo-v2.5';

-- Обновляем RPC функцию
CREATE OR REPLACE FUNCTION upsert_user_settings(
  p_user_id UUID,
  p_openrouter_key TEXT DEFAULT NULL,
  p_card_model TEXT DEFAULT NULL,
  p_dm_model TEXT DEFAULT NULL,
  p_gps_model TEXT DEFAULT NULL,
  p_satellite_model TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_settings (id, openrouter_key, card_model, dm_model, gps_model, satellite_model)
  VALUES (
    p_user_id,
    COALESCE(p_openrouter_key, ''),
    COALESCE(p_card_model, 'xiaomi/mimo-v2.5'),
    COALESCE(p_dm_model, 'xiaomi/mimo-v2.5'),
    COALESCE(p_gps_model, 'xiaomi/mimo-v2.5'),
    COALESCE(p_satellite_model, 'xiaomi/mimo-v2.5')
  )
  ON CONFLICT (id) DO UPDATE SET
    openrouter_key = CASE WHEN p_openrouter_key IS NOT NULL THEN p_openrouter_key ELSE user_settings.openrouter_key END,
    card_model = CASE WHEN p_card_model IS NOT NULL THEN p_card_model ELSE user_settings.card_model END,
    dm_model = CASE WHEN p_dm_model IS NOT NULL THEN p_dm_model ELSE user_settings.dm_model END,
    gps_model = CASE WHEN p_gps_model IS NOT NULL THEN p_gps_model ELSE user_settings.gps_model END,
    satellite_model = CASE WHEN p_satellite_model IS NOT NULL THEN p_satellite_model ELSE user_settings.satellite_model END,
    updated_at = NOW();
END;
$$;

-- Комментарии
COMMENT ON COLUMN sessions.game_year IS 'Игровой год сессии';
COMMENT ON COLUMN sessions.game_month IS 'Игровой месяц (1-12)';
COMMENT ON COLUMN sessions.game_day IS 'Игровой день (1-30)';
COMMENT ON COLUMN sessions.game_hour IS 'Игровой час (0-23)';
COMMENT ON COLUMN sessions.game_minute IS 'Игровая минута (0-59)';
COMMENT ON COLUMN sessions.current_location_id IS 'Текущая локация сессии';
COMMENT ON COLUMN sessions.current_state_id IS 'Текущее государство сессии';
COMMENT ON COLUMN user_settings.gps_model IS 'Модель для GPS нейронки (время и локация)';
COMMENT ON COLUMN user_settings.satellite_model IS 'Модель для Сателит нейронки (намерения игрока)';
