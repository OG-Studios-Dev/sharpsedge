-- Tournament AI Analysis storage
-- Stores structured analysis write-ups per tournament (PGA primarily)
CREATE TABLE IF NOT EXISTS tournament_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id text NOT NULL,
  league text NOT NULL DEFAULT 'PGA',
  tournament_name text NOT NULL DEFAULT '',
  analysis jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, league)
);

-- RLS: public read, service-role write
ALTER TABLE tournament_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read tournament_analysis" ON tournament_analysis FOR SELECT USING (true);
CREATE POLICY "Service write tournament_analysis" ON tournament_analysis FOR ALL USING (true) WITH CHECK (true);

-- Index for fast lookup by tournament
CREATE INDEX IF NOT EXISTS idx_tournament_analysis_tid ON tournament_analysis (tournament_id, league);
