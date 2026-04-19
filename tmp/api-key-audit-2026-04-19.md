# API key handling audit — 2026-04-19

Owner: Magoo
Goal: standardize multi-key behavior and provider key policy across the whole app
Proof required: code audit, targeted file evidence, follow-up patches
Last updated: 2026-04-19
Status: In progress

## Executive summary

The audit team should have caught this earlier.

Current state is inconsistent:
- The Odds API now has a shared pooled helper in `src/lib/odds-api-pool.ts`
- But several Odds API callers still bypass it and just grab the first key
- SportsGameOdds already has multi-key retry, but surrounding debug/config surfaces still assume one key
- SportsData.io helper is currently wired to the wrong env var entirely
- Other providers are mostly single-key today and need an explicit policy, not accidental behavior

## Provider-by-provider findings

### 1) The Odds API

#### Good
- Shared pool exists: `src/lib/odds-api-pool.ts`
- Already wired:
  - `src/lib/odds-aggregator.ts`
  - `src/lib/props-cache.ts`
  - `src/lib/mlb-odds.ts`

#### Still inconsistent / bypassing shared pool
- `src/lib/golf-odds.ts`
  - imports `getOddsApiKeys` from aggregator
  - uses `keys[0]` directly, no pooled fetch helper
- `src/lib/soccer-odds.ts`
  - same issue, `keys[0]` direct first-key behavior
- `src/lib/golf/fallback-odds-scraper.ts`
  - manually constructs key pool, then uses first key only
- `src/app/api/golf/finish-market-odds/route.ts`
  - direct single-key `ODDS_API_KEY`
- `src/lib/admin.ts`
  - health check only probes `ODDS_API_KEY`, not pooled availability

#### Docs / metadata now stale
- `src/lib/pga-fallback-summary.ts`
  - still says winner odds live via `ODDS_API_KEY_2`
- `src/app/api/admin/pga-fallback-capture/route.ts`
  - docs + response text still say `ODDS_API_KEY_2`
- `src/lib/golf/fallback-odds-scraper.ts`
  - comments still mention key 2 despite code moving toward pooled intent

### 2) SportsGameOdds

#### Good
- Multi-key support exists in `src/lib/sportsgameodds.ts`
- Reads both:
  - `SPORTSGAMEODDS_API_KEYS`
  - `SPORTSGAMEODDS_API_KEY`
- Dedupe + retry on 429 already implemented

#### Still inconsistent / weak
- No health ranking or cooldown, just retry sequence
- `src/app/api/debug/sportsgameodds/route.ts`
  - `envConfigured` only checks `SPORTSGAMEODDS_API_KEY`, not pooled envs
- standalone scripts duplicate rotation logic instead of importing shared helper:
  - `scripts/sgo-historical-backfill.mjs`
  - `scripts/test-sgo-key-rotation.mjs`

### 3) SportsData.io

#### Bug
- `src/lib/sportsdataio.ts`
  - reads `SPORTSGAMEODDS_API_KEY`
  - that is the wrong provider env var
- Should use its own SportsData.io-specific env var, probably aligned with:
  - `SPORTSDATAIO_API_KEY`
  - `SPORTS_DATA_IO_API_KEY`
  - already referenced elsewhere in `scripts/enrich-historical-league-ids.mjs`

### 4) BallDontLie NBA + PGA
- single-key only today
- files:
  - `src/lib/nba-api.ts`
  - `src/lib/golf/bdl-pga.ts`
- no pooling
- acceptable only if we explicitly declare single-key policy and rate-limit/caching discipline

### 5) API-Sports
- single-key only today
- files:
  - `src/lib/nba-api.ts` (`API_SPORTS_KEY`)
  - `src/lib/ufc-api.ts`
- no pooling
- acceptable only if deliberate and documented

### 6) Football-Data
- single-key only today
- file:
  - `src/lib/soccer-api.ts`

### 7) Supabase / Stripe / internal secrets
- not multi-key providers, so they should not follow rotation policy
- these need correctness/security policy, not pool policy

## Best-practice rule set we should enforce

### Rule A: every external paid data provider gets one declared policy
Each provider must be one of:
1. `pooled_ranked`
2. `pooled_retry_only`
3. `single_key_documented`

No silent ad hoc behavior.

### Rule B: provider logic lives in one shared helper per provider
- no more rebuilding env parsing in random files
- no more `process.env.X` directly inside leaf fetchers when a provider helper exists

### Rule C: health/debug/admin checks must reflect real pool state
- not just whether the first env var exists
- not just whether key slot 1 works

### Rule D: docs and route copy must never mention specific numbered key slots
- say `Odds API pool`
- not `ODDS_API_KEY_2`

### Rule E: scripts should import shared provider helpers when practical
- avoid logic drift between app code and one-off scripts

## Immediate patch queue

1. Move remaining Odds API callers to shared pool helper
   - golf-odds
   - soccer-odds
   - golf fallback odds scraper
   - golf finish-market-odds route
   - admin health check

2. Fix SportsData.io env bug
   - stop reading `SPORTSGAMEODDS_API_KEY`
   - use SportsData.io-specific env names

3. Fix SportsGameOdds debug/env status
   - detect either pooled env source, not just single env

4. Update stale docs/comments/copy
   - remove `ODDS_API_KEY_2` references where behavior is now pooled

## Current recommendation

Do not call this fully standardized yet.

We improved The Odds API core rail, but the app still does not treat all providers consistently, and even The Odds API itself still has bypasses.
