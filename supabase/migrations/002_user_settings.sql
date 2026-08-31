-- ============================================
-- MultiRP AI — Migration 002: User Settings
-- ============================================

-- Таблица настроек пользователя (API-ключи и пр.)
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  openrouter_key TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drop existing policies to allow re-running
DROP POLICY IF EXISTS "UserSettings: owner read" ON user_settings;
DROP POLICY IF EXISTS "UserSettings: owner insert" ON user_settings;
DROP POLICY IF EXISTS "UserSettings: owner update" ON user_settings;
DROP POLICY IF EXISTS "UserSettings: service read" ON user_settings;

-- RLS: пользователь видит и редактирует ТОЛЬКО свою строку
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "UserSettings: owner read"
  ON user_settings FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "UserSettings: owner insert"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "UserSettings: owner update"
  ON user_settings FOR UPDATE
  USING (auth.uid() = id);

-- Service role (Edge Functions) может читать настройки любого пользователя
CREATE POLICY "UserSettings: service read"
  ON user_settings FOR SELECT
  USING (true);

-- Drop existing trigger to allow re-running
DROP TRIGGER IF EXISTS trigger_user_settings_updated_at ON user_settings;

-- Триггер auto-updated_at
CREATE TRIGGER trigger_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RPC: Upsert настроек пользователя
-- ============================================
CREATE OR REPLACE FUNCTION upsert_user_settings(
  p_user_id UUID,
  p_openrouter_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_id UUID;
BEGIN
  SELECT id INTO existing_id FROM user_settings WHERE id = p_user_id;

  IF existing_id IS NOT NULL THEN
    UPDATE user_settings
    SET openrouter_key = COALESCE(p_openrouter_key, openrouter_key),
        updated_at = NOW()
    WHERE id = p_user_id;
    RETURN existing_id;
  ELSE
    INSERT INTO user_settings (id, openrouter_key)
    VALUES (p_user_id, p_openrouter_key);
    RETURN p_user_id;
  END IF;
END;
$$;

-- ============================================
-- RPC: Получить ключ пользователя (для Edge Functions)
-- ============================================
CREATE OR REPLACE FUNCTION get_user_openrouter_key(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_key TEXT;
BEGIN
  SELECT openrouter_key INTO v_key
  FROM user_settings
  WHERE id = p_user_id;

  RETURN v_key;
END;
$$;
