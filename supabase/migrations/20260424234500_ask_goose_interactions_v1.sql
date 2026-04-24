create table if not exists public.ask_goose_interactions_v1 (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text,
  user_id text,
  league text not null,
  question text not null,
  normalized_question text,
  looks_like_betting_question boolean not null default false,
  intent jsonb not null default '{}'::jsonb,
  answer jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  evidence_candidate_ids text[] not null default '{}'::text[],
  warnings text[] not null default '{}'::text[],
  parser_version text not null default 'ask_goose_deterministic_v1',
  model_used text,
  source_layer_version text not null default 'ask_goose_query_layer_v1',
  client_metadata jsonb not null default '{}'::jsonb
);

create index if not exists ask_goose_interactions_v1_created_at_idx
  on public.ask_goose_interactions_v1 (created_at desc);

create index if not exists ask_goose_interactions_v1_league_created_at_idx
  on public.ask_goose_interactions_v1 (league, created_at desc);

create index if not exists ask_goose_interactions_v1_betting_idx
  on public.ask_goose_interactions_v1 (looks_like_betting_question, created_at desc);
