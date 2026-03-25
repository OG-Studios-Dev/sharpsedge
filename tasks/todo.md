- [x] Inspect repo/admin routes/data stores/build failures
- [x] Verify sandbox SQL apply path vs code-only path
- [x] Implement 10 NBA + 10 NHL sandbox generator/wiring
- [x] Add isolated sandbox persistence/upsert/read helpers
- [x] Add admin-triggered sandbox generation API and visibility
- [x] Validate with build/targeted checks
- [x] Commit changes
- [x] Add review summary

## Review
- In repo tooling, Supabase CLI is installed but this repo is not linked to a remote project (`supabase/config.toml` absent), no direct `psql` client is available, and live service-role probes return `PGRST205` for `public.sandbox_pick_slates` / `public.sandbox_pick_history`. That means I could verify the schema is missing, but not safely apply SQL from repo tooling without explicit org project linkage.
- I completed the code path anyway: the sandbox rail now has a dedicated internal Daily Review UX instead of just a storage scaffold. `/admin/sandbox` now renders separate NHL and NBA daily sections, each showing the 10-pick sandbox board, visible reasoning, checklist prompts, outcome/review states, and pregame/postmortem/model-adjustment note slots.
- The model/store layer now carries a structured `review_snapshot` payload for both sandbox slates and sandbox picks so the review UI has durable typed fields for learnings, postmortems, outcome notes, and clear admin-only / sandbox-only separation.
- Storage is backward-compatible by design: if live Supabase only has the older sandbox schema and is missing `review_snapshot`, the app falls back gracefully to legacy column selects/writes instead of crashing. Once the new JSONB columns are applied, the richer review payload persists automatically.
- Admin API now still supports `POST /api/admin/sandbox` with `{ "mode": "generate", "league": "NBA" }` or `{ "mode": "generate", "league": "NHL" }`, and bundle responses now surface explicit sandbox/admin-only metadata for the internal review rail.
- Updated checked-in SQL at `scripts/setup-sandbox-picks.sql` and `supabase/migrations/20260325090000_sandbox_picks.sql` to add the new `review_snapshot jsonb` columns needed to fully persist the richer daily review state.
- Validation target is `npm run build`. Remaining blocker to fully activate the richer persistence path is external: the org-owned Supabase sandbox tables still need to be applied/updated, so live generation/storage will either fail entirely (if tables are absent) or run in graceful legacy mode (if tables exist but the new review columns are not installed yet).
