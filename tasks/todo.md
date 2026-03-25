- [x] Inspect repo/admin routes/data stores/build failures
- [x] Verify 10 NBA + 10 NHL sandbox pipeline status
- [x] Fix blockers for sandbox generation/storage/admin visibility
- [x] Fix related admin/API workflow blockers and harden paths
- [x] Validate with build/targeted checks
- [ ] Commit changes
- [ ] Add review summary

## Review
- Evidence: live Supabase confirms production `pick_slates` is active with 3 locked NBA + 3 locked NHL daily picks, but `sandbox_pick_slates` and `sandbox_pick_history` do not exist in schema cache (PGRST205 404), so the sandbox pilot is not live server-side.
- Root causes fixed: (1) `src/app/api/picks/route.ts` manual insert path was missing required `sportsbook`, breaking `next build`; (2) sandbox admin/storage path failed opaquely when tables were missing, giving an empty state instead of a concrete operator action.
- Hardening added: explicit sandbox schema guardrails in store helpers, actionable admin error state, and a checked-in SQL scaffold at `scripts/setup-sandbox-picks.sql` to bring sandbox storage online cleanly.
- Validation: `npm run build` passes after fixes; direct service-role probes still show sandbox tables missing in prod, so storage is ready in code but not yet live until SQL is applied.
