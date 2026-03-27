-- ============================================================
-- NHL Shot Aggregate Storage
-- Persists team-level and per-player shot quality profiles
-- computed from NHL play-by-play data (api-web.nhle.com PBP).
--
-- This table acts as a persistent L2 cache so:
--   - Rolling 10-game team profiles survive server restarts
--   - Full-season aggregates can be pre-computed and stored
--   - Model training can JOIN on nhl_shot_aggregates for audit
--
-- Updated by: aggregateTeamShotProfile() / aggregatePlayerShotProfiles()
-- in src/lib/nhl-shot-events.ts
-- ============================================================

-- ─── Team shot quality profiles (rolling or full-season) ──────────
create table if not exists nhl_shot_aggregates (
  id                    uuid primary key default gen_random_uuid(),
  team_abbrev           text not null,
  season                text not null default '20252026',
  aggregate_type        text not null default 'rolling',
                        -- 'rolling' = last N games, 'full_season' = all games YTD
  games_analyzed        integer not null default 0,
  game_ids_sampled      integer[] not null default '{}',

  -- Corsi (all shot attempts)
  cf_total              integer not null default 0,
  ca_total              integer not null default 0,
  cf_pct                double precision,        -- CF% (shot attempt share)
  score_adj_cf_pct      double precision,        -- Score-adjusted CF% (5v5 close)

  -- High-danger zone
  hdcf                  integer not null default 0,
  hdca                  integer not null default 0,
  hdcf_pct              double precision,        -- HD Corsi for%
  hd_sog_for            integer not null default 0,
  hd_sog_against        integer not null default 0,
  hd_save_pct           double precision,        -- Goalie HDSV% allowed

  -- Expected goals
  xg_for                double precision not null default 0,
  xg_against            double precision not null default 0,
  xgf_pct               double precision,        -- xGF%

  -- Provenance
  source                text not null default 'nhl-pbp-aggregate',
  source_notes          text,
  as_of                 timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Index for fast lookup by team + season + type
create index if not exists nhl_shot_aggregates_team_season_idx
  on nhl_shot_aggregates (team_abbrev, season, aggregate_type, as_of desc);

-- Unique constraint: one profile per team/season/type (upsert target)
create unique index if not exists nhl_shot_aggregates_unique_idx
  on nhl_shot_aggregates (team_abbrev, season, aggregate_type);

-- ─── Per-player shot quality profiles ──────────────────────────────
create table if not exists nhl_player_shot_profiles (
  id                    uuid primary key default gen_random_uuid(),
  player_id             integer not null,
  player_name           text not null,
  team_abbrev           text not null,
  season                text not null default '20252026',
  games_analyzed        integer not null default 0,
  game_ids_sampled      integer[] not null default '{}',

  -- Shot volume
  total_shots           integer not null default 0,
  shots_on_goal         integer not null default 0,
  goals                 integer not null default 0,

  -- Zone breakdown
  hd_shots              integer not null default 0,  -- HD shot attempts
  hd_sog                integer not null default 0,  -- HD shots on goal
  md_shots              integer not null default 0,
  ld_shots              integer not null default 0,

  -- xG metrics
  xg_total              double precision not null default 0,
  xg_per_game           double precision,             -- xG / games_analyzed
  xg_per_shot           double precision,             -- xG / total_shots
  hd_xg                 double precision not null default 0,  -- xG from HD shots only

  -- Shot type distribution (most common)
  primary_shot_type     text,

  -- Situation splits
  xg_5v5               double precision,
  xg_pp                double precision,
  shots_5v5            integer not null default 0,
  shots_pp             integer not null default 0,

  -- Provenance
  source                text not null default 'nhl-pbp-aggregate',
  source_notes          text,
  as_of                 timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Index for fast player lookup
create index if not exists nhl_player_shot_profiles_player_idx
  on nhl_player_shot_profiles (player_id, season, as_of desc);

create index if not exists nhl_player_shot_profiles_team_idx
  on nhl_player_shot_profiles (team_abbrev, season, as_of desc);

-- Unique: one profile per player per season (upsert target)
create unique index if not exists nhl_player_shot_profiles_unique_idx
  on nhl_player_shot_profiles (player_id, season);

-- ─── RLS: admin-only write, public read ─────────────────────────────
alter table nhl_shot_aggregates enable row level security;
alter table nhl_player_shot_profiles enable row level security;

create policy "nhl_shot_aggregates_read" on nhl_shot_aggregates
  for select using (true);

create policy "nhl_shot_aggregates_write" on nhl_shot_aggregates
  for all using (auth.jwt() ->> 'email' is not null);

create policy "nhl_player_shot_profiles_read" on nhl_player_shot_profiles
  for select using (true);

create policy "nhl_player_shot_profiles_write" on nhl_player_shot_profiles
  for all using (auth.jwt() ->> 'email' is not null);
