create or replace view public.historical_team_game_index_v1 as
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

create or replace view public.historical_team_pregame_record_context_v1 as
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
    case
      when gr.team_role = 'home' then gme.home_team
      when gr.team_role = 'away' then gme.away_team
      else null::text
    end as result_team_name,
    case
      when gr.team_role = 'home' then gme.away_team
      when gr.team_role = 'away' then gme.home_team
      else null::text
    end as result_opponent_name,
    gmr.result,
    case when gmr.result = 'win' then 1 else 0 end as win_flag,
    case when gmr.result = 'loss' then 1 else 0 end as loss_flag,
    case when gmr.result = 'push' then 1 else 0 end as push_flag
  from game_rows gr
  left join public.historical_betting_markets_query_graded_v1 gmr
    on gmr.canonical_game_id = gr.canonical_game_id
   and gmr.team_role = gr.team_role
   and gmr.market_type = 'moneyline'
  left join public.goose_market_events gme
    on gme.event_id = gr.canonical_game_id
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

create or replace view public.historical_trends_question_surface_v1 as
select
  hts.*,
  null::boolean as is_prime_time,
  null::text as broadcast_window,
  null::boolean as is_back_to_back,
  null::boolean as is_divisional_game,
  tpr.team_win_pct_pre_game,
  opr.team_win_pct_pre_game as opponent_win_pct_pre_game,
  tpr.team_above_500_pre_game,
  opr.team_above_500_pre_game as opponent_above_500_pre_game,
  null::boolean as previous_game_shutout,
  'v2'::text as trends_build_version
from public.historical_team_market_summary_v1 hts
left join public.historical_team_pregame_record_context_v1 tpr
  on tpr.canonical_game_id = hts.canonical_game_id
 and tpr.team_role = hts.team_role
 and tpr.team_name = hts.team_name
left join public.historical_team_pregame_record_context_v1 opr
  on opr.canonical_game_id = hts.canonical_game_id
 and opr.team_name = hts.opponent_name
 and opr.opponent_name = hts.team_name;
