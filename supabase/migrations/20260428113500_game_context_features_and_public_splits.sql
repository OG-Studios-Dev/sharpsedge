-- Build a durable pre-game context layer for Ask Goose and historical edge analysis.
-- This is additive: it does not drop existing Ask Goose data. It materializes team
-- records/above-.500 flags, favorite/dog roles, and a normalized public betting splits store.

alter table public.ask_goose_query_layer_v1
  add column if not exists team_wins_pre_game integer,
  add column if not exists team_losses_pre_game integer,
  add column if not exists team_pushes_pre_game integer,
  add column if not exists team_games_played_pre_game integer,
  add column if not exists opponent_wins_pre_game integer,
  add column if not exists opponent_losses_pre_game integer,
  add column if not exists opponent_pushes_pre_game integer,
  add column if not exists opponent_games_played_pre_game integer,
  add column if not exists team_league_rank_pre_game integer,
  add column if not exists opponent_league_rank_pre_game integer,
  add column if not exists favorite_team_role text,
  add column if not exists underdog_team_role text,
  add column if not exists home_moneyline_odds numeric,
  add column if not exists away_moneyline_odds numeric,
  add column if not exists public_bets_pct numeric,
  add column if not exists public_handle_pct numeric,
  add column if not exists public_split_source text,
  add column if not exists public_split_snapshot_at timestamptz,
  add column if not exists game_context_build_version text;

create table if not exists public.game_context_features_v1 (
  league text not null,
  canonical_game_id text not null,
  event_id text,
  sport text,
  season text,
  event_date date,
  home_team text,
  away_team text,
  team_role text not null check (team_role in ('home', 'away')),
  team_name text,
  opponent_name text,
  team_wins_pre_game integer,
  team_losses_pre_game integer,
  team_pushes_pre_game integer,
  team_games_played_pre_game integer,
  team_win_pct_pre_game numeric,
  team_above_500_pre_game boolean,
  opponent_wins_pre_game integer,
  opponent_losses_pre_game integer,
  opponent_pushes_pre_game integer,
  opponent_games_played_pre_game integer,
  opponent_win_pct_pre_game numeric,
  opponent_above_500_pre_game boolean,
  team_league_rank_pre_game integer,
  opponent_league_rank_pre_game integer,
  home_moneyline_odds numeric,
  away_moneyline_odds numeric,
  favorite_team_role text,
  underdog_team_role text,
  is_favorite boolean,
  is_underdog boolean,
  is_home_team_bet boolean,
  is_away_team_bet boolean,
  is_home_favorite boolean,
  is_away_favorite boolean,
  is_home_underdog boolean,
  is_road_underdog boolean,
  is_road_favorite boolean,
  context_source text not null default 'ask_goose_query_layer_v1_moneyline',
  build_version text not null default 'game_context_features_v1',
  refreshed_at timestamptz not null default now(),
  primary key (league, canonical_game_id, team_role)
);

create index if not exists game_context_features_v1_team_idx
  on public.game_context_features_v1 (league, team_name, event_date);

create index if not exists game_context_features_v1_spot_idx
  on public.game_context_features_v1 (league, event_date, is_underdog, team_above_500_pre_game, team_role);

alter table public.game_context_features_v1 enable row level security;

drop policy if exists game_context_features_v1_read on public.game_context_features_v1;
drop policy if exists game_context_features_v1_service_write on public.game_context_features_v1;

create policy game_context_features_v1_read
  on public.game_context_features_v1
  for select
  using (true);

create policy game_context_features_v1_service_write
  on public.game_context_features_v1
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.public_betting_splits_v1 (
  id text primary key,
  sport text not null,
  league text not null,
  game_date date not null,
  action_network_game_id bigint,
  matchup text,
  home_team_abbrev text,
  away_team_abbrev text,
  home_team_name text,
  away_team_name text,
  market_type text not null check (market_type in ('moneyline', 'spread', 'total')),
  side text not null check (side in ('home', 'away', 'over', 'under')),
  side_label text,
  bets_percent numeric,
  handle_percent numeric,
  line numeric,
  source text not null,
  source_role text,
  is_primary boolean,
  effective_source text,
  using_primary boolean,
  ml_splits_available boolean,
  spread_splits_available boolean,
  total_splits_available boolean,
  comparison_available boolean,
  covers_supplement jsonb,
  snapshot_at timestamptz not null,
  ingested_at timestamptz not null default now()
);

create index if not exists public_betting_splits_v1_game_idx
  on public.public_betting_splits_v1 (league, game_date, away_team_abbrev, home_team_abbrev, market_type, side, snapshot_at desc);

create index if not exists public_betting_splits_v1_market_idx
  on public.public_betting_splits_v1 (league, market_type, side, handle_percent, bets_percent);

alter table public.public_betting_splits_v1 enable row level security;

drop policy if exists public_betting_splits_v1_read on public.public_betting_splits_v1;
drop policy if exists public_betting_splits_v1_service_write on public.public_betting_splits_v1;

create policy public_betting_splits_v1_read
  on public.public_betting_splits_v1
  for select
  using (true);

