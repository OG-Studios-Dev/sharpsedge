create table if not exists public.ask_goose_query_layer_v1 (
  candidate_id text primary key,
  canonical_game_id text,
  event_id text,
  sport text,
  league text,
  season text,
  event_date date,
  home_team text,
  away_team text,
  team_role text,
  team_name text,
  opponent_name text,
  market_type text,
  submarket_type text,
  market_family text,
  market_scope text,
  side text,
  line numeric,
  odds numeric,
  sportsbook text,
  is_favorite boolean,
  is_underdog boolean,
  is_home_team_bet boolean,
  is_away_team_bet boolean,
  is_home_favorite boolean,
  is_away_favorite boolean,
  is_home_underdog boolean,
  is_road_underdog boolean,
  is_road_favorite boolean,
  result text,
  graded boolean,
  integrity_status text,
  profit_units numeric,
  profit_dollars_10 numeric,
  roi_on_10_flat numeric,
  game_total_line numeric,
  over_odds numeric,
  under_odds numeric,
  is_total_over_bet boolean,
  is_total_under_bet boolean,
  is_prime_time boolean,
  broadcast_window text,
  is_back_to_back boolean,
  is_divisional_game boolean,
  team_win_pct_pre_game numeric,
  opponent_win_pct_pre_game numeric,
  team_above_500_pre_game boolean,
  opponent_above_500_pre_game boolean,
  previous_game_shutout boolean,
  days_since_previous_game integer,
  previous_team_role text,
  previous_moneyline_result text,
  previous_over_result text,
  previous_under_result text,
  segment_key text,
  is_spread_market boolean,
  is_total_market boolean,
  is_moneyline_market boolean,
  trends_build_version text,
  refreshed_at timestamptz not null default now()
);

create index if not exists ask_goose_query_layer_v1_league_date_idx
  on public.ask_goose_query_layer_v1 (league, event_date);

create index if not exists ask_goose_query_layer_v1_team_idx
  on public.ask_goose_query_layer_v1 (league, team_name, event_date);

create index if not exists ask_goose_query_layer_v1_opponent_idx
  on public.ask_goose_query_layer_v1 (league, opponent_name, event_date);

create index if not exists ask_goose_query_layer_v1_market_idx
  on public.ask_goose_query_layer_v1 (market_type, market_family, market_scope);

create index if not exists ask_goose_query_layer_v1_spots_idx
  on public.ask_goose_query_layer_v1 (
    league,
    is_back_to_back,
    team_above_500_pre_game,
    opponent_above_500_pre_game,
    is_underdog,
    is_favorite
  );

create index if not exists ask_goose_query_layer_v1_profit_idx
  on public.ask_goose_query_layer_v1 (graded, result);
