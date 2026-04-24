create or replace function public.grade_ask_goose_game_markets_from_event_scores_v1(
  p_league text,
  p_start_date date default null,
  p_end_date date default null
)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
  v_league text := upper(p_league);
begin
  if v_league not in ('NHL', 'NBA', 'MLB', 'NFL') then
    raise exception 'grade_ask_goose_game_markets_from_event_scores_v1 supports NHL/NBA/MLB/NFL, got %', p_league;
  end if;

  with final_events as (
    select
      gme.event_id,
      gme.league,
      gme.event_date,
      gme.home_team,
      gme.away_team,
      lower(regexp_replace(coalesce(gme.home_team, ''), '[^a-z0-9]+', '', 'g')) as home_norm,
      lower(regexp_replace(coalesce(gme.away_team, ''), '[^a-z0-9]+', '', 'g')) as away_norm,
      nullif(gme.metadata #>> '{teams,home,score}', '')::numeric as home_score,
      nullif(gme.metadata #>> '{teams,away,score}', '')::numeric as away_score,
      gme.metadata as event_metadata
    from public.goose_market_events gme
    where gme.league = v_league
      and gme.status = 'final'
      and (p_start_date is null or gme.event_date >= p_start_date)
      and (p_end_date is null or gme.event_date <= p_end_date)
      and (gme.metadata #>> '{teams,home,score}') is not null
      and (gme.metadata #>> '{teams,away,score}') is not null
  ), event_scores as (
    select distinct on (q.candidate_id)
      q.candidate_id,
      q.event_id as query_event_id,
      q.league,
      q.market_family,
      q.market_type,
      q.market_scope,
      q.team_role,
      q.team_name,
      q.opponent_name,
      q.side,
      q.line,
      q.odds,
      fe.event_id as score_event_id,
      fe.home_score,
      fe.away_score,
      fe.event_metadata
    from public.ask_goose_query_layer_v1 q
    join final_events fe
      on fe.league = q.league
     and fe.event_date = q.event_date
     and (
       fe.event_id = q.event_id
       or (
         lower(regexp_replace(coalesce(q.home_team, ''), '[^a-z0-9]+', '', 'g')) in (fe.home_norm, fe.away_norm)
         and lower(regexp_replace(coalesce(q.away_team, ''), '[^a-z0-9]+', '', 'g')) in (fe.home_norm, fe.away_norm)
       )
       or (
         lower(regexp_replace(coalesce(q.team_name, ''), '[^a-z0-9]+', '', 'g')) in (fe.home_norm, fe.away_norm)
         and lower(regexp_replace(coalesce(q.opponent_name, ''), '[^a-z0-9]+', '', 'g')) in (fe.home_norm, fe.away_norm)
       )
     )
    where q.league = v_league
      and (p_start_date is null or q.event_date >= p_start_date)
      and (p_end_date is null or q.event_date <= p_end_date)
      and q.market_scope = 'game'
      and q.market_family in ('moneyline', 'spread', 'total')
    order by q.candidate_id, (fe.event_id = q.event_id) desc, fe.event_id
  ), gradeable as (
    select
      es.*,
      case
        when lower(regexp_replace(coalesce(es.team_name, ''), '[^a-z0-9]+', '', 'g')) = lower(regexp_replace(coalesce(es.event_metadata #>> '{teams,home,names,long}', ''), '[^a-z0-9]+', '', 'g')) then es.home_score
        when lower(regexp_replace(coalesce(es.team_name, ''), '[^a-z0-9]+', '', 'g')) = lower(regexp_replace(coalesce(es.event_metadata #>> '{teams,home,names,medium}', ''), '[^a-z0-9]+', '', 'g')) then es.home_score
        when lower(regexp_replace(coalesce(es.team_name, ''), '[^a-z0-9]+', '', 'g')) = lower(regexp_replace(coalesce(es.event_metadata #>> '{teams,away,names,long}', ''), '[^a-z0-9]+', '', 'g')) then es.away_score
        when lower(regexp_replace(coalesce(es.team_name, ''), '[^a-z0-9]+', '', 'g')) = lower(regexp_replace(coalesce(es.event_metadata #>> '{teams,away,names,medium}', ''), '[^a-z0-9]+', '', 'g')) then es.away_score
        when es.team_role = 'home' then es.home_score
        when es.team_role = 'away' then es.away_score
        else null::numeric
      end as team_score,
      case
        when lower(regexp_replace(coalesce(es.team_name, ''), '[^a-z0-9]+', '', 'g')) = lower(regexp_replace(coalesce(es.event_metadata #>> '{teams,home,names,long}', ''), '[^a-z0-9]+', '', 'g')) then es.away_score
        when lower(regexp_replace(coalesce(es.team_name, ''), '[^a-z0-9]+', '', 'g')) = lower(regexp_replace(coalesce(es.event_metadata #>> '{teams,home,names,medium}', ''), '[^a-z0-9]+', '', 'g')) then es.away_score
        when lower(regexp_replace(coalesce(es.team_name, ''), '[^a-z0-9]+', '', 'g')) = lower(regexp_replace(coalesce(es.event_metadata #>> '{teams,away,names,long}', ''), '[^a-z0-9]+', '', 'g')) then es.home_score
        when lower(regexp_replace(coalesce(es.team_name, ''), '[^a-z0-9]+', '', 'g')) = lower(regexp_replace(coalesce(es.event_metadata #>> '{teams,away,names,medium}', ''), '[^a-z0-9]+', '', 'g')) then es.home_score
        when es.team_role = 'home' then es.away_score
        when es.team_role = 'away' then es.home_score
        else null::numeric
      end as opponent_score,
      (es.home_score + es.away_score) as total_score
    from event_scores es
  ), graded as (
    select
      g.*,
      case
        when g.market_family = 'moneyline' and g.team_score is not null and g.team_score > g.opponent_score then 'win'
        when g.market_family = 'moneyline' and g.team_score is not null and g.team_score < g.opponent_score then 'loss'
        when g.market_family = 'moneyline' and g.team_score is not null and g.team_score = g.opponent_score then 'push'
        when g.market_family = 'total' and g.line is not null and lower(coalesce(g.side, '')) = 'over' and g.total_score > g.line then 'win'
        when g.market_family = 'total' and g.line is not null and lower(coalesce(g.side, '')) = 'over' and g.total_score < g.line then 'loss'
        when g.market_family = 'total' and g.line is not null and lower(coalesce(g.side, '')) = 'under' and g.total_score < g.line then 'win'
        when g.market_family = 'total' and g.line is not null and lower(coalesce(g.side, '')) = 'under' and g.total_score > g.line then 'loss'
        when g.market_family = 'total' and g.line is not null and lower(coalesce(g.side, '')) in ('over','under') and g.total_score = g.line then 'push'
        when g.market_family = 'spread' and g.line is not null and g.team_score is not null and (g.team_score + g.line) > g.opponent_score then 'win'
        when g.market_family = 'spread' and g.line is not null and g.team_score is not null and (g.team_score + g.line) < g.opponent_score then 'loss'
        when g.market_family = 'spread' and g.line is not null and g.team_score is not null and (g.team_score + g.line) = g.opponent_score then 'push'
        else 'ungradeable'
      end as computed_result,
      case
        when g.market_family = 'spread' and g.line is null then 'spread line missing; cannot grade from final score'
        when g.market_family = 'total' and g.line is null then 'total line missing; cannot grade from final score'
        when g.market_family in ('moneyline','spread') and g.team_score is null then 'team identity missing; cannot grade from final score'
        else 'graded from matched goose_market_events.metadata team scores'
      end as computed_note
    from gradeable g
  )
  insert into public.goose_market_results (
    candidate_id,
    event_id,
    result,
    actual_stat,
    actual_stat_text,
    closing_line,
    closing_odds,
    settlement_ts,
    grade_source,
    integrity_status,
    grading_notes,
    source_payload,
    updated_at
  )
  select
    gr.candidate_id,
    gr.query_event_id,
    gr.computed_result,
    case when gr.market_family = 'total' then gr.total_score else gr.team_score end,
    concat('home=', gr.home_score::text, ', away=', gr.away_score::text),
    gr.line,
    gr.odds,
    now(),
    'ask_goose_event_score_v2_matchup',
    case when gr.computed_result = 'ungradeable' then 'unresolvable' else 'ok' end,
    gr.computed_note,
    jsonb_build_object(
      'league', gr.league,
      'score_event_id', gr.score_event_id,
      'query_event_id', gr.query_event_id,
      'market_family', gr.market_family,
      'market_type', gr.market_type,
      'market_scope', gr.market_scope,
      'team_role', gr.team_role,
      'team_name', gr.team_name,
      'opponent_name', gr.opponent_name,
      'side', gr.side,
      'line', gr.line,
      'odds', gr.odds,
      'home_score', gr.home_score,
      'away_score', gr.away_score
    ),
    now()
  from graded gr
  on conflict (candidate_id) do update set
    result = excluded.result,
    actual_stat = excluded.actual_stat,
    actual_stat_text = excluded.actual_stat_text,
    closing_line = excluded.closing_line,
    closing_odds = excluded.closing_odds,
    settlement_ts = excluded.settlement_ts,
    grade_source = excluded.grade_source,
    integrity_status = excluded.integrity_status,
    grading_notes = excluded.grading_notes,
    source_payload = excluded.source_payload,
    updated_at = now()
  where public.goose_market_results.integrity_status in ('pending', 'unresolvable', 'manual_review')
     or public.goose_market_results.grade_source in ('ask_goose_event_score_v1','ask_goose_event_score_v2_matchup');

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
