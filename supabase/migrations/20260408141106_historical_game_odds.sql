CREATE TABLE IF NOT EXISTS historical_game_odds (
  id SERIAL PRIMARY KEY,
  sport TEXT NOT NULL,
  season INTEGER NOT NULL,
  game_date TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_final INTEGER,
  away_final INTEGER,
  period_scores JSONB DEFAULT '{}'::jsonb,
  home_close_ml INTEGER,
  away_close_ml INTEGER,
  home_open_spread DOUBLE PRECISION,
  home_close_spread DOUBLE PRECISION,
  open_over_under DOUBLE PRECISION,
  close_over_under DOUBLE PRECISION,
  source TEXT NOT NULL DEFAULT 'sbr-archive',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sport, season, game_date, home_team, away_team)
);
CREATE INDEX IF NOT EXISTS idx_hgo_sport_date ON historical_game_odds (sport, game_date);
CREATE INDEX IF NOT EXISTS idx_hgo_teams ON historical_game_odds (home_team, away_team);
