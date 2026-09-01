-- Migration 012: Creature templates & combat system overhaul
-- Tier = potential, Level = current power (1-100)
-- Separate table for beast/monster species templates
-- Stat sum: creatures 50-200 (player starts at 72)

-- =====================================================
-- CREATURE TEMPLATES: species definitions with level ranges
-- =====================================================
CREATE TABLE IF NOT EXISTS creature_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  
  -- Identity
  species_name TEXT NOT NULL, -- "Волк", "Дракон", "Гоблин" (not individual name)
  race TEXT NOT NULL DEFAULT 'Чудовище',
  category TEXT NOT NULL DEFAULT 'monster' CHECK (category IN ('beast', 'monster', 'boss')),
  
  -- Potential vs Current power
  tier INT NOT NULL CHECK (tier BETWEEN 1 AND 5), -- Max potential (determines special attacks count)
  level_min INT NOT NULL DEFAULT 1 CHECK (level_min >= 1 AND level_min <= 100),
  level_max INT NOT NULL DEFAULT 10 CHECK (level_max >= 1 AND level_max <= 100),
  
  -- Base stats (at level 1) — sum ~50 for weak creatures (player starts at 72)
  stats_base JSONB DEFAULT '{"STR": 8, "DEX": 8, "CON": 8, "INT": 6, "WIS": 6, "CHA": 4}',
  
  -- Combat
  special_attacks JSONB DEFAULT '[]', -- Array of special abilities (count = tier)
  base_attacks JSONB DEFAULT '[]', -- Array of basic attacks (2-3 per 10 levels)
  hp_multiplier DECIMAL DEFAULT 1.5, -- HP = CON * level * multiplier
  
  -- Behavior
  is_pack BOOLEAN DEFAULT false, -- Can appear in packs/groups
  is_unique BOOLEAN DEFAULT false, -- If true, only one instance exists (gets a name)
  
  -- Lore
  description TEXT DEFAULT '',
  habitat TEXT DEFAULT '', -- Preferred environment
  loot_tier INT DEFAULT 1 CHECK (loot_tier BETWEEN 1 AND 5),
  
  -- System
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_level_range CHECK (level_max >= level_min)
);

-- Index for fast lookup
CREATE INDEX idx_creature_templates_world ON creature_templates(world_id);
CREATE INDEX idx_creature_templates_category ON creature_templates(category);
CREATE INDEX idx_creature_templates_species ON creature_templates(species_name);

-- =====================================================
-- Update NPCs table: link to template, add attacks
-- =====================================================
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES creature_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS special_attacks JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS base_attacks JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS is_pack_instance BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pack_size INT DEFAULT 1;

-- Ensure max level is 100
ALTER TABLE npcs DROP CONSTRAINT IF EXISTS npcs_level_check;
ALTER TABLE npcs ADD CONSTRAINT npcs_level_check CHECK (level >= 1 AND level <= 100);

-- Create index for template lookups
CREATE INDEX idx_npcs_template ON npcs(template_id);

-- =====================================================
-- Function to calculate stats at a given level
-- Base sum at level 1: ~50 (creatures weaker than starting player at 72)
-- Each level: +2 to stat sum
-- Each tier: +10 to stat sum (bonus potential)
-- Max at level 100 + tier 5: 50 + 198 + 50 = ~200
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_creature_stats(
  base_stats JSONB,
  current_level INT,
  creature_tier INT
) RETURNS JSONB AS $$
DECLARE
  result JSONB := '{}';
  stat_key TEXT;
  base_val INT;
  scaled_val INT;
  final_sum INT := 0;
  target_sum INT;
  diff INT;
  adjust_stat TEXT;
  max_dist INT := 0;
  current_dist INT;
  stat_count INT := 6;
  per_stat_gain DECIMAL;
  tier_bonus_per_stat DECIMAL;
BEGIN
  -- Target sum: base 50 + (level-1)*2 + (tier-1)*10, capped at 200
  target_sum := 50 + ((current_level - 1) * 2) + ((creature_tier - 1) * 10);
  IF target_sum > 200 THEN target_sum := 200; END IF;
  
  -- Per-stat gain: each level adds ~0.33 to each stat (2 points / 6 stats)
  -- Each tier adds ~1.67 to each stat (10 points / 6 stats)
  per_stat_gain := (current_level - 1) * 0.33;
  tier_bonus_per_stat := (creature_tier - 1) * 1.67;
  
  -- First pass: scale each stat proportionally
  FOR stat_key IN SELECT unnest(ARRAY['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'])
  LOOP
    base_val := COALESCE((base_stats->>stat_key)::INT, 8);
    scaled_val := base_val + (per_stat_gain::INT) + (tier_bonus_per_stat::INT);
    -- Bonus for primary stats (STR for beasts, INT for monsters)
    IF stat_key = 'STR' AND creature_tier >= 3 THEN
      scaled_val := scaled_val + 2;
    ELSIF stat_key = 'INT' AND creature_tier >= 4 THEN
      scaled_val := scaled_val + 2;
    END IF;
    IF scaled_val > 30 THEN scaled_val := 30; END IF;
    IF scaled_val < 1 THEN scaled_val := 1; END IF;
    result := result || jsonb_build_object(stat_key, scaled_val);
    final_sum := final_sum + scaled_val;
  END LOOP;
  
  -- Adjust to match target sum
  diff := target_sum - final_sum;
  IF diff != 0 THEN
    -- Find stat furthest from base 8 to adjust
    adjust_stat := 'STR';
    max_dist := 0;
    FOR stat_key IN SELECT unnest(ARRAY['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'])
    LOOP
      current_dist := ABS((result->>stat_key)::INT - 8);
      IF current_dist > max_dist THEN
        max_dist := current_dist;
        adjust_stat := stat_key;
      END IF;
    END LOOP;
    result := result || jsonb_build_object(adjust_stat, GREATEST(1, LEAST(30, (result->>adjust_stat)::INT + diff)));
  END IF;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- Function to calculate HP from CON and level
-- Creatures: CON * level * multiplier (weaker than player CON*2+10)
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_creature_hp(
  con_stat INT,
  current_level INT,
  creature_tier INT,
  hp_mult DECIMAL DEFAULT 1.5
) RETURNS INT AS $$
DECLARE
  base_hp INT;
  level_hp INT;
  tier_bonus INT;
BEGIN
  -- Base HP at level 1: CON * multiplier (weaker than player)
  base_hp := GREATEST(1, (con_stat * hp_mult)::INT);
  -- Each level adds: CON * multiplier
  level_hp := GREATEST(1, ((con_stat * hp_mult)::INT * (current_level - 1)));
  -- Tier bonus: tier * 5
  tier_bonus := creature_tier * 5;
  
  RETURN base_hp + level_hp + tier_bonus;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- Function to calculate special attacks count by tier
-- =====================================================
CREATE OR REPLACE FUNCTION get_special_attacks_count(creature_tier INT)
RETURNS INT AS $$
BEGIN
  -- Tier 1: 1 special attack, Tier 5: 5 special attacks
  RETURN GREATEST(1, LEAST(5, creature_tier));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- Function to calculate base attacks count by level
-- =====================================================
CREATE OR REPLACE FUNCTION get_base_attacks_count(current_level INT)
RETURNS INT AS $$
BEGIN
  -- 2 base attacks at level 1-10, +1 per 10 levels, max 10
  RETURN GREATEST(2, LEAST(10, 2 + ((current_level - 1) / 10)));
END;
$$ LANGUAGE plpgsql IMMUTABLE;
