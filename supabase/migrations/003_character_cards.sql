-- ============================================
-- MultiRP AI — Migration 003: Character Cards
-- Шаблоны персонажей, привязанные к пользователю
-- ============================================

CREATE TABLE character_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  race TEXT NOT NULL DEFAULT 'Человек',
  class TEXT NOT NULL DEFAULT 'Воин',
  appearance TEXT DEFAULT '',
  personality JSONB DEFAULT '{"ideals": [], "bonds": [], "flaws": []}',
  bio TEXT DEFAULT '',
  power_level INT DEFAULT 10 CHECK (power_level >= 1 AND power_level <= 100),
  stats JSONB DEFAULT '{"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10}',
  hp INT DEFAULT 30,
  max_hp INT DEFAULT 30,
  money INT DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_character_cards_owner ON character_cards(owner_id);

ALTER TABLE character_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CharCards: owner read" ON character_cards
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "CharCards: owner insert" ON character_cards
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "CharCards: owner update" ON character_cards
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "CharCards: owner delete" ON character_cards
  FOR DELETE USING (auth.uid() = owner_id);

CREATE TRIGGER trigger_character_cards_updated_at
  BEFORE UPDATE ON character_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
