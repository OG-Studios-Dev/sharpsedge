create or replace view public.historical_team_schedule_context_v1 as
with ordered_games as (
  select
    hpr.*,
    lag(hpr.event_date) over (
      partition by hpr.league, hpr.team_name
      order by hpr.event_date, hpr.canonical_game_id
    ) as previous_event_date,
    lag(hpr.canonical_game_id) over (
      partition by hpr.league, hpr.team_name
      order by hpr.event_date, hpr.canonical_game_id
    ) as previous_canonical_game_id,
    lag(hpr.team_role) over (
      partition by hpr.league, hpr.team_name
      order by hpr.event_date, hpr.canonical_game_id
    ) as previous_team_role
  from public.historical_team_pregame_record_context_v1 hpr
)
select
  og.canonical_game_id,
  og.league,
  og.team_name,
  og.team_role,
  og.previous_event_date,
  og.previous_canonical_game_id,
  og.previous_team_role,
  case
    when og.previous_event_date is null then null::integer
    else (og.event_date - og.previous_event_date)
  end as days_since_previous_game,
  case
    when og.previous_event_date is null then null::boolean
    when (og.event_date - og.previous_event_date) <= 1 then true
    else false
  end as is_back_to_back,
  case
    when og.previous_event_date is null then null::boolean
    when og.previous_team_role = 'home' and og.team_role = 'away' then true
    else false
  end as switched_home_to_away,
  case
    when og.previous_event_date is null then null::boolean
    when og.previous_team_role = 'away' and og.team_role = 'home' then true
    else false
  end as switched_away_to_home
from ordered_games og;

create or replace view public.historical_team_previous_game_context_v1 as
with moneyline_results as (
  select
    hbq.canonical_game_id,
    hbq.league,
    hbq.team_role,
    case
      when hbq.team_role = 'home' then hbq.home_team
      when hbq.team_role = 'away' then hbq.away_team
      else null::text
    end as team_name,
    hbq.result as previous_moneyline_result
  from public.historical_betting_markets_query_graded_v1 hbq
  where hbq.market_type = 'moneyline'
    and hbq.team_role in ('home', 'away')
),
previous_totals as (
  select
    hbq.canonical_game_id,
    hbq.league,
    hbq.team_role,
    case
      when hbq.team_role = 'home' then hbq.home_team
      when hbq.team_role = 'away' then hbq.away_team
      else null::text
    end as team_name,
    max(case when hbq.market_type = 'total' and lower(hbq.side) = 'over' then hbq.result end) as over_result,
    max(case when hbq.market_type = 'total' and lower(hbq.side) = 'under' then hbq.result end) as under_result
  from public.historical_betting_markets_query_graded_v1 hbq
  where hbq.market_type = 'total'
    and hbq.team_role in ('home', 'away')
  group by 1,2,3,4
)
select
  hsc.canonical_game_id,
  hsc.league,
  hsc.team_name,
  hsc.team_role,
  hsc.previous_canonical_game_id,
  mr.previous_moneyline_result,
  pt.over_result as previous_over_result,
  pt.under_result as previous_under_result,
  null::boolean as previous_game_shutout
from public.historical_team_schedule_context_v1 hsc
left join moneyline_results mr
  on mr.canonical_game_id = hsc.previous_canonical_game_id
 and mr.team_name = hsc.team_name
left join previous_totals pt
  on pt.canonical_game_id = hsc.previous_canonical_game_id
 and pt.team_name = hsc.team_name;

create or replace view public.historical_trends_question_surface_v1 as
select
  hts.*,
  null::boolean as is_prime_time,
  null::text as broadcast_window,
  hsc.is_back_to_back,
  null::boolean as is_divisional_game,
  tpr.team_win_pct_pre_game,
  opr.team_win_pct_pre_game as opponent_win_pct_pre_game,
  tpr.team_above_500_pre_game,
  opr.team_above_500_pre_game as opponent_above_500_pre_game,
  hpg.previous_game_shutout,
  hsc.days_since_previous_game,
  hsc.previous_team_role,
  hpg.previous_moneyline_result,
  hpg.previous_over_result,
  hpg.previous_under_result,
  'v3'::text as trends_build_version
from public.historical_team_market_summary_v1 hts
left join public.historical_team_pregame_record_context_v1 tpr
  on tpr.canonical_game_id = hts.canonical_game_id
 and tpr.team_role = hts.team_role
 and tpr.team_name = hts.team_name
left join public.historical_team_pregame_record_context_v1 opr
  on opr.canonical_game_id = hts.canonical_game_id
 and opr.team_name = hts.opponent_name
 and opr.opponent_name = hts.team_name
left join public.historical_team_schedule_context_v1 hsc
  on hsc.canonical_game_id = hts.canonical_game_id
 and hsc.team_name = hts.team_name
 and hsc.team_role = hts.team_role
left join public.historical_team_previous_game_context_v1 hpg
  on hpg.canonical_game_id = hts.canonical_game_id
 and hpg.team_name = hts.team_name
 and hpg.team_role = hts.team_role;
