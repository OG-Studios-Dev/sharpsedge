-- Goose Learning Lab: isolated shadow space for learned models.
-- Purpose: let the learning model declare readiness, record its own shadow picks,
-- and keep its own record for clean comparison against production daily picks.
-- This intentionally does NOT write to production pick tables or goose_model_picks.

create table if not exists public.goose_learning_lab_spaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  status text not null default 'learning_only', -- learning_only | recording_ready | recording_active | paused | archived
  active_model_version text references public.goose_learning_model_versions(model_version) on delete set null,
  readiness_rules jsonb not null default jsonb_build_object(
    'min_train_examples', 50000,
    'min_test_examples', 25000,
    'min_candidate_signals', 50,
    'min_eligible_signals', 1,
    'min_shadow_picks_for_comparison', 100,
    'max_sanity_rejected_share_for_auto_ready', 0.75
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.goose_learning_lab_spaces (slug, name, description, status, active_model_version, notes)
values (
  'goose-shadow-lab',
  'Goose Shadow Learning Lab',
  'Separate learning-model space. It can study historical DB, declare readiness, record shadow-only picks, and compare against production without touching production pick generation.',
  'learning_only',
  'shadow-2026-04-25-v1-sanity',
  'Created after first shadow backtest found artifact-looking edges. Recording is gated until readiness rules pass.'
)
on conflict (slug) do update set
  active_model_version = coalesce(excluded.active_model_version, public.goose_learning_lab_spaces.active_model_version),
  updated_at = now();

create table if not exists public.goose_learning_lab_readiness_snapshots (
  id uuid primary key default gen_random_uuid(),
  lab_slug text not null references public.goose_learning_lab_spaces(slug) on delete cascade,
  model_version text references public.goose_learning_model_versions(model_version) on delete set null,
  status text not null, -- learning_only | recording_ready | recording_active | blocked
  ready_to_record boolean not null default false,
  ready_to_compare boolean not null default false,
  train_examples integer not null default 0,
  test_examples integer not null default 0,
  candidate_signals integer not null default 0,
  eligible_signals integer not null default 0,
  sanity_rejected_signals integer not null default 0,
  shadow_picks integer not null default 0,
  settled_shadow_picks integer not null default 0,
  production_comparison_picks integer not null default 0,
  reasons text[] not null default '{}',
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists goose_learning_lab_readiness_latest_idx
  on public.goose_learning_lab_readiness_snapshots (lab_slug, created_at desc);

create table if not exists public.goose_learning_shadow_picks (
  id uuid primary key default gen_random_uuid(),
  lab_slug text not null references public.goose_learning_lab_spaces(slug) on delete cascade,
  model_version text references public.goose_learning_model_versions(model_version) on delete set null,
  pick_date date not null,
  sport text not null,
  league text,
  candidate_id text,
  canonical_game_id text,
  event_id text,
  pick_label text not null,
  market_family text not null,
  market_type text,
  side text,
  line numeric,
  odds numeric,
  sportsbook text,
  team_name text,
  opponent_name text,
  signal_keys text[] not null default '{}',
  model_score numeric,
  confidence_score numeric,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'recorded', -- recorded | settled | void | rejected
  result text not null default 'pending', -- pending | win | loss | push | void
  profit_units numeric,
  production_pick_id text,
  production_pick_label text,
  comparison_bucket text, -- same_side | opposite_side | no_production_match | unmatched
  recorded_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (lab_slug, model_version, candidate_id)
);

create index if not exists goose_learning_shadow_picks_lab_date_idx
  on public.goose_learning_shadow_picks (lab_slug, pick_date desc, sport);

create index if not exists goose_learning_shadow_picks_record_idx
  on public.goose_learning_shadow_picks (lab_slug, result, status);

create or replace view public.goose_learning_lab_latest_readiness_v1 as
select distinct on (s.lab_slug)
  s.*
from public.goose_learning_lab_readiness_snapshots s
order by s.lab_slug, s.created_at desc;

create or replace view public.goose_learning_shadow_record_v1 as
select
  lab_slug,
  model_version,
  sport,
  market_family,
  count(*) as total_picks,
  count(*) filter (where result <> 'pending') as settled_picks,
  count(*) filter (where result = 'win') as wins,
  count(*) filter (where result = 'loss') as losses,
  count(*) filter (where result = 'push') as pushes,
  round((count(*) filter (where result = 'win')::numeric / nullif(count(*) filter (where result in ('win','loss')), 0)) * 100, 2) as win_rate,
  round(sum(coalesce(profit_units, 0)), 4) as units,
  round((sum(coalesce(profit_units, 0)) / nullif(count(*) filter (where result <> 'pending'), 0)) * 100, 2) as roi_per_settled_pick,
  min(pick_date) as first_pick_date,
  max(pick_date) as last_pick_date
from public.goose_learning_shadow_picks
group by lab_slug, model_version, sport, market_family;

create or replace view public.goose_learning_lab_status_v1 as
with lab as (
  select * from public.goose_learning_lab_spaces where slug = 'goose-shadow-lab'
), model as (
  select m.*
  from public.goose_learning_model_versions m
  join lab l on l.active_model_version = m.model_version
), cand as (
  select
    c.model_version,
    count(*)::int as candidate_signals,
    count(*) filter (where c.promotion_status = 'eligible')::int as eligible_signals,
    count(*) filter (where c.rejection_reason ilike 'Rejected by sanity gate:%')::int as sanity_rejected_signals
  from public.goose_signal_candidates_v1 c
  join model m on m.model_version = c.model_version
  group by c.model_version
), picks as (
  select
    p.lab_slug,
    count(*)::int as shadow_picks,
    count(*) filter (where p.result <> 'pending')::int as settled_shadow_picks
  from public.goose_learning_shadow_picks p
  join lab l on l.slug = p.lab_slug
  group by p.lab_slug
), status_calc as (
  select
    l.slug as lab_slug,
    l.name,
    l.status as lab_status,
    l.active_model_version as model_version,
    coalesce((m.metrics->>'trainExamples')::int, 0) as train_examples,
    coalesce((m.metrics->>'testExamples')::int, 0) as test_examples,
    coalesce(c.candidate_signals, 0) as candidate_signals,
    coalesce(c.eligible_signals, 0) as eligible_signals,
    coalesce(c.sanity_rejected_signals, 0) as sanity_rejected_signals,
    coalesce(p.shadow_picks, 0) as shadow_picks,
    coalesce(p.settled_shadow_picks, 0) as settled_shadow_picks,
    l.readiness_rules,
    m.metrics as model_metrics
  from lab l
  left join model m on true
  left join cand c on c.model_version = m.model_version
  left join picks p on p.lab_slug = l.slug
)
select
  *,
  (
    train_examples >= coalesce((readiness_rules->>'min_train_examples')::int, 50000)
    and test_examples >= coalesce((readiness_rules->>'min_test_examples')::int, 25000)
    and candidate_signals >= coalesce((readiness_rules->>'min_candidate_signals')::int, 50)
    and eligible_signals >= coalesce((readiness_rules->>'min_eligible_signals')::int, 1)
  ) as ready_to_record,
  (
    settled_shadow_picks >= coalesce((readiness_rules->>'min_shadow_picks_for_comparison')::int, 100)
  ) as ready_to_compare,
  array_remove(array[
    case when train_examples < coalesce((readiness_rules->>'min_train_examples')::int, 50000) then 'Needs more training examples' end,
    case when test_examples < coalesce((readiness_rules->>'min_test_examples')::int, 25000) then 'Needs more out-of-sample test examples' end,
    case when candidate_signals < coalesce((readiness_rules->>'min_candidate_signals')::int, 50) then 'Needs more candidate signals' end,
    case when eligible_signals < coalesce((readiness_rules->>'min_eligible_signals')::int, 1) then 'No sanity-clean eligible signals yet' end,
    case when settled_shadow_picks < coalesce((readiness_rules->>'min_shadow_picks_for_comparison')::int, 100) then 'Needs more settled shadow picks before production comparison' end
  ], null) as blockers
from status_calc;
