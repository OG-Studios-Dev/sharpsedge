-- Dedupe Goose learning training examples at the event-level decision grain.
-- This keeps the isolated learning lab read-only against production picks, but prevents
-- multi-book / repeated-refresh rows from pretending to be independent evidence.

drop view if exists public.goose_learning_readiness_v1;
drop view if exists public.goose_training_examples_v1;

create view public.goose_training_examples_v1 as
with base as (
  select
    agql.*,
    coalesce(
      agql.canonical_game_id,
      agql.event_id,
      concat_ws(':', coalesce(agql.league, agql.sport, 'UNKNOWN'), agql.event_date::text, coalesce(agql.away_team, ''), coalesce(agql.home_team, ''))
    ) as learning_event_key,
    case
      when lower(coalesce(agql.sportsbook, '')) like '%pinnacle%' then 1
      when lower(coalesce(agql.sportsbook, '')) like '%draftkings%' then 2
      when lower(coalesce(agql.sportsbook, '')) like '%fanduel%' then 3
      when lower(coalesce(agql.sportsbook, '')) like '%betmgm%' then 4
      when lower(coalesce(agql.sportsbook, '')) like '%caesars%' then 5
      when lower(coalesce(agql.sportsbook, '')) like '%espn%' then 6
      else 99
    end as learning_book_rank
  from public.ask_goose_query_layer_v1 agql
  where agql.graded = true
    and agql.result in ('win', 'loss', 'push')
    and coalesce(agql.integrity_status, 'ok') = 'ok'
    and agql.odds is not null
    and agql.market_family in ('moneyline', 'spread', 'total')
    and (
      agql.market_family = 'moneyline'
      or agql.line is not null
    )
), ranked as (
  select
    base.*,
    row_number() over (
      partition by
        learning_event_key,
        coalesce(market_family, 'unknown_market'),
        coalesce(market_type, ''),
        coalesce(side, 'unknown_side'),
        coalesce(team_name, ''),
        coalesce(opponent_name, ''),
        coalesce(team_role, ''),
        coalesce(round(line::numeric, 2)::text, 'no_line')
      order by
        learning_book_rank asc,
        coalesce(abs(odds), 999999) asc,
        refreshed_at desc nulls last,
        candidate_id asc
    ) as learning_decision_rank
  from base
)
select
  ranked.candidate_id as example_id,
  ranked.candidate_id,
  ranked.canonical_game_id,
  ranked.event_id,
  coalesce(ranked.sport, ranked.league) as sport,
  ranked.league,
  ranked.season,
  ranked.event_date,
  extract(year from ranked.event_date)::int as event_year,
  ranked.home_team,
  ranked.away_team,
  ranked.team_name,
  ranked.opponent_name,
  ranked.team_role,
  ranked.market_type,
  ranked.submarket_type,
  ranked.market_family,
  ranked.market_scope,
  ranked.segment_key,
  ranked.side,
  ranked.line,
  ranked.odds,
  ranked.sportsbook,
  ranked.is_favorite,
  ranked.is_underdog,
  ranked.is_home_team_bet,
  ranked.is_away_team_bet,
  ranked.is_home_favorite,
  ranked.is_away_favorite,
  ranked.is_home_underdog,
  ranked.is_road_underdog,
  ranked.is_road_favorite,
  ranked.is_back_to_back,
  ranked.is_prime_time,
  ranked.broadcast_window,
  ranked.is_divisional_game,
  ranked.team_win_pct_pre_game,
  ranked.opponent_win_pct_pre_game,
  coalesce(ranked.team_above_500_pre_game, ranked.team_win_pct_pre_game > 0.5) as team_above_500_pre_game,
  coalesce(ranked.opponent_above_500_pre_game, ranked.opponent_win_pct_pre_game > 0.5) as opponent_above_500_pre_game,
  ranked.previous_game_shutout,
  ranked.days_since_previous_game,
  ranked.previous_team_role,
  ranked.previous_moneyline_result,
  ranked.previous_over_result,
  ranked.previous_under_result,
  ranked.result,
  ranked.graded,
  ranked.integrity_status,
  ranked.profit_units,
  ranked.profit_dollars_10,
  ranked.roi_on_10_flat,
  case when ranked.result = 'win' then 1 when ranked.result = 'loss' then 0 else null end as win_label,
  case when ranked.profit_units > 0 then 1 when ranked.profit_units < 0 then 0 else null end as profitable_label,
  ranked.trends_build_version,
  ranked.refreshed_at
from ranked
where ranked.learning_decision_rank = 1;

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
