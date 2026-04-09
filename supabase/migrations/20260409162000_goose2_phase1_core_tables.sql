create table if not exists public.goose_market_events (
  event_id text primary key,
  sport text not null,
  league text not null,
  event_date date not null,
  commence_time timestamptz,
  home_team text,
  away_team text,
  home_team_id text,
  away_team_id text,
  event_label text not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','in_progress','final','postponed','cancelled','unknown')),
  source text not null,
  source_event_id text,
  odds_api_event_id text,
  venue text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists goose_market_events_source_unique_idx
  on public.goose_market_events (source, source_event_id)
  where source_event_id is not null;

create index if not exists goose_market_events_sport_date_idx
  on public.goose_market_events (sport, event_date, commence_time);

create index if not exists goose_market_events_league_date_idx
  on public.goose_market_events (league, event_date, commence_time);

create table if not exists public.goose_market_candidates (
  candidate_id text primary key,
  event_id text not null references public.goose_market_events(event_id) on delete cascade,
  sport text not null,
  league text not null,
  event_date date not null,
  market_type text not null,
  submarket_type text,
  participant_type text not null
    check (participant_type in ('team','player','golfer','pairing','field','unknown')),
  participant_id text,
  participant_name text,
  opponent_id text,
  opponent_name text,
  side text not null,
  line numeric,
  odds numeric not null,
  book text not null,
  sportsbook text generated always as (book) stored,
  capture_ts timestamptz not null,
  snapshot_id text references public.market_snapshots(id) on delete set null,
  event_snapshot_id text references public.market_snapshot_events(id) on delete set null,
  source text not null,
  source_market_id text,
  is_best_price boolean not null default false,
  is_opening boolean not null default false,
  is_closing boolean not null default false,
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists goose_market_candidates_natural_unique_idx
  on public.goose_market_candidates (
    event_id,
    market_type,
    coalesce(submarket_type, ''),
    coalesce(participant_id, ''),
    coalesce(participant_name, ''),
    side,
    coalesce(line, 0),
    book,
    capture_ts
  );

create index if not exists goose_market_candidates_event_idx
  on public.goose_market_candidates (event_id, capture_ts desc);

create index if not exists goose_market_candidates_lookup_idx
  on public.goose_market_candidates (
    sport, event_date, market_type, participant_name, book, capture_ts desc
  );

create index if not exists goose_market_candidates_snapshot_idx
  on public.goose_market_candidates (snapshot_id, event_snapshot_id);

create index if not exists goose_market_candidates_best_idx
  on public.goose_market_candidates (event_id, market_type, is_best_price, capture_ts desc);

create table if not exists public.goose_market_results (
  candidate_id text primary key references public.goose_market_candidates(candidate_id) on delete cascade,
  event_id text not null references public.goose_market_events(event_id) on delete cascade,
  result text not null
    check (result in ('win','loss','push','void','pending','ungradeable','cancelled')),
  actual_stat numeric,
  actual_stat_text text,
  closing_line numeric,
  closing_odds numeric,
  settlement_ts timestamptz,
  grade_source text,
  integrity_status text not null default 'pending'
    check (integrity_status in ('pending','ok','postponed','void','unresolvable','cancelled','manual_review')),
  grading_notes text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists goose_market_results_event_idx
  on public.goose_market_results (event_id, settlement_ts desc);

create index if not exists goose_market_results_result_idx
  on public.goose_market_results (result, integrity_status);

create table if not exists public.goose_feature_rows (
  feature_row_id text primary key,
  candidate_id text not null references public.goose_market_candidates(candidate_id) on delete cascade,
  event_id text not null references public.goose_market_events(event_id) on delete cascade,
  sport text not null,
  league text not null,
  market_type text not null,
  feature_version text not null,
  feature_payload jsonb not null default '{}'::jsonb,
  system_flags jsonb not null default '{}'::jsonb,
  source_chain jsonb not null default '[]'::jsonb,
  generated_ts timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists goose_feature_rows_candidate_version_uidx
  on public.goose_feature_rows (candidate_id, feature_version);

create index if not exists goose_feature_rows_market_idx
  on public.goose_feature_rows (sport, market_type, generated_ts desc);

create table if not exists public.goose_decision_log (
  decision_id text primary key,
  candidate_id text not null references public.goose_market_candidates(candidate_id) on delete cascade,
  event_id text not null references public.goose_market_events(event_id) on delete cascade,
  feature_row_id text references public.goose_feature_rows(feature_row_id) on delete set null,
  upstream_goose_model_pick_id uuid references public.goose_model_picks(id) on delete set null,
  decision_ts timestamptz not null,
  model_version text,
  policy_version text not null,
  bet_decision boolean not null,
  recommended_tier text,
  stake_suggestion numeric,
  edge numeric,
  p_true numeric,
  calibrated_p_true numeric,
  confidence_band text,
  reason_rejected text,
  rejection_reasons jsonb not null default '[]'::jsonb,
  explanation jsonb not null default '{}'::jsonb,
  source text not null default 'goose2',
  created_at timestamptz not null default now()
);

create index if not exists goose_decision_log_candidate_idx
  on public.goose_decision_log (candidate_id, decision_ts desc);

create index if not exists goose_decision_log_decision_idx
  on public.goose_decision_log (bet_decision, decision_ts desc);

create index if not exists goose_decision_log_model_policy_idx
  on public.goose_decision_log (model_version, policy_version, decision_ts desc);

alter table public.goose_market_events enable row level security;
alter table public.goose_market_candidates enable row level security;
alter table public.goose_market_results enable row level security;
alter table public.goose_feature_rows enable row level security;
alter table public.goose_decision_log enable row level security;

drop policy if exists goose_market_events_read on public.goose_market_events;
drop policy if exists goose_market_events_service_write on public.goose_market_events;
drop policy if exists goose_market_candidates_read on public.goose_market_candidates;
drop policy if exists goose_market_candidates_service_write on public.goose_market_candidates;
drop policy if exists goose_market_results_read on public.goose_market_results;
drop policy if exists goose_market_results_service_write on public.goose_market_results;
drop policy if exists goose_feature_rows_read on public.goose_feature_rows;
drop policy if exists goose_feature_rows_service_write on public.goose_feature_rows;
drop policy if exists goose_decision_log_read on public.goose_decision_log;
drop policy if exists goose_decision_log_service_write on public.goose_decision_log;

create policy goose_market_events_read
  on public.goose_market_events
  for select
  using (true);

create policy goose_market_events_service_write
  on public.goose_market_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy goose_market_candidates_read
  on public.goose_market_candidates
  for select
  using (true);

create policy goose_market_candidates_service_write
  on public.goose_market_candidates
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy goose_market_results_read
  on public.goose_market_results
  for select
  using (true);

create policy goose_market_results_service_write
  on public.goose_market_results
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy goose_feature_rows_read
  on public.goose_feature_rows
  for select
  using (true);

create policy goose_feature_rows_service_write
  on public.goose_feature_rows
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy goose_decision_log_read
  on public.goose_decision_log
  for select
  using (true);

create policy goose_decision_log_service_write
  on public.goose_decision_log
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
