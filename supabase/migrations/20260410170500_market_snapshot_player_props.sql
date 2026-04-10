alter table public.market_snapshot_prices
  drop constraint if exists market_snapshot_prices_market_type_check;

alter table public.market_snapshot_prices
  add column if not exists participant_type text,
  add column if not exists participant_id text,
  add column if not exists participant_name text,
  add column if not exists opponent_name text,
  add column if not exists prop_type text,
  add column if not exists prop_market_key text,
  add column if not exists context jsonb not null default '{}'::jsonb;

alter table public.market_snapshot_prices
  add constraint market_snapshot_prices_market_type_check
  check (market_type in (
    'moneyline',
    'spread',
    'spread_q1',
    'spread_q3',
    'total',
    'first_five_moneyline',
    'first_five_total',
    'player_prop_points',
    'player_prop_rebounds',
    'player_prop_assists',
    'player_prop_shots_on_goal',
    'player_prop_goals',
    'player_prop_hits',
    'player_prop_total_bases',
    'player_prop_strikeouts',
    'player_prop_home_runs',
    'player_prop_threes',
    'player_prop_passing_yards',
    'player_prop_passing_tds',
    'player_prop_rushing_yards',
    'player_prop_rush_attempts',
    'player_prop_receiving_yards',
    'player_prop_receptions',
    'player_prop_anytime_td'
  ));

create index if not exists market_snapshot_prices_participant_idx
  on public.market_snapshot_prices (sport, participant_name, market_type, captured_at desc);

create index if not exists market_snapshot_prices_prop_market_idx
  on public.market_snapshot_prices (sport, prop_market_key, captured_at desc);
