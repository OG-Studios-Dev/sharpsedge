-- Speed up Ask Goose context-filtered historical questions after .500/streak backfills.

create index if not exists ask_goose_query_layer_v1_context_total_idx
  on public.ask_goose_query_layer_v1 (league, market_family, side, team_above_500_pre_game, event_date desc)
  where team_above_500_pre_game is not null;

create index if not exists ask_goose_query_layer_v1_opponent_context_total_idx
  on public.ask_goose_query_layer_v1 (league, market_family, side, opponent_above_500_pre_game, event_date desc)
  where opponent_above_500_pre_game is not null;

create index if not exists ask_goose_query_layer_v1_streak_context_idx
  on public.ask_goose_query_layer_v1 (league, market_family, side, team_win_streak_pre_game, team_loss_streak_pre_game, event_date desc)
  where team_win_streak_pre_game is not null or team_loss_streak_pre_game is not null;
