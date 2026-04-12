# Goose all-sports ingestion plan

Owner: Magoo
Goal: turn Goose from partial snapshot + settlement rails into a truthful all-sports market ingestion and learning system
Proof required: live Supabase capture counts, settlement counts, integrity counts, daily dataset exports, shadow scoring logs
Last updated: 2026-04-12 10:06 EDT
Status: In progress

## Blunt current state

We already have real warehouse pieces live:
- `market_snapshots`
- `market_snapshot_events`
- `market_snapshot_prices`
- `goose_market_events`
- `goose_market_candidates`
- `goose_market_results`
- `goose_feature_rows`
- `goose_decision_log`
- system qualifier persistence + grading
- player prop snapshot support
- snapshot -> Goose 2 shadow backfill
- training export and shadow scoring scripts

But we do **not** yet have a truthful "capture every bookmaker offering across all sports and learn from all of it" engine.

Current gaps:
- capture breadth is incomplete by sport / market / book
- settlement truth is incomplete by market type
- event identity is still brittle in places
- raw capture, normalized market truth, and trainable rows are not yet separated cleanly enough operationally
- coverage reporting is not strict enough, so silent holes are too easy

## Non-negotiable architecture

We should ingest everything we can get, but trust selectively.

### Layer 1: Raw capture layer
Store everything available from upstreams.
- every sport supported
- every book available
- every market captured
- every snapshot timestamp available
- every raw source id / event id / participant label / line / price / metadata blob

### Layer 2: Canonical normalized market layer
Map raw capture into stable canonical entities.
- canonical event identity
- canonical sport / league / market type
- canonical participant naming
- canonical side / line / odds representation
- best price / opening / closing flags
- duplicate collapse rules

### Layer 3: Settlement truth layer
Only mark outcomes from verified result rails.
- result status
- integrity status
- settlement timestamp
- grade source
- grading notes
- explicit ungradeable reasons when truth is unavailable

### Layer 4: Training layer
Only integrity-approved, settled rows become trainable.
- versioned feature rows
- versioned dataset exports
- per-sport training sets
- holdout windows
- shadow decision logs

## Desired end state

For each supported sport:
1. capture the full candidate universe repeatedly during the day
2. normalize all captured offerings into canonical candidate rows
3. settle every market type we can verify honestly
4. mark unresolved rows explicitly instead of leaving zombie pending rows forever
5. export daily training datasets from settled integrity-approved rows
6. run shadow scoring on the entire candidate universe
7. compare model edge vs market close vs actual outcomes

## Recommended rollout order

1. NBA
2. MLB
3. NHL
4. PGA
5. NFL
6. Soccer
7. MMA / other tail sports

Why:
- NBA + MLB give the fastest route to high-volume warehouse learning
- NHL already has meaningful rails and should stay close behind
- PGA is lower-frequency but useful and already partially wired
- NFL matters, but not as the first warehouse stress test in April

## Workstreams

### Workstream A — Capture breadth
Goal: ingest as much of the upstream market surface as possible

Build:
- canonical capture job for each sport
- repeated snapshot schedule throughout the day
- raw metadata preservation on every offering
- clear support matrix per source and market

Definition of done:
- per-sport daily snapshot counts are queryable
- per-book market coverage counts are queryable
- candidate volume is visible by sport/date/market

Evidence required:
- live Supabase counts by sport/book/market/date
- cron run logs
- sample raw rows proving breadth

### Workstream B — Canonical identity normalization
Goal: stop event and participant drift from poisoning downstream logic

Build:
- canonical event resolver using source ids first, team/date fallback second
- team alias map shared across ingest and grading
- participant normalization for player props
- duplicate reconciliation jobs for known problem sports

Definition of done:
- event duplication rate measurable and falling
- no repeated manual one-off cleanup for the same class of mismatch

Evidence required:
- duplicate audit reports before/after
- canonical mapping examples
- reduced ungradeable count caused by identity failure

