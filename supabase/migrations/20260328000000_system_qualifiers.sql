-- System qualifiers + grading persistence
-- Durable storage for system qualifier rows, outcomes, and performance history.
-- Graceful: routes fall back to JSON file if this table is absent.

create table if not exists public.system_qualifiers (
  id text primary key,
  system_id text not null,
  system_slug text not null,
  system_name text not null,
  game_date date not null,
  logged_at timestamptz not null default now(),
  qualifier_id text not null,
  record_kind text not null default 'qualifier'
    check (record_kind in ('qualifier', 'alert', 'progression')),
  matchup text not null,
  road_team text not null,
  home_team text not null,
  qualified_team text,
  opponent_team text,
  league text,
  market_type text,
  action_label text,
  action_side text,
  flat_stake_units numeric not null default 1,
  -- settlement
  settlement_status text not null default 'pending'
    check (settlement_status in ('pending', 'settled', 'ungradeable', 'not_applicable')),
  outcome text not null default 'pending'
    check (outcome in ('win', 'loss', 'push', 'pending', 'ungradeable', 'not_applicable')),
  net_units numeric,
  settled_at timestamptz,
  graded_at timestamptz,
  grading_source text,      -- e.g. 'nhl-api-final', 'mlb-api-final', 'espn-quarter-scores'
  grading_notes text,
  -- odds at qualification time
  qualifier_odds numeric,
  -- provenance
  source text,
  notes text,
  provenance jsonb,         -- full SystemTrackingRecord snapshot frozen at qualifier time
  -- tracking
  last_synced_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- indexes for common queries
create index if not exists system_qualifiers_system_id_idx on public.system_qualifiers(system_id);
create index if not exists system_qualifiers_game_date_idx on public.system_qualifiers(game_date);
create index if not exists system_qualifiers_settlement_status_idx on public.system_qualifiers(settlement_status);
create index if not exists system_qualifiers_outcome_idx on public.system_qualifiers(outcome);
create index if not exists system_qualifiers_system_date_idx on public.system_qualifiers(system_id, game_date);

-- RLS: public read (performance stats visible to users), authenticated write
alter table public.system_qualifiers enable row level security;

create policy "system_qualifiers_public_read"
  on public.system_qualifiers for select
  using (true);

create policy "system_qualifiers_service_write"
  on public.system_qualifiers for all
  using (auth.role() = 'service_role');

-- System performance summary view (materialized per-system stats)
create or replace view public.system_performance_summary as
select
  system_id,
  system_slug,
  system_name,
  league,
  count(*) as qualifiers_logged,
  count(*) filter (where settlement_status = 'settled') as graded_qualifiers,
  count(*) filter (where outcome = 'win') as wins,
  count(*) filter (where outcome = 'loss') as losses,
  count(*) filter (where outcome = 'push') as pushes,
  count(*) filter (where outcome = 'pending') as pending,
  count(*) filter (where outcome = 'ungradeable') as ungradeable,
  case
    when count(*) filter (where outcome in ('win','loss')) > 0
    then round(
      count(*) filter (where outcome = 'win')::numeric
      / count(*) filter (where outcome in ('win','loss'))::numeric * 100,
      1
    )
    else null
  end as win_pct,
  sum(net_units) filter (where settlement_status = 'settled') as flat_net_units,
  min(game_date) as first_qualifier_date,
  max(game_date) as last_qualifier_date
from public.system_qualifiers
where settlement_status != 'not_applicable'
group by system_id, system_slug, system_name, league;
