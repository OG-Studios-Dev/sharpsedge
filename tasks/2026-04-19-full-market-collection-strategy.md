# Goosalytics full-market collection strategy

Owner: Magoo
Goal: ensure Goosalytics captures every relevant pre-game market candidate and stores a result for every stored candidate
Proof required: code audit, schema audit, cron path audit, live verification queries
Last updated: 2026-04-19 06:55 EDT
Status: Partial

## What exists now

### Odds capture rails already in repo
1. `market_snapshots`, `market_snapshot_events`, `market_snapshot_prices`
   - durable snapshot rail for full-board market prices
   - supports team markets plus many player prop market types
   - source fields and capture timestamps already exist

2. `goose_market_events`, `goose_market_candidates`, `goose_market_results`
   - candidate warehouse rail for normalized event + candidate + result storage
   - this is the correct table family for "every potential line/odd" tracking

3. Daily warehouse cron path exists
   - `scripts/run-sgo-daily-refresh.sh`
   - runs `scripts/sgo-run-backfill.mjs`
   - then runs `scripts/run-goose2-grade.mjs`

4. Player-prop snapshot rail exists
   - `src/lib/player-prop-snapshot.ts`
   - supports NBA / NHL / MLB / NFL player props from Odds API-backed cache

5. Grading rail exists
   - `src/lib/goose2/grading.ts`
   - writes to `goose_market_results`
   - handles win/loss/push/void/pending/ungradeable and integrity flags

## Hard truth: what is still missing

### 1. Capture is not yet guaranteed to be "all pre-game player props + all potential game bet odds"
Current problem:
- We have table support for broad market storage.
- We have ingestion for many normalized candidates.
- But current daily flow is still oriented around backfill/candidate generation, not a strict full-card pregame market census with explicit completeness guarantees.

Specific gaps found in code:
- Team market snapshot rail stores major rails only: moneyline, spread, totals, Q1, Q3, MLB first five.
- Player prop snapshot rail supports many props, but only for sports/events coming through the Odds API props cache path.
- Golf finish markets / outrights are only partially automated and not on the same universal candidate warehouse loop.
- No single daily verification step currently proves: "for each scheduled event, every required market family was captured before start time."

### 2. Results are not yet guaranteed for every stored candidate
Current problem:
- `goose_market_results` is the right table.
- Grading code exists and is fairly broad.
- But settlement coverage is only as good as event-id integrity, supported market-type grading logic, and source completeness.

Specific gaps found in code:
- Some market types are gradeable; some still fall to `ungradeable` / `manual_review`.
- Event identity resolution still matters a lot, especially NHL/MLB edge cases.
- There is no strict warehouse SLA job that says: every candidate whose event is final must have a terminal row in `goose_market_results`.
- Current verify route checks recent snapshots/candidates/results volume, but not candidate-level result completeness.

## The strategy we should adopt

## A. Canonical warehouse contract
For every scheduled pre-game event, we store:
1. one canonical `goose_market_events` row
2. one `goose_market_candidates` row for every candidate bettable line/outcome/book/time capture we care about
3. one `goose_market_results` row per candidate once settleable

That means:
- no model-only storage
- no pick-only storage
- no "we stored the chosen bet but not the available market context"

## B. Required pre-game market coverage

### Team/game markets
Capture for every supported pre-game event:
- moneyline
- spread
- total
- first five moneyline (MLB where available)
- first five total (MLB where available)
- first quarter spread (NBA where available)
- third quarter spread (NBA where available)

### Player props
Capture all available pre-game player props exposed by source for supported sports, not only the props we plan to bet.
Current supported target families in schema/taxonomy:
- points
- rebounds
- assists
- shots on goal
- goals
- hits
- total bases
- strikeouts
- home runs
- threes
- passing yards
- passing TDs
- rushing yards
- rush attempts
- receiving yards
- receptions
- anytime TD

### Golf / special markets
If we support them in product or training, store them on the same warehouse principle:
- outright winner
- top 5
- top 10
- top 20

## C. Two-layer storage model

