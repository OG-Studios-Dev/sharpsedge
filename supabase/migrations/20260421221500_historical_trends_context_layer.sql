create or replace view public.historical_team_market_summary_v1 as
with base as (
  select
    hbq.candidate_id,
    hbq.canonical_game_id,
    hbq.sport,
    hbq.league,
    hbq.season,
    hbq.event_date,
    hbq.home_team,
    hbq.away_team,
    hbq.team_role,
    case
      when hbq.team_role = 'home' then hbq.home_team
      when hbq.team_role = 'away' then hbq.away_team
      else null::text
    end as team_name,
    case
      when hbq.team_role = 'home' then hbq.away_team
      when hbq.team_role = 'away' then hbq.home_team
      else null::text
    end as opponent_name,
    hbq.market_type,
    hbq.market_family,
    hbq.market_scope,
    hbq.side,
    hbq.line,
    hbq.odds,
    hbq.sportsbook,
    hbq.is_favorite,
    hbq.is_underdog,
    hbq.is_home_team_bet,
    hbq.is_away_team_bet,
    hbq.is_home_favorite,
    hbq.is_away_favorite,
    hbq.is_home_underdog,
    hbq.is_road_underdog,
    hbq.is_road_favorite,
    hbq.result,
    hbq.graded,
    hbq.profit_units,
    hbq.profit_dollars_10,
    hbq.roi_on_10_flat
  from public.historical_betting_markets_query_graded_v1 hbq
  where hbq.team_role in ('home', 'away')
),
game_total_context as (
  select
    canonical_game_id,
    max(case when market_type = 'total' then line end) as game_total_line,
    max(case when market_type = 'total' and lower(side) = 'over' then odds end) as over_odds,
    max(case when market_type = 'total' and lower(side) = 'under' then odds end) as under_odds
  from public.historical_betting_markets_query_v1
  group by 1
)
select
  b.*,
  gtc.game_total_line,
  gtc.over_odds,
  gtc.under_odds,
  case when b.market_type = 'total' and lower(b.side) = 'over' then true else false end as is_total_over_bet,
  case when b.market_type = 'total' and lower(b.side) = 'under' then true else false end as is_total_under_bet,
  'v1'::text as summary_build_version
from base b
left join game_total_context gtc
  on gtc.canonical_game_id = b.canonical_game_id;

create or replace view public.historical_trends_question_surface_v1 as
select
  hts.*,
  null::boolean as is_prime_time,
  null::text as broadcast_window,
  null::boolean as is_back_to_back,
  null::boolean as is_divisional_game,
  null::numeric as team_win_pct_pre_game,
  null::numeric as opponent_win_pct_pre_game,
  null::boolean as team_above_500_pre_game,
  null::boolean as opponent_above_500_pre_game,
  null::boolean as previous_game_shutout,
  'v1'::text as trends_build_version
from public.historical_team_market_summary_v1 hts;
