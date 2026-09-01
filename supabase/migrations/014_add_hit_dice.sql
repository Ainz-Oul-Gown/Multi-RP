-- Migration 014: Add hit_dice to NPCs (D&D hit dice system)
-- Level 1: max die + CON mod + 10
-- Each next: average die + CON mod

ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS hit_dice INT DEFAULT 8 CHECK (hit_dice IN (6, 8, 10, 12));
