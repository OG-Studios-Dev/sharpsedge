-- Goose learning model shadow foundation
-- Read-only historical examples + signal/backtest tables.
-- No production pick generator writes are changed by this migration.

drop view if exists public.goose_training_examples_v1;

create view public.goose_training_examples_v1 as
select
  agql.candidate_id as example_id,
  agql.candidate_id,
  agql.canonical_game_id,
  agql.event_id,
  coalesce(agql.sport, agql.league) as sport,
  agql.league,
  agql.season,
  agql.event_date,
  extract(year from agql.event_date)::int as event_year,
  agql.home_team,
  agql.away_team,
  agql.team_name,
  agql.opponent_name,
  agql.team_role,
  agql.market_type,
  agql.submarket_type,
  agql.market_family,
  agql.market_scope,
  agql.segment_key,
  agql.side,
  agql.line,
  agql.odds,
  agql.sportsbook,
  agql.is_favorite,
  agql.is_underdog,
  agql.is_home_team_bet,
  agql.is_away_team_bet,
  agql.is_home_favorite,
  agql.is_away_favorite,
  agql.is_home_underdog,
  agql.is_road_underdog,
  agql.is_road_favorite,
  agql.is_back_to_back,
  agql.is_prime_time,
  agql.broadcast_window,
  agql.is_divisional_game,
  agql.team_win_pct_pre_game,
  agql.opponent_win_pct_pre_game,
  coalesce(agql.team_above_500_pre_game, agql.team_win_pct_pre_game > 0.5) as team_above_500_pre_game,
  coalesce(agql.opponent_above_500_pre_game, agql.opponent_win_pct_pre_game > 0.5) as opponent_above_500_pre_game,
  agql.previous_game_shutout,
  agql.days_since_previous_game,
  agql.previous_team_role,
  agql.previous_moneyline_result,
  agql.previous_over_result,
  agql.previous_under_result,
  agql.result,
  agql.graded,
  agql.integrity_status,
  agql.profit_units,
  agql.profit_dollars_10,
  agql.roi_on_10_flat,
  case when agql.result = 'win' then 1 when agql.result = 'loss' then 0 else null end as win_label,
  case when agql.profit_units > 0 then 1 when agql.profit_units < 0 then 0 else null end as profitable_label,
  agql.trends_build_version,
  agql.refreshed_at
from public.ask_goose_query_layer_v1 agql
where agql.graded = true
  and agql.result in ('win', 'loss', 'push')
  and coalesce(agql.integrity_status, 'ok') = 'ok'
  and agql.odds is not null
  and agql.market_family in ('moneyline', 'spread', 'total')
  and (
    agql.market_family = 'moneyline'
    or agql.line is not null
  );

create table if not exists public.goose_learning_model_versions (
  id uuid primary key default gen_random_uuid(),
  model_version text not null unique,
  status text not null default 'shadow', -- shadow | candidate | promoted | archived
  train_start_date date,
  train_end_date date,
  test_start_date date,
  test_end_date date,
  sports text[] not null default '{}',
  markets text[] not null default '{}',
  min_sample integer not null default 50,
  config jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  promoted_at timestamptz
);

create table if not exists public.goose_signal_candidates_v1 (
  id uuid primary key default gen_random_uuid(),
  model_version text not null references public.goose_learning_model_versions(model_version) on delete cascade,
  signal_key text not null,
  sport text not null,
  league text,
  market_family text not null,
  side text,
  filter_json jsonb not null default '{}'::jsonb,
  train_sample integer not null default 0,
  train_wins integer not null default 0,
  train_losses integer not null default 0,
  train_pushes integer not null default 0,
  train_units numeric not null default 0,
  train_roi numeric not null default 0,
  test_sample integer not null default 0,
  test_wins integer not null default 0,
  test_losses integer not null default 0,
  test_pushes integer not null default 0,
  test_units numeric not null default 0,
  test_roi numeric not null default 0,
  edge_score numeric not null default 0,
  confidence_score numeric not null default 0,
  promotion_status text not null default 'shadow', -- shadow | eligible | rejected | promoted
  rejection_reason text,
  created_at timestamptz not null default now()
);

create unique index if not exists goose_signal_candidates_v1_unique_idx
  on public.goose_signal_candidates_v1 (model_version, signal_key, sport, market_family, coalesce(side, ''));

create index if not exists goose_signal_candidates_v1_model_score_idx
  on public.goose_signal_candidates_v1 (model_version, promotion_status, edge_score desc, confidence_score desc);

create table if not exists public.goose_backtest_runs_v1 (
  id uuid primary key default gen_random_uuid(),
  model_version text not null references public.goose_learning_model_versions(model_version) on delete cascade,
  run_type text not null default 'shadow_backtest',
  train_start_date date,
  train_end_date date,
  test_start_date date,
  test_end_date date,
  min_sample integer not null default 50,
  status text not null default 'completed',
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists goose_backtest_runs_v1_model_idx
  on public.goose_backtest_runs_v1 (model_version, created_at desc);

create or replace view public.goose_learning_readiness_v1 as
select
  sport,
  league,
  market_family,
  count(*) as examples,
  count(*) filter (where result = 'win') as wins,
  count(*) filter (where result = 'loss') as losses,
  count(*) filter (where result = 'push') as pushes,
  round((count(*) filter (where result = 'win')::numeric / nullif(count(*) filter (where result in ('win','loss')), 0)) * 100, 2) as win_rate,
  round(sum(coalesce(profit_units, 0)), 4) as units,
  round((sum(coalesce(profit_units, 0)) / nullif(count(*), 0)) * 100, 2) as roi_per_1u_risk,
  min(event_date) as first_event_date,
  max(event_date) as last_event_date,
  count(*) filter (where odds is null) as missing_odds,
  count(*) filter (where market_family <> 'moneyline' and line is null) as missing_required_line
from public.goose_training_examples_v1
group by sport, league, market_family;
