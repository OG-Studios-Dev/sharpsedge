alter table public.market_snapshot_events
  add column if not exists canonical_game_id text,
  add column if not exists source_event_id_kind text,
  add column if not exists real_game_id text,
  add column if not exists snapshot_game_id text,
  add column if not exists coverage_flags jsonb not null default '{}'::jsonb,
  add column if not exists source_limited boolean not null default false;

alter table public.market_snapshot_prices
  add column if not exists canonical_game_id text,
  add column if not exists canonical_market_key text,
  add column if not exists participant_key text,
  add column if not exists capture_window_phase text,
  add column if not exists is_opening_candidate boolean not null default false,
  add column if not exists is_closing_candidate boolean not null default false,
  add column if not exists coverage_flags jsonb not null default '{}'::jsonb,
  add column if not exists source_limited boolean not null default false;

create table if not exists public.canonical_games (
  canonical_game_id text primary key,
  sport text not null,
  league text not null,
  event_date date not null,
  scheduled_start timestamptz,
  home_team text,
  away_team text,
  home_team_key text,
  away_team_key text,
  source_event_ids jsonb not null default '[]'::jsonb,
  identity_confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_snapshot_events_canonical_game_idx
  on public.market_snapshot_events (canonical_game_id);

create index if not exists market_snapshot_events_sport_canonical_game_idx
  on public.market_snapshot_events (sport, canonical_game_id, captured_at desc);

create index if not exists market_snapshot_events_commence_source_limited_idx
  on public.market_snapshot_events (sport, commence_time, source_limited);

create index if not exists market_snapshot_prices_canonical_game_market_book_idx
  on public.market_snapshot_prices (canonical_game_id, market_type, book, captured_at desc);

create index if not exists market_snapshot_prices_canonical_market_key_idx
  on public.market_snapshot_prices (canonical_market_key, captured_at desc);

create index if not exists market_snapshot_prices_capture_phase_idx
  on public.market_snapshot_prices (capture_window_phase, sport, captured_at desc);

create index if not exists market_snapshot_prices_opening_idx
  on public.market_snapshot_prices (canonical_market_key, captured_at asc)
  where is_opening_candidate = true;

create index if not exists market_snapshot_prices_closing_idx
  on public.market_snapshot_prices (canonical_market_key, captured_at desc)
  where is_closing_candidate = true;

create index if not exists canonical_games_sport_event_date_idx
  on public.canonical_games (sport, event_date);

create index if not exists canonical_games_scheduled_start_idx
  on public.canonical_games (scheduled_start);

alter table public.canonical_games enable row level security;

drop policy if exists canonical_games_read on public.canonical_games;
drop policy if exists canonical_games_service_write on public.canonical_games;

create policy canonical_games_read
  on public.canonical_games
  for select
  using (true);

create policy canonical_games_service_write
  on public.canonical_games
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace view public.vw_market_openers as
select distinct on (canonical_market_key)
  canonical_market_key,
  canonical_game_id,
  sport,
  book,
  market_type,
  participant_key,
  outcome,
  captured_at as opening_captured_at,
  line as opening_line,
  odds as opening_odds,
  source_limited,
  coverage_flags
from public.market_snapshot_prices
where canonical_market_key is not null
order by canonical_market_key, captured_at asc;

create or replace view public.vw_market_closers as
select distinct on (canonical_market_key)
  canonical_market_key,
  canonical_game_id,
  sport,
  book,
  market_type,
  participant_key,
  outcome,
  captured_at as closing_captured_at,
  line as closing_line,
  odds as closing_odds,
  source_limited,
  coverage_flags
from public.market_snapshot_prices
where canonical_market_key is not null
order by canonical_market_key, captured_at desc;

create or replace view public.vw_market_line_movements as
select
  o.canonical_market_key,
  o.canonical_game_id,
  o.sport,
  o.book,
  o.market_type,
  o.participant_key,
  o.outcome,
  o.opening_captured_at,
  o.opening_line,
  o.opening_odds,
  c.closing_captured_at,
  c.closing_line,
  c.closing_odds,
  (c.closing_line - o.opening_line) as line_delta,
  (c.closing_odds - o.opening_odds) as odds_delta
from public.vw_market_openers o
join public.vw_market_closers c using (canonical_market_key, canonical_game_id, sport, book, market_type, participant_key, outcome);

create or replace view public.vw_market_source_coverage_daily as
select
  date_trunc('day', captured_at) as capture_day,
  sport,
  book,
  count(distinct canonical_game_id) as game_count,
  count(*) as price_count,
  count(*) filter (where source_limited) as source_limited_count,
  avg(source_age_minutes) as avg_source_age_minutes,
  max(source_age_minutes) as max_source_age_minutes,
  count(distinct market_type) as market_type_count
from public.market_snapshot_prices
group by 1, 2, 3;
