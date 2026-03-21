# Snapshot cron/auth audit

- [x] inspect snapshot cron route and vercel.json wiring
- [x] determine whether CRON_SECRET-unset behavior is acceptable
- [x] harden repo behavior without breaking manual/local usage
- [x] update docs/admin notes if needed
- [x] run build
- [ ] commit changes if build passes

## Review
- Current `?cron=true` auth path was permissive when `CRON_SECRET` was unset; that is not a safe production default because a config miss would silently expose the cron route.
- Plan is to require `CRON_SECRET` for cron-mode requests, while preserving manual/dev usage through `?capture=true` and POST.

## Reconciliation review
- Local lane commits are linear and reachable on `main`: `84a61d2` -> `84a3e3f` -> `dda139f` -> `9a5fea9` -> `1dc0510` -> `1255921`.
- Preserved the current task file because it had moved on to a newer cron/auth audit task; did not revert it to the stale single-slice version still at `HEAD`.
- Ignored generated local artifacts (`data/daily-props-*.json`, `data/market-snapshots/`, `test-results/`) so git status reflects source changes rather than runtime output.
- Build verification was rerun during reconciliation to confirm the source tree stays clean after cleanup.
