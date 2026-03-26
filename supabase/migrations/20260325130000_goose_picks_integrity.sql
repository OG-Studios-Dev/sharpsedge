-- ============================================================
-- Add integrity_status and actual_result to goose_model_picks
-- integrity_status tracks resolution quality:
--   null        = not yet assessed
--   ok          = resolved cleanly
--   unresolvable = no game found after attempts; permanent skip
--   postponed   = game postponed; retry next day
--   void        = DNP / player scratch; units = 0, no weight update
-- actual_result stores what actually happened (score, stat, etc.)
-- ============================================================

alter table goose_model_picks
  add column if not exists integrity_status text,
  add column if not exists actual_result    text;

create index if not exists goose_model_picks_integrity_idx
  on goose_model_picks (integrity_status);

comment on column goose_model_picks.integrity_status is
  'Resolution quality: ok | unresolvable | postponed | void | null';
comment on column goose_model_picks.actual_result is
  'What actually happened (e.g. "Goals: 2", "Score: 4-2")';
