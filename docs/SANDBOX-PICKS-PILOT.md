# Sandbox Picks Pilot

## Goal
Stand up a sandbox picks pilot that is fully isolated from production picks/history and hidden from the public product surface.

## Hard separation rules
1. **Never write sandbox picks into `pick_history` or `pick_slates`.**
2. **Never read sandbox picks from public `/picks`, `/my-picks`, public leaderboards, or production admin summary metrics.**
3. **Sandbox storage gets its own schema/types/store/api/page namespace.**
4. **Sandbox is reachable only via `/admin/sandbox` and admin APIs under `/api/admin/sandbox`.**
5. **Production pick-history semantics stay untouched.** No changes to existing settlement, provenance, or public history behavior in this first slice.

## Phase 1 safe slice (ship now)
- Add isolated TypeScript types for sandbox picks/slates.
- Add isolated Supabase/PostgREST storage helper targeting new tables:
  - `sandbox_pick_slates`
  - `sandbox_pick_history`
- Add admin-only route handler:
  - `GET /api/admin/sandbox`
  - `POST /api/admin/sandbox`
- Add admin-only UI entry point:
  - `/admin/sandbox`
- Add SQL scaffold doc/migration file for table creation.
- Add workflow note so sandbox review explicitly checks stats angles before approving picks.

## Deferred until phase 2+
- Separate settlement/grading UI for sandbox outcomes
- Promotion flow from sandbox candidate -> production candidate
- Auth hardening for admin beta-open mode
- Aggregated sandbox dashboards and experiments registry
- Automatic diffing between sandbox and production slate quality

## Data model
### `sandbox_pick_history`
Expected fields mirror the production shape where useful, but remain isolated:
- `id`
- `sandbox_key`
- `date`
- `league`
- `pick_type`
- `player_name`
- `team`
- `opponent`
- `pick_label`
- `hit_rate`
- `edge`
- `odds`
- `book`
- `result`
- `game_id`
- `reasoning`
- `confidence`
- `units`
- `pick_snapshot`
- `experiment_tag`
- `review_status`
- `review_notes`
- `created_at`
- `updated_at`

### `sandbox_pick_slates`
- `sandbox_key`
- `date`
- `league`
- `experiment_tag`
- `status`
- `pick_count`
- `expected_pick_count`
- `review_status`
- `review_notes`
- `created_at`
- `updated_at`

## Review flow expectation
Before a sandbox slate is treated as worth revisiting, review notes should explicitly cover:
- home/away splits
- travel / rest density
- hot/cold runs
- opponent form
- lineup/injury/news context
- price discipline / whether the edge survives the current number

## Exit criteria for this slice
- Repo contains a written plan/spec
- Sandbox types/store/api/page exist
- Public UI does not expose sandbox picks
- No production history semantics changed
