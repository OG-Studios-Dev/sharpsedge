create or replace view public.dim_historical_games_v1 as
with support_events as (
  select
    cg.canonical_game_id,
    gme.event_id,
    gme.commence_time,
    gme.home_team_id,
    gme.away_team_id,
    row_number() over (
      partition by cg.canonical_game_id
      order by
        case when gme.event_id = cg.canonical_game_id then 0 else 1 end,
        case when gme.home_team_id is not null and gme.away_team_id is not null then 0 else 1 end,
        gme.commence_time desc nulls last,
        gme.event_id
    ) as rn
  from public.canonical_games cg
  left join public.goose_market_events gme
    on gme.event_id = cg.canonical_game_id
    or (
      gme.odds_api_event_id is not null
      and cg.source_event_ids @> to_jsonb(array[gme.odds_api_event_id])
    )
),
best_support as (
  select *
  from support_events
  where rn = 1
)
select
  cg.canonical_game_id,
  cg.sport,
  cg.league,
  case
    when cg.league = 'MLB' then extract(year from cg.event_date)::int::text
    when cg.league = 'NFL' then (
      case
        when extract(month from cg.event_date) >= 8 then extract(year from cg.event_date)::int
        else extract(year from cg.event_date)::int - 1
      end
    )::text
    when cg.league in ('NBA', 'NHL') then concat(
      case
        when extract(month from cg.event_date) >= 7 then extract(year from cg.event_date)::int
        else extract(year from cg.event_date)::int - 1
      end,
      '-',
      right((
        case
          when extract(month from cg.event_date) >= 7 then extract(year from cg.event_date)::int + 1
          else extract(year from cg.event_date)::int
        end
      )::text, 2)
    )
    else extract(year from cg.event_date)::int::text
  end as season,
  case
    when cg.league = 'MLB' then extract(year from cg.event_date)::int
    when cg.league = 'NFL' then case
      when extract(month from cg.event_date) >= 8 then extract(year from cg.event_date)::int
      else extract(year from cg.event_date)::int - 1
    end
    when cg.league in ('NBA', 'NHL') then case
      when extract(month from cg.event_date) >= 7 then extract(year from cg.event_date)::int
      else extract(year from cg.event_date)::int - 1
    end
    else extract(year from cg.event_date)::int
  end as season_year,
  cg.event_date,
  coalesce(cg.scheduled_start, bs.commence_time) as scheduled_start,
  cg.home_team,
  cg.away_team,
  cg.home_team_key,
  cg.away_team_key,
  bs.home_team_id,
  bs.away_team_id,
  cg.source_event_ids,
  cg.identity_confidence,
  null::boolean as is_divisional,
  null::integer as home_rest_days,
  null::integer as away_rest_days,
  null::boolean as home_back_to_back,
  null::boolean as away_back_to_back,
  'v1'::text as build_version
from public.canonical_games cg
left join best_support bs
  on bs.canonical_game_id = cg.canonical_game_id;

