drop view if exists public.historical_trends_question_surface_v1;
drop view if exists public.historical_shutout_context_v1;
drop view if exists public.historical_team_previous_game_context_v1;
drop view if exists public.historical_team_schedule_context_v1;
drop view if exists public.historical_team_pregame_record_context_v1;
drop view if exists public.historical_team_game_index_v1;
drop view if exists public.historical_divisional_context_v1;
drop view if exists public.historical_team_market_summary_v1;

create view public.historical_team_market_summary_v1 as
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
    hbq.submarket_type,
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
    hbq.integrity_status,
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
  'v3'::text as summary_build_version
from base b
left join game_total_context gtc
  on gtc.canonical_game_id = b.canonical_game_id;

create view public.historical_team_game_index_v1 as
select distinct
  hts.canonical_game_id,
  hts.sport,
  hts.league,
  hts.season,
  hts.event_date,
  hts.team_role,
  hts.team_name,
  hts.opponent_name
from public.historical_team_market_summary_v1 hts
where hts.team_role in ('home', 'away')
  and hts.team_name is not null
  and hts.opponent_name is not null;

create view public.historical_team_pregame_record_context_v1 as
with game_rows as (
  select
    hgi.*,
    row_number() over (
      partition by hgi.league, hgi.team_name
      order by hgi.event_date, hgi.canonical_game_id
    ) as team_game_number
  from public.historical_team_game_index_v1 hgi
),
team_results as (
  select
    gr.*,
    gmr.result,
    case when gmr.result = 'win' then 1 else 0 end as win_flag,
    case when gmr.result = 'loss' then 1 else 0 end as loss_flag,
    case when gmr.result = 'push' then 1 else 0 end as push_flag
  from game_rows gr
  left join public.historical_betting_markets_query_graded_v1 gmr
    on gmr.canonical_game_id = gr.canonical_game_id
   and gmr.team_role = gr.team_role
   and gmr.market_type = 'moneyline'
),
running as (
  select
    tr.*,
    coalesce(sum(win_flag) over (
      partition by tr.league, tr.team_name
      order by tr.event_date, tr.canonical_game_id
      rows between unbounded preceding and 1 preceding
    ), 0) as team_wins_pre_game,
    coalesce(sum(loss_flag) over (
      partition by tr.league, tr.team_name
      order by tr.event_date, tr.canonical_game_id
      rows between unbounded preceding and 1 preceding
    ), 0) as team_losses_pre_game,
    coalesce(sum(push_flag) over (
      partition by tr.league, tr.team_name
      order by tr.event_date, tr.canonical_game_id
      rows between unbounded preceding and 1 preceding
    ), 0) as team_pushes_pre_game
  from team_results tr
)
select
  r.canonical_game_id,
  r.sport,
  r.league,
  r.season,
  r.event_date,
  r.team_role,
  r.team_name,
  r.opponent_name,
  r.team_wins_pre_game,
  r.team_losses_pre_game,
  r.team_pushes_pre_game,
  case
    when (r.team_wins_pre_game + r.team_losses_pre_game) > 0
    then round((r.team_wins_pre_game::numeric / (r.team_wins_pre_game + r.team_losses_pre_game)::numeric), 4)
    else null::numeric
  end as team_win_pct_pre_game,
  case
    when (r.team_wins_pre_game + r.team_losses_pre_game) > 0
      and r.team_wins_pre_game > r.team_losses_pre_game then true
    when (r.team_wins_pre_game + r.team_losses_pre_game) > 0 then false
    else null::boolean
  end as team_above_500_pre_game
from running r;

create view public.historical_team_schedule_context_v1 as
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
  end as is_back_to_back
from ordered_games og;

create view public.historical_team_previous_game_context_v1 as
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
    max(case when hbq.market_type = 'total' and lower(hbq.side) = 'over' then hbq.result end) as previous_over_result,
    max(case when hbq.market_type = 'total' and lower(hbq.side) = 'under' then hbq.result end) as previous_under_result
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
  pt.previous_over_result,
  pt.previous_under_result
from public.historical_team_schedule_context_v1 hsc
left join moneyline_results mr
  on mr.canonical_game_id = hsc.previous_canonical_game_id
 and mr.team_name = hsc.team_name
left join previous_totals pt
  on pt.canonical_game_id = hsc.previous_canonical_game_id
 and pt.team_name = hsc.team_name;

create view public.historical_shutout_context_v1 as
select
  hpg.canonical_game_id,
  hpg.league,
  hpg.team_name,
  hpg.team_role,
  null::boolean as previous_game_shutout
from public.historical_team_previous_game_context_v1 hpg;

create view public.historical_divisional_context_v1 as
select
  hts.canonical_game_id,
  hts.league,
  null::boolean as is_divisional_game
from public.historical_team_market_summary_v1 hts
group by 1,2;

create view public.historical_trends_question_surface_v1 as
select
  hts.candidate_id,
  hts.canonical_game_id,
  hts.canonical_game_id as event_id,
  hts.sport,
  hts.league,
  hts.season,
  hts.event_date,
  hts.home_team,
  hts.away_team,
  hts.team_role,
  hts.team_name,
  hts.opponent_name,
  hts.market_type,
  hts.submarket_type,
  hts.market_family,
  hts.market_scope,
  hts.side,
  hts.line,
  hts.odds,
  hts.sportsbook,
  hts.is_favorite,
  hts.is_underdog,
  hts.is_home_team_bet,
  hts.is_away_team_bet,
  hts.is_home_favorite,
  hts.is_away_favorite,
  hts.is_home_underdog,
  hts.is_road_underdog,
  hts.is_road_favorite,
  hts.result,
  hts.graded,
  hts.integrity_status,
  hts.profit_units,
  hts.profit_dollars_10,
  hts.roi_on_10_flat,
  hts.game_total_line,
  hts.over_odds,
  hts.under_odds,
  hts.is_total_over_bet,
  hts.is_total_under_bet,
  hpt.is_prime_time,
  hpt.broadcast_window,
  hsc.is_back_to_back,
  hdc.is_divisional_game,
  tpr.team_win_pct_pre_game,
  opr.team_win_pct_pre_game as opponent_win_pct_pre_game,
  tpr.team_above_500_pre_game,
  opr.team_above_500_pre_game as opponent_above_500_pre_game,
  hsh.previous_game_shutout,
  hsc.days_since_previous_game,
  hsc.previous_team_role,
  hpg.previous_moneyline_result,
  hpg.previous_over_result,
  hpg.previous_under_result,
  hsmc.segment_key,
  hsmc.is_spread_market,
  hsmc.is_total_market,
  hsmc.is_moneyline_market,
  'v8'::text as trends_build_version
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
 and hpg.team_role = hts.team_role
left join public.historical_prime_time_context_v1 hpt
  on hpt.canonical_game_id = hts.canonical_game_id
left join public.historical_divisional_context_v1 hdc
  on hdc.canonical_game_id = hts.canonical_game_id
left join public.historical_shutout_context_v1 hsh
  on hsh.canonical_game_id = hts.canonical_game_id
 and hsh.team_name = hts.team_name
 and hsh.team_role = hts.team_role
left join public.historical_segment_market_context_v1 hsmc
  on hsmc.candidate_id = hts.candidate_id;
