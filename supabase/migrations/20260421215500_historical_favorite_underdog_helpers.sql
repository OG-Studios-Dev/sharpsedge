create or replace view public.historical_betting_markets_query_v1 as
with base as (
  select
    hbg.candidate_id,
    hbg.canonical_game_id,
    hbg.event_id,
    hbg.sport,
    hbg.league,
    hbg.season,
    hbg.event_date,
    hbg.home_team,
    hbg.away_team,
    hbg.market_type,
    hbg.submarket_type,
    hbg.market_family,
    hbg.market_scope,
    hbg.participant_type,
    hbg.participant_id,
    hbg.participant_name,
    hbg.opponent_id,
    hbg.opponent_name,
    hbg.side,
    hbg.line,
    hbg.odds,
    hbg.sportsbook,
    hbg.captured_at,
    hbg.bet_on_home_team,
    hbg.bet_on_away_team,
    hbg.team_role,
    hbg.opponent_role,
    hbg.result,
    hbg.graded,
    hbg.integrity_status,
    hbg.settlement_ts,
    hbg.closing_line,
    hbg.closing_odds,
    hbg.profit_units,
    hbg.profit_dollars_10,
    hbg.roi_on_10_flat,
    hbg.classification_status,
    hbg.profit_status,
    hbg.source,
    hbg.source_market_id
  from public.historical_betting_markets_gold_v1 hbg
),
team_moneyline_context as (
  select
    canonical_game_id,
    max(case when team_role = 'home' and market_type = 'moneyline' then odds end) as home_moneyline_odds,
    max(case when team_role = 'away' and market_type = 'moneyline' then odds end) as away_moneyline_odds
  from public.fact_historical_market_sides_base_v1
  where market_type = 'moneyline'
    and team_role in ('home', 'away')
  group by 1
)
select
  b.*,
  tmc.home_moneyline_odds,
  tmc.away_moneyline_odds,
  case
    when tmc.home_moneyline_odds is null or tmc.away_moneyline_odds is null then null::text
    when tmc.home_moneyline_odds = tmc.away_moneyline_odds then 'pickem'
    when tmc.home_moneyline_odds < tmc.away_moneyline_odds then 'home'
    else 'away'
  end as favorite_team_role,
  case
    when tmc.home_moneyline_odds is null or tmc.away_moneyline_odds is null then null::text
    when tmc.home_moneyline_odds = tmc.away_moneyline_odds then 'pickem'
    when tmc.home_moneyline_odds > tmc.away_moneyline_odds then 'home'
    else 'away'
  end as underdog_team_role,
  case
    when tmc.home_moneyline_odds is null or tmc.away_moneyline_odds is null then null::boolean
    when tmc.home_moneyline_odds = tmc.away_moneyline_odds then null::boolean
    when b.team_role = 'home' and tmc.home_moneyline_odds < tmc.away_moneyline_odds then true
    when b.team_role = 'away' and tmc.away_moneyline_odds < tmc.home_moneyline_odds then true
    else false
  end as is_favorite,
  case
    when tmc.home_moneyline_odds is null or tmc.away_moneyline_odds is null then null::boolean
    when tmc.home_moneyline_odds = tmc.away_moneyline_odds then null::boolean
    when b.team_role = 'home' and tmc.home_moneyline_odds > tmc.away_moneyline_odds then true
    when b.team_role = 'away' and tmc.away_moneyline_odds > tmc.home_moneyline_odds then true
    else false
  end as is_underdog,
  case when b.team_role = 'home' then true when b.team_role = 'away' then false else null::boolean end as is_home_team_bet,
  case when b.team_role = 'away' then true when b.team_role = 'home' then false else null::boolean end as is_away_team_bet,
  case
    when b.team_role = 'home'
      and tmc.home_moneyline_odds is not null
      and tmc.away_moneyline_odds is not null
      and tmc.home_moneyline_odds > tmc.away_moneyline_odds
    then true
    else false
  end as is_home_underdog,
  case
    when b.team_role = 'away'
      and tmc.home_moneyline_odds is not null
      and tmc.away_moneyline_odds is not null
      and tmc.away_moneyline_odds > tmc.home_moneyline_odds
    then true
    else false
  end as is_away_underdog,
  case
    when b.team_role = 'home'
      and tmc.home_moneyline_odds is not null
      and tmc.away_moneyline_odds is not null
      and tmc.home_moneyline_odds < tmc.away_moneyline_odds
    then true
    else false
  end as is_home_favorite,
  case
    when b.team_role = 'away'
      and tmc.home_moneyline_odds is not null
      and tmc.away_moneyline_odds is not null
      and tmc.away_moneyline_odds < tmc.home_moneyline_odds
    then true
    else false
  end as is_away_favorite,
  case
    when b.team_role = 'away'
      and tmc.home_moneyline_odds is not null
      and tmc.away_moneyline_odds is not null
      and tmc.away_moneyline_odds > tmc.home_moneyline_odds
    then true
    else false
  end as is_road_underdog,
  case
    when b.team_role = 'home'
      and tmc.home_moneyline_odds is not null
      and tmc.away_moneyline_odds is not null
      and tmc.home_moneyline_odds > tmc.away_moneyline_odds
    then true
    else false
  end as is_home_underdog_bet,
  case
    when b.team_role = 'away'
      and tmc.home_moneyline_odds is not null
      and tmc.away_moneyline_odds is not null
      and tmc.away_moneyline_odds < tmc.home_moneyline_odds
    then true
    else false
  end as is_road_favorite,
  'v1'::text as query_build_version
from base b
left join team_moneyline_context tmc
  on tmc.canonical_game_id = b.canonical_game_id;

create or replace view public.historical_betting_markets_query_graded_v1 as
select *
from public.historical_betting_markets_query_v1
where graded = true
  and profit_status = 'graded';