### Workstream C — Settlement matrix
Goal: know exactly what we can grade and what we cannot

For each sport + market type, mark one of:
- supported now
- partially supported
- intentionally unsupported
- blocked by missing source truth

Initial priority markets:
- NBA: moneyline, spread, total, player props
- MLB: moneyline, spread, total, first five, batter/pitcher props
- NHL: moneyline, puck line, total, player props
- PGA: outrights, placement markets, H2H where available

Definition of done:
- settlement capability matrix exists in repo
- unresolved markets are flagged with explicit reason instead of silent pending drift

Evidence required:
- matrix file
- live settled/ungradeable counts by sport/market

### Workstream D — Integrity and QA reporting
Goal: expose holes daily instead of discovering them by accident

Build daily audit reporting:
- snapshots captured
- events captured
- prices captured
- Goose candidates created
- results settled
- pending older than threshold
- ungradeable counts
- duplicate event counts
- unsupported market counts

Definition of done:
- one command or route returns all core health metrics
- failures are obvious by sport and market

Evidence required:
- daily audit output from production data
- trendable counts over multiple days

### Workstream E — Training dataset automation
Goal: turn settled truth into real model-ready data every day

Build:
- daily export job from `goose_market_candidates` + `goose_market_results` + `goose_feature_rows`
- integrity filters
- per-sport datasets
- feature version tracking
- holdout window support

Definition of done:
- daily versioned dataset artifacts exist
- row counts by sport are queryable
- shadow scoring can consume the latest export cleanly

Evidence required:
- dataset artifact path / table rows / counts
- successful export logs

### Workstream F — Shadow model loop
Goal: evaluate models on the full archived market universe

Build:
- score candidate universes in shadow
- write `goose_decision_log`
- compare predicted edge against actual outcomes
- calibration and hit-rate dashboards by sport / market / book

Definition of done:
- shadow scores run daily
- decision logs can be audited against outcomes
- at least one baseline model per priority sport

Evidence required:
- decision log rows
- evaluation output
- calibration summary

## 7-day sprint order

### Day 1
- produce production coverage audit across current tables
- quantify current archive depth by sport / market / book
- list unsupported market types currently entering the warehouse
- confirm cron/scheduled capture inventory

### Day 2
- build canonical coverage report route/script
- add age-based pending audit
- add duplicate event audit
- add sport/market settlement audit

### Day 3
- harden NBA + MLB event identity normalization
- centralize alias handling for team abbreviations and stale matchup orientation
- reduce manual cleanup burden

### Day 4
- expand NBA market ingestion breadth
- verify player props and core main-line capture counts
- ensure Goose candidate creation follows the broader capture set

### Day 5
- expand MLB market ingestion breadth
- include first-five and priority prop classes where raw capture exists
- verify settlement compatibility tagging

### Day 6
- expand NHL capture + settlement audit parity
- ensure NHL archive breadth is measured the same way as NBA/MLB

### Day 7
- wire daily training export + shadow score run
- produce first honest cross-sport learning volume report

## Success metrics

### Capture metrics
- snapshots per sport per day
- events per sport per day
- prices per sport per day
- books per event
- market types per sport
- player prop rows per sport

### Quality metrics
- duplicate event rate
- unresolved candidate rate
- pending older than 24h
- ungradeable rate by sport / market
- percent of candidates with durable event ids

### Learning metrics
- settled trainable rows per sport per day
- feature rows generated per sport
- shadow decisions logged per sport
- evaluation rows with actual outcomes

## Immediate next actions

1. Build the live production coverage audit first
2. Build settlement capability matrix second
3. Expand NBA / MLB / NHL ingestion breadth third
4. Automate daily dataset export fourth
5. Start sport-specific shadow baselines fifth

## Guardrails

- ingest broad, train narrow
- no guessed outcomes
- no fake event identity
- no silent pending backlog older than threshold
- no claiming all-sports learning until live counts prove it
