- [x] Inspect repo/admin routes/data stores/build failures
- [x] Verify sandbox SQL apply path vs code-only path
- [x] Implement 10 NBA + 10 NHL sandbox generator/wiring
- [x] Add isolated sandbox persistence/upsert/read helpers
- [x] Add admin-triggered sandbox generation API and visibility
- [x] Validate with build/targeted checks
- [ ] Commit changes
- [ ] Add review summary

## Review
- In repo tooling, Supabase CLI is installed but this repo is not linked to a remote project (`supabase/config.toml` absent), no direct `psql` client is available, and live service-role probes return `PGRST205` for `public.sandbox_pick_slates` / `public.sandbox_pick_history`. That means I could verify the schema is missing, but not safely apply SQL from repo tooling without explicit org project linkage.
- Implementation target therefore is: complete the sandbox workflow from code, preserve strict isolation from production picks/history, and leave SQL apply as the remaining external operator step.
- Success criteria for this pass: admin API can generate/store sandbox slates for NBA/NHL only, 10 picks per league/day, uses dedicated sandbox tables only, supports idempotent regeneration/refresh, and the admin page surfaces the stored results plus clear schema blocker state.