create or replace view public.fact_historical_market_sides_v1 as
with candidate_base as (
  select
    gmc.*
  from public.goose_market_candidates gmc
),
candidate_events as (
  select
    cb.*,
    gme.odds_api_event_id,
    gme.home_team_id as event_home_team_id,
    gme.away_team_id as event_away_team_id
  from candidate_base cb
  left join public.goose_market_events gme
    on gme.event_id = cb.event_id
),
candidate_games as (
  select
    ce.*,
    dhg.canonical_game_id,
    dhg.season,
    dhg.home_team,
    dhg.away_team,
    coalesce(dhg.home_team_id, ce.event_home_team_id) as home_team_id,
    coalesce(dhg.away_team_id, ce.event_away_team_id) as away_team_id
  from candidate_events ce
  left join public.dim_historical_games_v1 dhg
    on dhg.canonical_game_id = ce.event_id
    or (
      ce.odds_api_event_id is not null
      and dhg.source_event_ids @> to_jsonb(array[ce.odds_api_event_id])
    )
),
snapshot_support as (
  select
    cg.candidate_id,
    msp.canonical_market_key,
    msp.participant_key,
    msp.capture_window_phase,
    msp.is_opening_candidate,
    msp.is_closing_candidate,
    msp.source_limited,
    msp.coverage_flags,
    row_number() over (
      partition by cg.candidate_id
      order by
        case when msp.canonical_game_id = cg.canonical_game_id then 0 else 1 end,
        case when msp.book = cg.book then 0 else 1 end,
        case when msp.market_type = cg.market_type then 0 else 1 end,
        abs(extract(epoch from (msp.captured_at - cg.capture_ts))) asc nulls last,
        case when msp.line is not distinct from cg.line then 0 else 1 end,
        msp.id
    ) as rn
  from candidate_games cg
  left join public.market_snapshot_prices msp
    on msp.canonical_game_id = cg.canonical_game_id
   and msp.book = cg.book
),
best_snapshot_support as (
  select *
  from snapshot_support
  where rn = 1
),
classified as (
  select
    cg.*,
    bss.canonical_market_key,
    bss.participant_key,
    bss.capture_window_phase,
    coalesce(bss.is_opening_candidate, cg.is_opening, false) as opening_flag,
    coalesce(bss.is_closing_candidate, cg.is_closing, false) as closing_flag,
    bss.source_limited,
    bss.coverage_flags,
    case
      when cg.market_type = 'moneyline' then 'moneyline'
      when cg.market_type like 'spread%' then 'spread'
      when cg.market_type = 'total' or cg.market_type like 'total_%' then 'total'
      when cg.participant_type in ('player','golfer') then 'player_prop'
      when cg.participant_type = 'team' and cg.market_type not in ('moneyline','total') and cg.market_type not like 'spread%' then 'team_prop'
      else 'other'
    end as market_family,
    case
      when cg.participant_type in ('player','golfer') then 'player'
      when cg.market_type in ('moneyline','spread','total') then 'game'
      when cg.market_type like '%q1%' or cg.market_type like '%q2%' or cg.market_type like '%q3%' or cg.market_type like '%q4%' then 'segment'
      when coalesce(cg.submarket_type, '') ilike '%first%' or coalesce(cg.submarket_type, '') ilike '%period%' then 'segment'
      when cg.participant_type = 'team' and cg.market_type not in ('moneyline','spread','total') then 'team'
      else 'other'
    end as market_scope,
    case
      when cg.canonical_game_id is null then 'missing_game_link'
      when cg.market_type not in ('moneyline','spread') and cg.participant_type <> 'team' then 'unsupported_market_for_team_role'
      when cg.participant_id is not null and cg.participant_id = cg.home_team_id then 'ok'
      when cg.participant_id is not null and cg.participant_id = cg.away_team_id then 'ok'
      when lower(coalesce(cg.participant_name, '')) = lower(coalesce(cg.home_team, '')) then 'ok'
      when lower(coalesce(cg.participant_name, '')) = lower(coalesce(cg.away_team, '')) then 'ok'
      else 'unresolved_team_side'
    end as classification_status,
    case
      when cg.participant_id is not null and cg.participant_id = cg.home_team_id then true
      when lower(coalesce(cg.participant_name, '')) = lower(coalesce(cg.home_team, '')) then true
      else false
    end as raw_home_match,
    case
      when cg.participant_id is not null and cg.participant_id = cg.away_team_id then true
      when lower(coalesce(cg.participant_name, '')) = lower(coalesce(cg.away_team, '')) then true
      else false
    end as raw_away_match
  from candidate_games cg
  left join best_snapshot_support bss
    on bss.candidate_id = cg.candidate_id
)
select
  candidate_id,
  canonical_game_id,
  event_id,
  sport,
  league,
  season,
  event_date,
  home_team,
  away_team,
  home_team_id,
  away_team_id,
  market_type,
  submarket_type,
  market_family,
  market_scope,
  participant_type,
  participant_id,
  participant_name,
  opponent_id,
  opponent_name,
  side,
  line,
  odds,
  sportsbook,
  capture_ts as captured_at,
  opening_flag,
  closing_flag,
  capture_window_phase,
  canonical_market_key,
  participant_key,
  source,
  source_market_id,
  source_limited,
  coverage_flags,
  case when classification_status = 'ok' and raw_home_match then true else null end as bet_on_home_team,
  case when classification_status = 'ok' and raw_away_match then true else null end as bet_on_away_team,
  case
    when classification_status = 'ok' and raw_home_match then 'home'
    when classification_status = 'ok' and raw_away_match then 'away'
    else null
  end as team_role,
  case
    when classification_status = 'ok' and raw_home_match then 'away'
    when classification_status = 'ok' and raw_away_match then 'home'
    else null
  end as opponent_role,
  null::text as favorite_team_id,
  null::text as underdog_team_id,
  classification_status,
  'v1'::text as build_version
from classified;

