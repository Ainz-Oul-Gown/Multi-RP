-- Migration 011: Add combat stats to NPCs (level, AC, initiative, saving_throws)
-- NPCs now have the same combat characteristics as player characters

ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS level INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS armor_class INT DEFAULT 10,
  ADD COLUMN IF NOT EXISTS initiative INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saving_throws JSONB DEFAULT '{}';

-- Update role constraint to include 'tertiary'
ALTER TABLE npcs DROP CONSTRAINT IF EXISTS npcs_role_check;
ALTER TABLE npcs ADD CONSTRAINT npcs_role_check 
  CHECK (role IN ('main', 'secondary', 'tertiary'));
