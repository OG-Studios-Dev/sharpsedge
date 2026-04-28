-- Add pre-game streak context for Ask Goose/model features.

alter table public.game_context_features_v1
  add column if not exists team_current_streak_pre_game integer,
  add column if not exists team_win_streak_pre_game integer,
  add column if not exists team_loss_streak_pre_game integer,
  add column if not exists opponent_current_streak_pre_game integer,
  add column if not exists opponent_win_streak_pre_game integer,
  add column if not exists opponent_loss_streak_pre_game integer;

alter table public.ask_goose_query_layer_v1
  add column if not exists team_current_streak_pre_game integer,
  add column if not exists team_win_streak_pre_game integer,
  add column if not exists team_loss_streak_pre_game integer,
  add column if not exists opponent_current_streak_pre_game integer,
  add column if not exists opponent_win_streak_pre_game integer,
  add column if not exists opponent_loss_streak_pre_game integer;

create index if not exists game_context_features_v1_streak_idx
  on public.game_context_features_v1 (league, event_date, team_win_streak_pre_game, team_loss_streak_pre_game);

create index if not exists ask_goose_query_layer_v1_context_refresh_idx
  on public.ask_goose_query_layer_v1 (league, season, market_type, event_date, canonical_game_id, team_role);

create index if not exists ask_goose_query_layer_v1_context_join_idx
  on public.ask_goose_query_layer_v1 (league, season, canonical_game_id, team_role);