### Layer 1: raw-ish snapshot layer
Use `market_snapshots` + `market_snapshot_prices`
Purpose:
- preserve what was available at capture time
- keep line movement history
- keep book/time audit trail

### Layer 2: canonical candidate/result layer
Use `goose_market_events` + `goose_market_candidates` + `goose_market_results`
Purpose:
- normalize every candidate into a durable training/grading entity
- attach terminal outcome per candidate
- make candidate-level completeness measurable

Rule:
- snapshot layer is evidence
- candidate layer is truth rail for modeling and grading

## D. Required operational jobs

### Job 1: pre-game full-card capture
Run on a schedule leading into lock:
- every 20 minutes during active slate windows
- hourly outside heavy windows

For each supported sport/date:
1. fetch scheduled events
2. fetch all supported team markets
3. fetch all supported player prop markets
4. write snapshot rows
5. normalize into candidate rows
6. mark capture coverage metrics by sport/event/market family

### Job 2: pre-start closing capture
Run shortly before each event start:
- target one last capture within 10 to 20 minutes before start

Purpose:
- preserve closing line / price
- make `is_closing` reliable instead of guessed

### Job 3: post-final settlement pass
Run repeatedly for completed events:
1. find all candidates whose event is final or completed
2. compute result where supported
3. write `goose_market_results`
4. if unsupported or unresolved, write explicit terminal integrity state
   - `manual_review`
   - `unresolvable`
   - `cancelled`
   - `void`
   - never silent missingness

### Job 4: completeness verifier
This is the missing hammer.
For each final event, assert:
- candidate count > 0 for required market families
- every settleable candidate has a `goose_market_results` row
- unresolved remainder is explicitly classified

If not, fail verification loudly.

## E. The warehouse SLA we should enforce

### Capture SLA
For every supported event before start:
- required team market families present
- available player prop families ingested from source
- candidate rows exist in DB
- snapshot evidence exists in DB

### Settlement SLA
For every supported final event:
- every candidate has one of:
  - win
  - loss
  - push
  - void
  - cancelled
  - pending (only if event not actually final)
  - ungradeable with explicit reason
- no candidate should just have no result row after final status

## Exact implementation order

### Phase 1: prove and enforce capture completeness
1. Add a coverage matrix by sport/event/market family after each capture run
2. Persist that matrix in Supabase or durable audit artifact
3. Update verify route to fail if required market families are missing for supported events

### Phase 2: expand universal pre-game capture
1. Make player prop capture part of the same scheduled warehouse job, not a sidecar assumption
2. Add golf top-5/top-10/top-20 capture into canonical candidate storage where available
3. Ensure every supported upstream market type maps into `goose_market_candidates`

### Phase 3: enforce result completeness
1. Add candidate-level result completeness audit:
   - `final events without results`
   - `final candidates without result rows`
   - `manual_review backlog by market type`
2. Fail daily verification if final candidates are missing terminal result state
3. Add backlog rerun jobs for unresolved IDs and stale pendings

### Phase 4: make training trustable
1. Train only from candidates with terminal results and acceptable integrity state
2. Exclude `manual_review` / `unresolvable` unless explicitly handled
3. Keep full audit trail from snapshot -> candidate -> result

## Immediate next build targets

### Must do first
1. Add a warehouse completeness audit script for:
   - scheduled events missing required pregame market families
   - final events with candidates lacking result rows
2. Fold player-prop capture into the daily warehouse refresh proof path
3. Extend `api/admin/goose2/verify-daily` to check candidate/result completeness, not just row counts

### Then
4. Standardize all supported market types into one capture matrix
5. Add explicit closing-capture logic
6. Add explicit unresolved terminal classification rules for every grading miss

## Blunt conclusion
The schema is close.
The cron skeleton is close.
The grading rail is close.

But "capture everything and settle everything" is not yet guaranteed.

To make your two rules true, we need to stop thinking in terms of picks and start thinking in terms of warehouse completeness:
- every pregame candidate stored
- every final candidate settled or explicitly classified

Terminal state: Partial
