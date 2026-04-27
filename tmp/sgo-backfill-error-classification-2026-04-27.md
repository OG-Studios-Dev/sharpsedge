# SportsGameOdds Backfill Error Classification — 2026-04-27

Owner: Magoo
Goal: classify recent SGO backfill chunk errors and separate quota/auth/source issues from transform/ingest issues.
Proof required: ledger-derived counts and example windows.

Recent ledger error rows since 2026-04-27T08:00:00Z: **16**

## Error classes
- source_quota_exhausted: 14
- normalization_zero_candidates: 2

## By league
### MLB
- normalization_zero_candidates: 2
- source_quota_exhausted: 1
### NBA
- source_quota_exhausted: 5
### NHL
- source_quota_exhausted: 8

## Examples
### normalization_zero_candidates
- MLB 2024-03-01T00:00:00.000Z → 2024-03-07T23:59:59.000Z | status=200 events=50 candidates=0 ingested=0 usage=1544/2500 error=INGEST_MISSING for MLB 2024-03-01T00:00:00.000Z..2024-03-07T23:59:59.000Z
- MLB 2024-03-08T00:00:00.000Z → 2024-03-14T23:59:59.000Z | status=200 events=50 candidates=0 ingested=0 usage=1544/2500 error=INGEST_MISSING for MLB 2024-03-08T00:00:00.000Z..2024-03-14T23:59:59.000Z

### source_quota_exhausted
- MLB 2024-11-15T00:00:00.000Z → 2024-11-15T23:59:59.000Z | status=401 events=0 candidates=None ingested=None usage=2501/2500 error=PULL_FAILED 401 for MLB 2024-11-15T00:00:00.000Z..2024-11-15T23:59:59.000Z
- NBA 2026-04-15T00:00:00.000Z → 2026-04-21T23:59:59.000Z | status=401 events=0 candidates=None ingested=None usage=2501/2500 error=PULL_FAILED 401 for NBA 2026-04-15T00:00:00.000Z..2026-04-21T23:59:59.000Z
- NBA 2026-04-22T00:00:00.000Z → 2026-04-27T08:20:01.000Z | status=401 events=0 candidates=None ingested=None usage=2501/2500 error=PULL_FAILED 401 for NBA 2026-04-22T00:00:00.000Z..2026-04-27T08:20:01.000Z
- NBA 2026-04-22T00:00:00.000Z → 2026-04-27T09:20:00.000Z | status=401 events=0 candidates=None ingested=None usage=2501/2500 error=PULL_FAILED 401 for NBA 2026-04-22T00:00:00.000Z..2026-04-27T09:20:00.000Z
- NBA 2026-04-22T00:00:00.000Z → 2026-04-27T10:20:00.000Z | status=401 events=0 candidates=None ingested=None usage=2501/2500 error=PULL_FAILED 401 for NBA 2026-04-22T00:00:00.000Z..2026-04-27T10:20:00.000Z
- NBA 2026-04-22T00:00:00.000Z → 2026-04-27T11:20:00.000Z | status=401 events=0 candidates=None ingested=None usage=2501/2500 error=PULL_FAILED 401 for NBA 2026-04-22T00:00:00.000Z..2026-04-27T11:20:00.000Z
- NHL 2026-01-15T00:00:00.000Z → 2026-01-21T23:59:59.000Z | status=401 events=0 candidates=None ingested=None usage=2501/2500 error=PULL_FAILED 401 for NHL 2026-01-15T00:00:00.000Z..2026-01-21T23:59:59.000Z
- NHL 2026-03-08T00:00:00.000Z → 2026-03-14T23:59:59.000Z | status=401 events=0 candidates=None ingested=None usage=2501/2500 error=PULL_FAILED 401 for NHL 2026-03-08T00:00:00.000Z..2026-03-14T23:59:59.000Z

## Verdict
- Main recent failure is SportsGameOdds source quota exhaustion, not Supabase health. Active keys report monthly entity usage at/above 2500, and event pulls return 401 once quota is exceeded.
- Separate older/current MLB March chunks show normalization-zero-candidate behavior: events are fetched, but no candidates are produced, so they need transform/market inspection rather than blind retry.
- Runner has been patched so a run with chunk errors returns `status: partial`, `ok: false`, `failedChunks`, and `errorClassCounts` instead of a misleading green summary.