create or replace function public.refresh_game_context_features_v1_season(
  p_league text,
  p_season text
)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
begin
  if p_league is null or p_league = '' then
    raise exception 'p_league is required';
  end if;
  if p_season is null or p_season = '' then
    raise exception 'p_season is required';
  end if;

  delete from public.game_context_features_v1
  where league = p_league
    and season = p_season;

  insert into public.game_context_features_v1 (
    league, canonical_game_id, event_id, sport, season, event_date,
    home_team, away_team, team_role, team_name, opponent_name,
    team_wins_pre_game, team_losses_pre_game, team_pushes_pre_game, team_games_played_pre_game,
    team_current_streak_pre_game, team_win_streak_pre_game, team_loss_streak_pre_game,
    team_win_pct_pre_game, team_above_500_pre_game,
    opponent_wins_pre_game, opponent_losses_pre_game, opponent_pushes_pre_game, opponent_games_played_pre_game,
    opponent_current_streak_pre_game, opponent_win_streak_pre_game, opponent_loss_streak_pre_game,
    opponent_win_pct_pre_game, opponent_above_500_pre_game,
    team_league_rank_pre_game, opponent_league_rank_pre_game,
    home_moneyline_odds, away_moneyline_odds, favorite_team_role, underdog_team_role,
    is_favorite, is_underdog, is_home_team_bet, is_away_team_bet,
    is_home_favorite, is_away_favorite, is_home_underdog, is_road_underdog, is_road_favorite,
    context_source, build_version, refreshed_at
  )
  with moneyline_ranked as (
    select
      q.*,
      row_number() over (
        partition by q.league, q.season, q.canonical_game_id, q.team_role
        order by
          case lower(coalesce(q.sportsbook, ''))
            when 'draftkings' then 1
            when 'fanduel' then 2
            when 'betmgm' then 3
            when 'caesars' then 4
            when 'williamhill' then 5
            else 9
          end,
          abs(coalesce(q.odds, 0)) asc,
          q.candidate_id
      ) as rn
    from public.ask_goose_query_layer_v1 q
    where q.league = p_league
      and q.season = p_season
      and q.canonical_game_id is not null
      and q.team_role in ('home', 'away')
      and q.market_type = 'moneyline'
      and q.team_name is not null
  ),
  team_games as (
    select
      league, canonical_game_id, event_id, sport, season, event_date,
      home_team, away_team, team_role, team_name, opponent_name, odds,
      result, graded,
      coalesce(is_home_team_bet, team_role = 'home') as is_home_team_bet,
      coalesce(is_away_team_bet, team_role = 'away') as is_away_team_bet
    from moneyline_ranked
    where rn = 1
  ),
  game_prices as (
    select
      league,
      season,
      canonical_game_id,
      max(odds) filter (where team_role = 'home') as home_moneyline_odds,
      max(odds) filter (where team_role = 'away') as away_moneyline_odds
    from team_games
    group by 1, 2, 3
  ),
  with_prices as (
    select
      tg.*,
      gp.home_moneyline_odds,
      gp.away_moneyline_odds,
      case
        when gp.home_moneyline_odds is null or gp.away_moneyline_odds is null then null::text
        when gp.home_moneyline_odds = gp.away_moneyline_odds then 'pickem'
        when gp.home_moneyline_odds < gp.away_moneyline_odds then 'home'
        else 'away'
      end as favorite_team_role,
      case
        when gp.home_moneyline_odds is null or gp.away_moneyline_odds is null then null::text
        when gp.home_moneyline_odds = gp.away_moneyline_odds then 'pickem'
        when gp.home_moneyline_odds > gp.away_moneyline_odds then 'home'
        else 'away'
      end as underdog_team_role
    from team_games tg
    left join game_prices gp
      on gp.league = tg.league
     and gp.season = tg.season
     and gp.canonical_game_id = tg.canonical_game_id
  ),
  ordered_team_games as (
    select
      wp.*,
      case
        when lower(coalesce(wp.result, '')) in ('win', 'loss', 'push') then lower(wp.result)
        else null::text
      end as result_norm,
      lag(case when lower(coalesce(wp.result, '')) in ('win', 'loss', 'push') then lower(wp.result) else null::text end) over (
        partition by league, season, team_name
        order by event_date, canonical_game_id
      ) as previous_result_norm
    from with_prices wp
  ),
  streak_groups as (
    select
      o.*,
      sum(case
        when o.result_norm in ('win', 'loss') and o.result_norm = o.previous_result_norm then 0
        else 1
      end) over (
        partition by league, season, team_name
        order by event_date, canonical_game_id
        rows between unbounded preceding and current row
      ) as streak_group
    from ordered_team_games o
  ),
  with_streaks as (
    select
      sg.*,
      case
        when sg.result_norm in ('win', 'loss') then count(*) over (
          partition by league, season, team_name, streak_group
          order by event_date, canonical_game_id
          rows between unbounded preceding and current row
        )::integer
        else 0
      end as streak_after_game
    from streak_groups sg
  ),
  pregame_streaks as (
    select
      ws.*,
      lag(ws.result_norm) over (
        partition by league, season, team_name
        order by event_date, canonical_game_id
      ) as team_previous_result_pre_game,
      lag(ws.streak_after_game) over (
        partition by league, season, team_name
        order by event_date, canonical_game_id
      ) as team_previous_streak_pre_game
    from with_streaks ws
  ),
  running as (
    select
      ps.*,
      case when ps.team_previous_result_pre_game = 'win' then coalesce(ps.team_previous_streak_pre_game, 0) else 0 end::integer as team_win_streak_pre_game,
      case when ps.team_previous_result_pre_game = 'loss' then coalesce(ps.team_previous_streak_pre_game, 0) else 0 end::integer as team_loss_streak_pre_game,
      case
        when ps.team_previous_result_pre_game = 'win' then coalesce(ps.team_previous_streak_pre_game, 0)
        when ps.team_previous_result_pre_game = 'loss' then -coalesce(ps.team_previous_streak_pre_game, 0)
        else 0
      end::integer as team_current_streak_pre_game,
      coalesce(sum(case when lower(coalesce(result, '')) = 'win' then 1 else 0 end) over (
        partition by league, season, team_name
        order by event_date, canonical_game_id
        rows between unbounded preceding and 1 preceding
      ), 0)::integer as team_wins_pre_game,
      coalesce(sum(case when lower(coalesce(result, '')) = 'loss' then 1 else 0 end) over (
        partition by league, season, team_name
        order by event_date, canonical_game_id
        rows between unbounded preceding and 1 preceding
      ), 0)::integer as team_losses_pre_game,
      coalesce(sum(case when lower(coalesce(result, '')) = 'push' then 1 else 0 end) over (
        partition by league, season, team_name
        order by event_date, canonical_game_id
        rows between unbounded preceding and 1 preceding
      ), 0)::integer as team_pushes_pre_game
    from pregame_streaks ps
  ),
  pct as (
    select
      r.*,
      (r.team_wins_pre_game + r.team_losses_pre_game + r.team_pushes_pre_game)::integer as team_games_played_pre_game,
      case
        when (r.team_wins_pre_game + r.team_losses_pre_game) > 0
        then round(r.team_wins_pre_game::numeric / (r.team_wins_pre_game + r.team_losses_pre_game)::numeric, 4)
        else null::numeric
      end as team_win_pct_pre_game,
      case
        when (r.team_wins_pre_game + r.team_losses_pre_game) > 0 then r.team_wins_pre_game > r.team_losses_pre_game
        else null::boolean
      end as team_above_500_pre_game
    from running r
  ),
  ranked as (
    select
      p.*,
      case
        when p.team_win_pct_pre_game is null then null::integer
        else dense_rank() over (
          partition by p.league, p.season, p.event_date
          order by p.team_win_pct_pre_game desc nulls last, p.team_wins_pre_game desc, p.team_name asc
        )::integer
      end as team_league_rank_pre_game
    from pct p
  ),
  joined as (
    select
      r.*,
      opp.team_wins_pre_game as opponent_wins_pre_game,
      opp.team_losses_pre_game as opponent_losses_pre_game,
      opp.team_pushes_pre_game as opponent_pushes_pre_game,
      opp.team_games_played_pre_game as opponent_games_played_pre_game,
      opp.team_current_streak_pre_game as opponent_current_streak_pre_game,
      opp.team_win_streak_pre_game as opponent_win_streak_pre_game,
      opp.team_loss_streak_pre_game as opponent_loss_streak_pre_game,
      opp.team_win_pct_pre_game as opponent_win_pct_pre_game,
      opp.team_above_500_pre_game as opponent_above_500_pre_game,
      opp.team_league_rank_pre_game as opponent_league_rank_pre_game
    from ranked r
    left join ranked opp
      on opp.league = r.league
     and opp.season = r.season
     and opp.canonical_game_id = r.canonical_game_id
     and opp.team_role <> r.team_role
  )
  select
    j.league, j.canonical_game_id, j.event_id, j.sport, j.season, j.event_date,
    j.home_team, j.away_team, j.team_role, j.team_name, j.opponent_name,
    j.team_wins_pre_game, j.team_losses_pre_game, j.team_pushes_pre_game, j.team_games_played_pre_game,
    j.team_current_streak_pre_game, j.team_win_streak_pre_game, j.team_loss_streak_pre_game,
    j.team_win_pct_pre_game, j.team_above_500_pre_game,
    j.opponent_wins_pre_game, j.opponent_losses_pre_game, j.opponent_pushes_pre_game, j.opponent_games_played_pre_game,
    j.opponent_current_streak_pre_game, j.opponent_win_streak_pre_game, j.opponent_loss_streak_pre_game,
    j.opponent_win_pct_pre_game, j.opponent_above_500_pre_game,
    j.team_league_rank_pre_game, j.opponent_league_rank_pre_game,
    j.home_moneyline_odds, j.away_moneyline_odds, j.favorite_team_role, j.underdog_team_role,
    case when j.favorite_team_role in ('home', 'away') then j.team_role = j.favorite_team_role else null::boolean end,
    case when j.underdog_team_role in ('home', 'away') then j.team_role = j.underdog_team_role else null::boolean end,
    j.is_home_team_bet,
    j.is_away_team_bet,
    case when j.team_role = 'home' and j.favorite_team_role = 'home' then true else false end,
    case when j.team_role = 'away' and j.favorite_team_role = 'away' then true else false end,
    case when j.team_role = 'home' and j.underdog_team_role = 'home' then true else false end,
    case when j.team_role = 'away' and j.underdog_team_role = 'away' then true else false end,
    case when j.team_role = 'away' and j.favorite_team_role = 'away' then true else false end,
    'ask_goose_query_layer_v1_moneyline_season',
    'game_context_features_v1_season',
    now()
  from joined j
  on conflict (league, canonical_game_id, team_role) do update set
    event_id = excluded.event_id,
    sport = excluded.sport,
    season = excluded.season,
    event_date = excluded.event_date,
    home_team = excluded.home_team,
    away_team = excluded.away_team,
    team_name = excluded.team_name,
    opponent_name = excluded.opponent_name,
    team_wins_pre_game = excluded.team_wins_pre_game,
    team_losses_pre_game = excluded.team_losses_pre_game,
    team_pushes_pre_game = excluded.team_pushes_pre_game,
    team_games_played_pre_game = excluded.team_games_played_pre_game,
    team_current_streak_pre_game = excluded.team_current_streak_pre_game,
    team_win_streak_pre_game = excluded.team_win_streak_pre_game,
    team_loss_streak_pre_game = excluded.team_loss_streak_pre_game,
    team_win_pct_pre_game = excluded.team_win_pct_pre_game,
    team_above_500_pre_game = excluded.team_above_500_pre_game,
    opponent_wins_pre_game = excluded.opponent_wins_pre_game,
    opponent_losses_pre_game = excluded.opponent_losses_pre_game,
    opponent_pushes_pre_game = excluded.opponent_pushes_pre_game,
    opponent_games_played_pre_game = excluded.opponent_games_played_pre_game,
    opponent_current_streak_pre_game = excluded.opponent_current_streak_pre_game,
    opponent_win_streak_pre_game = excluded.opponent_win_streak_pre_game,
    opponent_loss_streak_pre_game = excluded.opponent_loss_streak_pre_game,
    opponent_win_pct_pre_game = excluded.opponent_win_pct_pre_game,
    opponent_above_500_pre_game = excluded.opponent_above_500_pre_game,
    team_league_rank_pre_game = excluded.team_league_rank_pre_game,
    opponent_league_rank_pre_game = excluded.opponent_league_rank_pre_game,
    home_moneyline_odds = excluded.home_moneyline_odds,
    away_moneyline_odds = excluded.away_moneyline_odds,
    favorite_team_role = excluded.favorite_team_role,
    underdog_team_role = excluded.underdog_team_role,
    is_favorite = excluded.is_favorite,
    is_underdog = excluded.is_underdog,
    is_home_team_bet = excluded.is_home_team_bet,
    is_away_team_bet = excluded.is_away_team_bet,
    is_home_favorite = excluded.is_home_favorite,
    is_away_favorite = excluded.is_away_favorite,
    is_home_underdog = excluded.is_home_underdog,
    is_road_underdog = excluded.is_road_underdog,
    is_road_favorite = excluded.is_road_favorite,
    context_source = excluded.context_source,
    build_version = excluded.build_version,
    refreshed_at = now();

  get diagnostics v_rows = row_count;

  update public.ask_goose_query_layer_v1 q
  set
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
    home_moneyline_odds = ctx.home_moneyline_odds,
    away_moneyline_odds = ctx.away_moneyline_odds,
    favorite_team_role = ctx.favorite_team_role,
    underdog_team_role = ctx.underdog_team_role,
    is_favorite = coalesce(q.is_favorite, ctx.is_favorite),
    is_underdog = coalesce(q.is_underdog, ctx.is_underdog),
    is_home_favorite = coalesce(q.is_home_favorite, ctx.is_home_favorite),
    is_away_favorite = coalesce(q.is_away_favorite, ctx.is_away_favorite),
    is_home_underdog = coalesce(q.is_home_underdog, ctx.is_home_underdog),
    is_road_underdog = coalesce(q.is_road_underdog, ctx.is_road_underdog),
    is_road_favorite = coalesce(q.is_road_favorite, ctx.is_road_favorite),
    game_context_build_version = ctx.build_version
  from public.game_context_features_v1 ctx
  where ctx.league = q.league
    and ctx.season = q.season
    and ctx.canonical_game_id = q.canonical_game_id
    and ctx.team_role = q.team_role
    and q.league = p_league
    and q.season = p_season;

  return v_rows;
end;
$$;