create policy public_betting_splits_v1_service_write
  on public.public_betting_splits_v1
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.refresh_game_context_features_v1(p_league text default null)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
begin
  if p_league is null then
    truncate table public.game_context_features_v1;
  else
    delete from public.game_context_features_v1 where league = p_league;
  end if;

  insert into public.game_context_features_v1 (
    league, canonical_game_id, event_id, sport, season, event_date,
    home_team, away_team, team_role, team_name, opponent_name,
    team_wins_pre_game, team_losses_pre_game, team_pushes_pre_game, team_games_played_pre_game,
    team_win_pct_pre_game, team_above_500_pre_game,
    opponent_wins_pre_game, opponent_losses_pre_game, opponent_pushes_pre_game, opponent_games_played_pre_game,
    opponent_win_pct_pre_game, opponent_above_500_pre_game,
    team_league_rank_pre_game, opponent_league_rank_pre_game,
    home_moneyline_odds, away_moneyline_odds, favorite_team_role, underdog_team_role,
    is_favorite, is_underdog, is_home_team_bet, is_away_team_bet,
    is_home_favorite, is_away_favorite, is_home_underdog, is_road_underdog, is_road_favorite,
    refreshed_at
  )
  with moneyline_ranked as (
    select
      q.*,
      row_number() over (
        partition by q.league, q.canonical_game_id, q.team_role
        order by
          case lower(coalesce(q.sportsbook, ''))
            when 'draftkings' then 1
            when 'fanduel' then 2
            when 'betmgm' then 3
            else 9
          end,
          q.candidate_id
      ) as rn
    from public.ask_goose_query_layer_v1 q
    where q.canonical_game_id is not null
      and q.team_role in ('home', 'away')
      and q.market_type = 'moneyline'
      and q.team_name is not null
      and (p_league is null or q.league = p_league)
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
      canonical_game_id,
      max(odds) filter (where team_role = 'home') as home_moneyline_odds,
      max(odds) filter (where team_role = 'away') as away_moneyline_odds
    from team_games
    group by 1, 2
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
     and gp.canonical_game_id = tg.canonical_game_id
  ),
  running as (
    select
      wp.*,
      coalesce(sum(case when lower(coalesce(result, '')) = 'win' then 1 else 0 end) over (
        partition by league, team_name
        order by event_date, canonical_game_id
        rows between unbounded preceding and 1 preceding
      ), 0)::integer as team_wins_pre_game,
      coalesce(sum(case when lower(coalesce(result, '')) = 'loss' then 1 else 0 end) over (
        partition by league, team_name
        order by event_date, canonical_game_id
        rows between unbounded preceding and 1 preceding
      ), 0)::integer as team_losses_pre_game,
      coalesce(sum(case when lower(coalesce(result, '')) = 'push' then 1 else 0 end) over (
        partition by league, team_name
        order by event_date, canonical_game_id
        rows between unbounded preceding and 1 preceding
      ), 0)::integer as team_pushes_pre_game
    from with_prices wp
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
          partition by p.league, p.event_date
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
      opp.team_win_pct_pre_game as opponent_win_pct_pre_game,
      opp.team_above_500_pre_game as opponent_above_500_pre_game,
      opp.team_league_rank_pre_game as opponent_league_rank_pre_game
    from ranked r
    left join ranked opp
      on opp.league = r.league
     and opp.canonical_game_id = r.canonical_game_id
     and opp.team_role <> r.team_role
  )
  select
    j.league, j.canonical_game_id, j.event_id, j.sport, j.season, j.event_date,
    j.home_team, j.away_team, j.team_role, j.team_name, j.opponent_name,
    j.team_wins_pre_game, j.team_losses_pre_game, j.team_pushes_pre_game, j.team_games_played_pre_game,
    j.team_win_pct_pre_game, j.team_above_500_pre_game,
    j.opponent_wins_pre_game, j.opponent_losses_pre_game, j.opponent_pushes_pre_game, j.opponent_games_played_pre_game,
    j.opponent_win_pct_pre_game, j.opponent_above_500_pre_game,
    j.team_league_rank_pre_game, j.opponent_league_rank_pre_game,
    j.home_moneyline_odds, j.away_moneyline_odds, j.favorite_team_role, j.underdog_team_role,
    case when j.favorite_team_role in ('home', 'away') then j.team_role = j.favorite_team_role else null::boolean end as is_favorite,
    case when j.underdog_team_role in ('home', 'away') then j.team_role = j.underdog_team_role else null::boolean end as is_underdog,
    j.is_home_team_bet,
    j.is_away_team_bet,
    case when j.team_role = 'home' and j.favorite_team_role = 'home' then true else false end as is_home_favorite,
    case when j.team_role = 'away' and j.favorite_team_role = 'away' then true else false end as is_away_favorite,
    case when j.team_role = 'home' and j.underdog_team_role = 'home' then true else false end as is_home_underdog,
    case when j.team_role = 'away' and j.underdog_team_role = 'away' then true else false end as is_road_underdog,
    case when j.team_role = 'away' and j.favorite_team_role = 'away' then true else false end as is_road_favorite,
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
    team_win_pct_pre_game = excluded.team_win_pct_pre_game,
    team_above_500_pre_game = excluded.team_above_500_pre_game,
    opponent_wins_pre_game = excluded.opponent_wins_pre_game,
    opponent_losses_pre_game = excluded.opponent_losses_pre_game,
    opponent_pushes_pre_game = excluded.opponent_pushes_pre_game,
    opponent_games_played_pre_game = excluded.opponent_games_played_pre_game,
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
    refreshed_at = now();

  get diagnostics v_rows = row_count;

  update public.ask_goose_query_layer_v1 q
  set
    team_wins_pre_game = ctx.team_wins_pre_game,
    team_losses_pre_game = ctx.team_losses_pre_game,
    team_pushes_pre_game = ctx.team_pushes_pre_game,
    team_games_played_pre_game = ctx.team_games_played_pre_game,
    opponent_wins_pre_game = ctx.opponent_wins_pre_game,
    opponent_losses_pre_game = ctx.opponent_losses_pre_game,
    opponent_pushes_pre_game = ctx.opponent_pushes_pre_game,
    opponent_games_played_pre_game = ctx.opponent_games_played_pre_game,
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
    and ctx.canonical_game_id = q.canonical_game_id
    and ctx.team_role = q.team_role
    and (p_league is null or q.league = p_league);

  return v_rows;
end;
$$;
