-- BigQuery Warehouse DDL v1
-- Purpose: first warehouse tables for offline historical analytics.
-- Safety boundary: no effect on live Goosalytics request paths by itself.

create table if not exists `YOUR_PROJECT_ID.goosalytics_warehouse.historical_market_sides_base` (
  candidate_id string not null,
  canonical_game_id string,
  event_id string,
  sport string not null,
  league string not null,
  season string,
  event_date date not null,
  home_team string not null,
  away_team string not null,
  team_name string not null,
  opponent_name string not null,
  team_role string,
  market_type string not null,
  submarket_type string,
  market_family string,
  market_scope string,
  side string,
  line numeric,
  odds numeric,
  sportsbook string,
  is_home_team_bet bool,
  is_away_team_bet bool,
  is_total_over_bet bool,
  is_total_under_bet bool,
  is_favorite bool,
  is_underdog bool,
  graded bool,
  result string,
  integrity_status string,
  profit_units numeric,
  profit_dollars_10 numeric,
  roi_on_10_flat numeric,
  source_loaded_at timestamp not null,
  source_batch_id string not null
)
partition by event_date
cluster by league, market_type, team_name, canonical_game_id;

create table if not exists `YOUR_PROJECT_ID.goosalytics_warehouse.historical_market_results` (
  candidate_id string not null,
  event_date date not null,
  league string not null,
  market_type string not null,
  team_name string not null,
  result string,
  graded bool not null,
  integrity_status string,
  profit_units numeric,
  profit_dollars_10 numeric,
  roi_on_10_flat numeric,
  graded_at timestamp,
  source_loaded_at timestamp not null,
  source_batch_id string not null
)
partition by event_date
cluster by league, market_type, team_name, graded;

create table if not exists `YOUR_PROJECT_ID.goosalytics_warehouse.historical_market_query_ready` (
  candidate_id string not null,
  canonical_game_id string,
  event_id string,
  sport string,
  league string not null,
  season string,
  event_date date not null,
  home_team string,
  away_team string,
  team_name string not null,
  opponent_name string,
  team_role string,
  market_type string not null,
  submarket_type string,
  market_family string,
  market_scope string,
  side string,
  line numeric,
  odds numeric,
  sportsbook string,
  is_home_team_bet bool,
  is_away_team_bet bool,
  is_total_over_bet bool,
  is_total_under_bet bool,
  is_favorite bool,
  is_underdog bool,
  is_divisional_game bool,
  is_prime_time bool,
  segment_key string,
  result string,
  graded bool,
  integrity_status string,
  profit_units numeric,
  profit_dollars_10 numeric,
  roi_on_10_flat numeric,
  build_version string not null,
  refreshed_at timestamp not null
)
partition by event_date
cluster by league, team_name, opponent_name, market_type;

create table if not exists `YOUR_PROJECT_ID.goosalytics_warehouse.team_market_summary` (
  league string not null,
  team_name string not null,
  market_type string not null,
  market_family string,
  split_key string not null,
  window_key string not null,
  sample_size int64 not null,
  wins int64 not null,
  losses int64 not null,
  pushes int64 not null,
  hit_rate float64,
  units numeric,
  roi float64,
  last_event_date date,
  build_version string not null,
  refreshed_at timestamp not null
)
partition by date(refreshed_at)
cluster by league, team_name, market_type, split_key;
