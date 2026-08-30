-- ============================================
-- MultiRP AI — Migration 004: Derived combat stats
-- Инициатива, AC, спасброски, отдых
-- ============================================

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS initiative INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS armor_class INT DEFAULT 10,
  ADD COLUMN IF NOT EXISTS saving_throws JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_rested_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE character_cards
  ADD COLUMN IF NOT EXISTS initiative INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS armor_class INT DEFAULT 10,
  ADD COLUMN IF NOT EXISTS saving_throws JSONB DEFAULT '{}';
