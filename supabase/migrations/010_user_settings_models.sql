-- ============================================
-- MultiRP AI — Migration 010: User Settings Models
-- ============================================
-- Добавляет поля card_model и dm_model в таблицу user_settings

-- Добавляем колонки для моделей
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS card_model TEXT DEFAULT 'xiaomi/mimo-v2.5',
  ADD COLUMN IF NOT EXISTS dm_model TEXT DEFAULT 'xiaomi/mimo-v2.5';

-- Обновляем RPC функцию
CREATE OR REPLACE FUNCTION upsert_user_settings(
  p_user_id UUID,
  p_openrouter_key TEXT DEFAULT NULL,
  p_card_model TEXT DEFAULT NULL,
  p_dm_model TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_settings (id, openrouter_key, card_model, dm_model)
  VALUES (
    p_user_id,
    COALESCE(p_openrouter_key, ''),
    COALESCE(p_card_model, 'xiaomi/mimo-v2.5'),
    COALESCE(p_dm_model, 'xiaomi/mimo-v2.5')
  )
  ON CONFLICT (id) DO UPDATE SET
    openrouter_key = CASE WHEN p_openrouter_key IS NOT NULL THEN p_openrouter_key ELSE user_settings.openrouter_key END,
    card_model = CASE WHEN p_card_model IS NOT NULL THEN p_card_model ELSE user_settings.card_model END,
    dm_model = CASE WHEN p_dm_model IS NOT NULL THEN p_dm_model ELSE user_settings.dm_model END,
    updated_at = NOW();
END;
$$;

COMMENT ON COLUMN user_settings.card_model IS 'Модель для генерации карточек (бестиарий)';
COMMENT ON COLUMN user_settings.dm_model IS 'Модель для ДМа (рассказчик)';
