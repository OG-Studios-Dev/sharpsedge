-- Backfill pre-game context onto team-named rows whose market loader did not set team_role
-- (notably historical totals/spreads where the participant team exists but role is null).

update public.ask_goose_query_layer_v1 q
set
  team_role = coalesce(q.team_role, ctx.team_role),
  team_wins_pre_game = ctx.team_wins_pre_game,
  team_losses_pre_game = ctx.team_losses_pre_game,
  team_pushes_pre_game = ctx.team_pushes_pre_game,
  team_games_played_pre_game = ctx.team_games_played_pre_game,
  team_current_streak_pre_game = ctx.team_current_streak_pre_game,
  team_win_streak_pre_game = ctx.team_win_streak_pre_game,
  team_loss_streak_pre_game = ctx.team_loss_streak_pre_game,
  opponent_wins_pre_game = ctx.opponent_wins_pre_game,
  opponent_losses_pre_game = ctx.opponent_losses_pre_game,
  opponent_pushes_pre_game = ctx.opponent_pushes_pre_game,
  opponent_games_played_pre_game = ctx.opponent_games_played_pre_game,
  opponent_current_streak_pre_game = ctx.opponent_current_streak_pre_game,
  opponent_win_streak_pre_game = ctx.opponent_win_streak_pre_game,
  opponent_loss_streak_pre_game = ctx.opponent_loss_streak_pre_game,
  team_win_pct_pre_game = ctx.team_win_pct_pre_game,
  opponent_win_pct_pre_game = ctx.opponent_win_pct_pre_game,
  team_above_500_pre_game = ctx.team_above_500_pre_game,
  opponent_above_500_pre_game = ctx.opponent_above_500_pre_game,
  team_league_rank_pre_game = ctx.team_league_rank_pre_game,
  opponent_league_rank_pre_game = ctx.opponent_league_rank_pre_game,
  favorite_team_role = ctx.favorite_team_role,
  underdog_team_role = ctx.underdog_team_role,
  is_favorite = coalesce(q.is_favorite, ctx.is_favorite),
  is_underdog = coalesce(q.is_underdog, ctx.is_underdog),
  is_home_team_bet = coalesce(q.is_home_team_bet, ctx.is_home_team_bet),
  is_away_team_bet = coalesce(q.is_away_team_bet, ctx.is_away_team_bet),
  is_home_favorite = coalesce(q.is_home_favorite, ctx.is_home_favorite),
  is_away_favorite = coalesce(q.is_away_favorite, ctx.is_away_favorite),
  is_home_underdog = coalesce(q.is_home_underdog, ctx.is_home_underdog),
  is_road_underdog = coalesce(q.is_road_underdog, ctx.is_road_underdog),
  is_road_favorite = coalesce(q.is_road_favorite, ctx.is_road_favorite),
  game_context_build_version = ctx.build_version
from public.game_context_features_v1 ctx
where ctx.league = q.league
  and ctx.canonical_game_id = q.canonical_game_id
  and lower(ctx.team_name) = lower(q.team_name)
  and q.team_name is not null
  and q.canonical_game_id is not null
  and q.market_family in ('spread', 'total', 'moneyline')
  and (q.team_above_500_pre_game is null or q.team_win_pct_pre_game is null or q.team_role is null);
