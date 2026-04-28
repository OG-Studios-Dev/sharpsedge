-- Join persisted public betting splits into the Ask Goose serving layer.
-- This intentionally uses conservative matching:
-- - team markets require home/away alignment
-- - totals can match the same two teams in either home/away order because over/under is game-level
-- - split rows are ranked so primary/latest/DK-style rows win when duplicate sources exist

create or replace function public.refresh_ask_goose_public_splits_v1(
  p_league text default null,
  p_start_date date default null,
  p_end_date date default null
)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
begin
  with split_ranked as (
    select
      s.*,
      regexp_replace(lower(coalesce(s.home_team_name, s.home_team_abbrev, '')), '[^a-z0-9]+', '', 'g') as s_home_norm,
      regexp_replace(lower(coalesce(s.away_team_name, s.away_team_abbrev, '')), '[^a-z0-9]+', '', 'g') as s_away_norm,
      row_number() over (
        partition by s.league, s.game_date, s.home_team_name, s.away_team_name, s.market_type, s.side
        order by
          coalesce(s.is_primary, false) desc,
          case lower(coalesce(s.source, ''))
            when 'action-network-dk' then 1
            when 'action-network-fd' then 2
            else 9
          end,
          s.snapshot_at desc,
          s.id desc
      ) as rn
    from public.public_betting_splits_v1 s
    where (p_league is null or s.league = p_league)
      and (p_start_date is null or s.game_date >= p_start_date)
      and (p_end_date is null or s.game_date <= p_end_date)
      and s.bets_percent is not null
      and s.handle_percent is not null
  ),
  splits as (
    select * from split_ranked where rn = 1
  ),
  matched as (
    select
      q.candidate_id,
      s.bets_percent,
      s.handle_percent,
      s.source,
      s.snapshot_at
    from public.ask_goose_query_layer_v1 q
    join splits s
      on s.league = q.league
     and s.game_date = q.event_date
     and s.market_type = coalesce(q.market_family, q.market_type)
     and (
       (
         s.market_type = 'total'
         and lower(coalesce(q.side, '')) like '%' || s.side || '%'
         and (
           (
             regexp_replace(lower(coalesce(s.home_team_name, s.home_team_abbrev, '')), '[^a-z0-9]+', '', 'g') like '%' || regexp_replace(lower(coalesce(q.home_team, '')), '[^a-z0-9]+', '', 'g') || '%'
             and regexp_replace(lower(coalesce(s.away_team_name, s.away_team_abbrev, '')), '[^a-z0-9]+', '', 'g') like '%' || regexp_replace(lower(coalesce(q.away_team, '')), '[^a-z0-9]+', '', 'g') || '%'
           )
           or
           (
             regexp_replace(lower(coalesce(s.home_team_name, s.home_team_abbrev, '')), '[^a-z0-9]+', '', 'g') like '%' || regexp_replace(lower(coalesce(q.away_team, '')), '[^a-z0-9]+', '', 'g') || '%'
             and regexp_replace(lower(coalesce(s.away_team_name, s.away_team_abbrev, '')), '[^a-z0-9]+', '', 'g') like '%' || regexp_replace(lower(coalesce(q.home_team, '')), '[^a-z0-9]+', '', 'g') || '%'
           )
         )
       )
       or
       (
         s.market_type in ('moneyline', 'spread')
         and lower(coalesce(q.team_role, '')) = s.side
         and regexp_replace(lower(coalesce(s.home_team_name, s.home_team_abbrev, '')), '[^a-z0-9]+', '', 'g') like '%' || regexp_replace(lower(coalesce(q.home_team, '')), '[^a-z0-9]+', '', 'g') || '%'
         and regexp_replace(lower(coalesce(s.away_team_name, s.away_team_abbrev, '')), '[^a-z0-9]+', '', 'g') like '%' || regexp_replace(lower(coalesce(q.away_team, '')), '[^a-z0-9]+', '', 'g') || '%'
       )
     )
    where (p_league is null or q.league = p_league)
      and (p_start_date is null or q.event_date >= p_start_date)
      and (p_end_date is null or q.event_date <= p_end_date)
  )
  update public.ask_goose_query_layer_v1 q
  set
    public_bets_pct = m.bets_percent,
    public_handle_pct = m.handle_percent,
    public_split_source = m.source,
    public_split_snapshot_at = m.snapshot_at
  from matched m
  where q.candidate_id = m.candidate_id;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
