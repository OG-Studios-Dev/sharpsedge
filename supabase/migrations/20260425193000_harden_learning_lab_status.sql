-- Harden Goose learning lab readiness so eligible signals alone can never unlock recording
-- while source artifacts remain visible in the current model metrics.

drop view if exists public.goose_learning_lab_status_v1;

create view public.goose_learning_lab_status_v1 as
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
    m.metrics as model_metrics,
    case
      when coalesce(c.candidate_signals, 0) = 0 then 0::numeric
      else coalesce(c.sanity_rejected_signals, 0)::numeric / nullif(c.candidate_signals, 0)::numeric
    end as sanity_rejected_share,
    coalesce((l.readiness_rules->>'max_sanity_rejected_share_for_auto_ready')::numeric, 0.75) as max_sanity_rejected_share_for_auto_ready,
    coalesce((m.metrics->>'walkForward')::boolean, false) as has_walk_forward,
    exists (
      select 1
      from jsonb_array_elements(coalesce(m.metrics->'walkForwardFolds', '[]'::jsonb)) fold
      where coalesce((fold->>'eligibleCandidates')::int, 0) = 0
    ) as has_zero_eligible_walk_forward_fold,
    exists (
      select 1
      from jsonb_array_elements(coalesce(m.metrics->'topCandidates', '[]'::jsonb)) candidate
      where coalesce((candidate->>'test_roi')::numeric, 0) > 0.25
         or coalesce((candidate->>'train_roi')::numeric, 0) > 0.25
         or coalesce((candidate->>'test_win_rate')::numeric, 0) > 0.72
         or coalesce((candidate->>'train_win_rate')::numeric, 0) > 0.72
    ) as has_top_candidate_artifacts
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
    and sanity_rejected_share <= max_sanity_rejected_share_for_auto_ready
    and has_walk_forward = true
    and has_zero_eligible_walk_forward_fold = false
    and has_top_candidate_artifacts = false
  ) as ready_to_record,
  (
    settled_shadow_picks >= coalesce((readiness_rules->>'min_shadow_picks_for_comparison')::int, 100)
  ) as ready_to_compare,
  array_remove(array[
    case when train_examples < coalesce((readiness_rules->>'min_train_examples')::int, 50000) then 'Needs more training examples' end,
    case when test_examples < coalesce((readiness_rules->>'min_test_examples')::int, 25000) then 'Needs more out-of-sample test examples' end,
    case when candidate_signals < coalesce((readiness_rules->>'min_candidate_signals')::int, 50) then 'Needs more candidate signals' end,
    case when eligible_signals < coalesce((readiness_rules->>'min_eligible_signals')::int, 1) then 'No sanity-clean eligible signals yet' end,
    case when sanity_rejected_share > max_sanity_rejected_share_for_auto_ready then 'Too many sanity-rejected signals' end,
    case when has_walk_forward = false then 'Needs walk-forward validation before recording' end,
    case when has_zero_eligible_walk_forward_fold = true then 'At least one walk-forward fold has zero eligible signals' end,
    case when has_top_candidate_artifacts = true then 'Top candidates still contain implausible ROI/win-rate artifacts' end,
    case when settled_shadow_picks < coalesce((readiness_rules->>'min_shadow_picks_for_comparison')::int, 100) then 'Needs more settled shadow picks before production comparison' end
  ], null) as blockers
from status_calc;
