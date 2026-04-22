create materialized view if not exists public.ask_goose_query_layer_v1 as
select
  htq.*
from public.historical_trends_question_surface_v1 htq;

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
  on public.ask_goose_query_layer_v1 (graded, profit_status, result);
