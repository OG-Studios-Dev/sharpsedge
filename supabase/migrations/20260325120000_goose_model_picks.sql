-- ============================================================
-- Goose AI Picks Model Tables
-- STRICTLY separate from production pick_history / pick_slates
-- Admin/internal only — no public exposure
-- ============================================================

-- goose_model_picks: captures every pick the model generates or
-- captures from the live pipeline, with full reasoning + signals.
create table if not exists goose_model_picks (
  id                    uuid primary key default gen_random_uuid(),
  date                  date not null,
  sport                 text not null,  -- NHL | NBA | MLB | PGA | ...
  pick_label            text not null,
  pick_type             text not null default 'player',  -- player | team
  player_name           text,
  team                  text,
  opponent              text,
  game_id               text,
  reasoning             text,
  signals_present       text[] not null default '{}',
  odds                  double precision,
  book                  text,
  hit_rate_at_time      double precision,
  confidence            integer,
  result                text not null default 'pending',  -- pending | win | loss | push
  model_version         text not null default 'v1',
  source                text not null default 'captured', -- captured | generated
  pick_snapshot         jsonb,
  promoted_to_production boolean not null default false,
  promotion_notes       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists goose_model_picks_date_sport_idx
  on goose_model_picks (date desc, sport);

create index if not exists goose_model_picks_result_idx
  on goose_model_picks (result);

create index if not exists goose_model_picks_source_idx
  on goose_model_picks (source);

-- goose_signal_weights: running signal → outcome correlation tracker.
-- Updated every time a pick is graded. This is the core learning table.
create table if not exists goose_signal_weights (
  id           uuid primary key default gen_random_uuid(),
  signal       text not null,
  sport        text not null,  -- NHL | NBA | MLB | PGA | ALL
  appearances  integer not null default 0,
  wins         integer not null default 0,
  losses       integer not null default 0,
  pushes       integer not null default 0,
  win_rate     double precision not null default 0.0,
  last_updated timestamptz not null default now(),
  constraint goose_signal_weights_signal_sport_unique unique (signal, sport)
);

create index if not exists goose_signal_weights_sport_idx
  on goose_signal_weights (sport);

create index if not exists goose_signal_weights_win_rate_idx
  on goose_signal_weights (win_rate desc);

-- Seed the well-known signals with zero counts so they show up
-- immediately in the leaderboard even before any picks are graded.
insert into goose_signal_weights (signal, sport, appearances, wins, losses, pushes, win_rate)
select signal, sport, 0, 0, 0, 0, 0.0
from (
  values
    ('home_away_split'), ('rest_days'), ('travel_fatigue'), ('back_to_back'),
    ('streak_form'), ('goalie_news'), ('lineup_change'), ('odds_movement'),
    ('public_vs_sharp'), ('matchup_edge'), ('weather'), ('park_factor'),
    ('bullpen_strength'), ('injury_news')
) as s(signal)
cross join (values ('ALL'), ('NHL'), ('NBA'), ('MLB'), ('PGA')) as sp(sport)
on conflict (signal, sport) do nothing;
