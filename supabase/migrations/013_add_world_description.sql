-- Migration 013: Add description to worlds table
-- The export format includes world.description, so we need to store it

ALTER TABLE worlds
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
