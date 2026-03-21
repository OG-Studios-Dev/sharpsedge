# Snapshot cron/auth audit

- [x] inspect snapshot cron route and vercel.json wiring
- [x] determine whether CRON_SECRET-unset behavior is acceptable
- [x] harden repo behavior without breaking manual/local usage
- [x] update docs/admin notes if needed
- [x] run build
- [x] commit changes if build passes

## Review
- Current `?cron=true` auth path was permissive when `CRON_SECRET` was unset; that is not a safe production default because a config miss would silently expose the cron route.
- Plan is to require `CRON_SECRET` for cron-mode requests, while preserving manual/dev usage through `?capture=true` and POST.

## Reconciliation review
- Local lane commits are linear and reachable on `main`: `84a61d2` -> `84a3e3f` -> `dda139f` -> `9a5fea9` -> `1dc0510` -> `1255921`.
- Preserved the current task file because it had moved on to a newer cron/auth audit task; did not revert it to the stale single-slice version still at `HEAD`.
- Ignored generated local artifacts (`data/daily-props-*.json`, `data/market-snapshots/`, `test-results/`) so git status reflects source changes rather than runtime output.
- Build verification was rerun during reconciliation to confirm the source tree stays clean after cleanup.

## Follow-up: market snapshot Supabase durability
- Repo evidence: `src/lib/market-snapshot-store.ts` writes directly to `rest/v1/market_snapshots`, `market_snapshot_events`, and `market_snapshot_prices` using the service-role bearer token.
- Confirmed locally that the configured `SUPABASE_SERVICE_ROLE_KEY` decodes to `role=service_role`, so the failure is not explained by using an anon key.
- Current likely blocker: the market snapshot schema existed only in `scripts/create-market-snapshots.sql`; there was no tracked `supabase/migrations/` file in the repo, so local/project Supabase instances can easily be missing these tables/policies.
- Repo hardening added: tracked migration at `supabase/migrations/20260321184500_create_market_snapshots.sql` plus richer PostgREST error details in snapshot persistence.
- Remaining step to prove writes healthy: apply that migration to the target Supabase project, then retry a snapshot capture. If inserts still fail, the code now surfaces the exact PostgREST error payload instead of only an HTTP status.