create or replace view public.historical_market_results_enriched_v1 as
select
  fms.candidate_id,
  fms.canonical_game_id,
  fms.event_id,
  fms.sport,
  fms.league,
  fms.season,
  fms.event_date,
  fms.market_family,
  fms.market_scope,
  fms.participant_type,
  fms.side,
  fms.line,
  fms.odds,
  fms.sportsbook,
  fms.closing_flag,
  gmr.result,
  gmr.integrity_status,
  gmr.settlement_ts,
  gmr.grade_source,
  gmr.grading_notes,
  gmr.actual_stat,
  gmr.actual_stat_text,
  gmr.closing_line,
  coalesce(gmr.closing_odds, case when fms.closing_flag then fms.odds else null end) as closing_odds,
  case
    when gmr.result in ('win','loss','push','void','cancelled')
     and gmr.integrity_status in ('ok','void','cancelled')
    then true
    else false
  end as graded,
  case
    when not (
      gmr.result in ('win','loss','push','void','cancelled')
      and gmr.integrity_status in ('ok','void','cancelled')
    ) then null::numeric
    when gmr.result = 'win' and fms.odds > 0 then round((fms.odds / 100.0)::numeric, 4)
    when gmr.result = 'win' and fms.odds < 0 then round((100.0 / abs(fms.odds))::numeric, 4)
    when gmr.result = 'loss' then -1.0
    when gmr.result in ('push','void','cancelled') then 0.0
    else null::numeric
  end as profit_units,
  case
    when not (
      gmr.result in ('win','loss','push','void','cancelled')
      and gmr.integrity_status in ('ok','void','cancelled')
    ) then null::numeric
    when gmr.result = 'win' and fms.odds > 0 then round(((fms.odds / 100.0) * 10.0)::numeric, 4)
    when gmr.result = 'win' and fms.odds < 0 then round(((100.0 / abs(fms.odds)) * 10.0)::numeric, 4)
    when gmr.result = 'loss' then -10.0
    when gmr.result in ('push','void','cancelled') then 0.0
    else null::numeric
  end as profit_dollars_10,
  case
    when not (
      gmr.result in ('win','loss','push','void','cancelled')
      and gmr.integrity_status in ('ok','void','cancelled')
    ) then null::numeric
    when gmr.result = 'win' and fms.odds > 0 then round((fms.odds / 100.0)::numeric, 4)
    when gmr.result = 'win' and fms.odds < 0 then round((100.0 / abs(fms.odds))::numeric, 4)
    when gmr.result = 'loss' then -1.0
    when gmr.result in ('push','void','cancelled') then 0.0
    else null::numeric
  end as roi_on_10_flat,
  case
    when gmr.candidate_id is null then 'no_result_row'
    when gmr.integrity_status = 'pending' then 'pending'
    when gmr.integrity_status = 'manual_review' then 'manual_review'
    when gmr.integrity_status = 'unresolvable' then 'unresolvable'
    when gmr.integrity_status = 'postponed' then 'postponed'
    when gmr.result in ('win','loss','push','void','cancelled')
      and gmr.integrity_status in ('ok','void','cancelled') then 'graded'
    else 'excluded'
  end as profit_status,
  'v1'::text as build_version
from public.fact_historical_market_sides_v1 fms
left join public.goose_market_results gmr
  on gmr.candidate_id = fms.candidate_id;

create or replace view public.historical_betting_markets_gold_v1 as
select
  hmr.candidate_id,
  hmr.canonical_game_id,
  hmr.event_id,
  hmr.sport,
  hmr.league,
  hmr.season,
  hmr.event_date,
  fms.home_team,
  fms.away_team,
  dhg.is_divisional,
  dhg.home_rest_days,
  dhg.away_rest_days,
  dhg.home_back_to_back,
  dhg.away_back_to_back,
  fms.market_type,
  fms.submarket_type,
  hmr.market_family,
  hmr.market_scope,
  hmr.participant_type,
  fms.participant_id,
  fms.participant_name,
  fms.opponent_id,
  fms.opponent_name,
  hmr.side,
  hmr.line,
  hmr.odds,
  hmr.sportsbook,
  fms.captured_at,
  fms.opening_flag,
  hmr.closing_flag,
  fms.capture_window_phase,
  fms.canonical_market_key,
  fms.participant_key,
  fms.bet_on_home_team,
  fms.bet_on_away_team,
  fms.team_role,
  fms.opponent_role,
  fms.favorite_team_id,
  fms.underdog_team_id,
  hmr.result,
  hmr.graded,
  hmr.integrity_status,
  hmr.settlement_ts,
  hmr.grade_source,
  hmr.grading_notes,
  hmr.actual_stat,
  hmr.actual_stat_text,
  hmr.closing_line,
  hmr.closing_odds,
  hmr.profit_units,
  hmr.profit_dollars_10,
  hmr.roi_on_10_flat,
  fms.classification_status,
  hmr.profit_status,
  dhg.identity_confidence,
  dhg.source_event_ids,
  fms.source,
  fms.source_market_id,
  fms.source_limited,
  fms.coverage_flags,
  'v1'::text as build_version
from public.historical_market_results_enriched_v1 hmr
left join public.fact_historical_market_sides_v1 fms
  on fms.candidate_id = hmr.candidate_id
left join public.dim_historical_games_v1 dhg
  on dhg.canonical_game_id = hmr.canonical_game_id;

create or replace view public.historical_betting_markets_gold_graded_v1 as
select *
from public.historical_betting_markets_gold_v1
where graded = true
  and profit_status = 'graded';
