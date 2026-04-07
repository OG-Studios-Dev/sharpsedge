-- player_assets: stores team logos and player headshots
-- Keyed by (sport, player_id) for players; (sport, team_abbrev) for teams
-- Updated by seeding cron; UI reads from here first, falls back to CDN

CREATE TABLE IF NOT EXISTS public.player_assets (
  id           TEXT PRIMARY KEY,           -- "{sport}:{player_id}" or "{sport}:team:{abbrev}"
  sport        TEXT NOT NULL,              -- "NHL" | "NBA" | "MLB" | "NFL" | "PGA"
  asset_type   TEXT NOT NULL,              -- "player" | "team"
  player_id    TEXT,                       -- numeric string from league API
  team_abbrev  TEXT,                       -- e.g. "TBL", "LAL"
  name         TEXT,                       -- player full name or team name
  headshot_url TEXT,                       -- CDN-verified headshot URL (players only)
  logo_url     TEXT,                       -- CDN-verified logo URL (teams only)
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by sport + player_id
CREATE INDEX IF NOT EXISTS idx_player_assets_sport_player ON public.player_assets (sport, player_id);
CREATE INDEX IF NOT EXISTS idx_player_assets_sport_team   ON public.player_assets (sport, team_abbrev);

-- RLS: allow anonymous reads (same pattern as other tables)
ALTER TABLE public.player_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow anon select" ON public.player_assets FOR SELECT TO anon USING (true);
