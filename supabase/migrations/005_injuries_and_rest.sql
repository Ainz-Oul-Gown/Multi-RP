-- ============================================
-- MultiRP AI — Migration 005: Injuries and rest
-- Травмы, дебаффы и отслеживание отдыха
-- ============================================

CREATE TABLE IF NOT EXISTS player_injuries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  injury_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'minor',
  description TEXT DEFAULT '',
  stat_penalties JSONB DEFAULT '{}',
  hp_penalty INT DEFAULT 0,
  duration_hours INT DEFAULT 0,
  is_permanent BOOLEAN DEFAULT false,
  cured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_injuries_player ON player_injuries(player_id);
CREATE INDEX IF NOT EXISTS idx_player_injuries_session ON player_injuries(session_id);

ALTER TABLE player_injuries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Injuries: session players read" ON player_injuries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM players p
      WHERE p.id = player_injuries.player_id
        AND p.session_id = player_injuries.session_id
    )
  );

CREATE POLICY "Injuries: system insert" ON player_injuries
  FOR INSERT WITH CHECK (false);

CREATE POLICY "Injuries: system update" ON player_injuries
  FOR UPDATE USING (false);

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS active_injuries JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS rest_penalty_hours INT DEFAULT 0;
