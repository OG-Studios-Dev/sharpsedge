# Goose2 Training Dataset Spec v1 — 2026-04-11

## Goal
Define the first honest training dataset for model development.

## Owner
Magoo

## Objective
Create a leakage-safe dataset that turns daily Goose2 banking into trainable examples.

---

## Training grain
Start with:

**One row per pregame best-price candidate at a fixed capture checkpoint**

Why this grain
- cleaner than every micro-snapshot
- more realistic than using final closing state for all decisions
- simpler to evaluate than mixed intraday rows
- maps well to actual pick selection logic

---

## Candidate inclusion rules
Include rows only when all are true:
- sport in `NHL`, `NBA`, `MLB`
- candidate linked to a valid `goose_market_events` row
- event is pregame at capture time
- candidate belongs to supported market family for v1
- odds are real and within production/training policy bounds
- label is ultimately trainable

Exclude rows when any are true:
- event identity is flagged by critical identity audit
- candidate has missing core fields
- odds are fabricated, placeholder, or source-corrupt
- row is cancelled, void, postponed, manual-review, or unresolved
- feature timestamp is not provably pre-decision

---

## V1 supported markets
Start with the cleanest pregame markets:
- moneyline
- spread / puck line / run line
- total
- first five total / first five side for MLB where support is consistent
- first quarter / first period only after source consistency is proven

Do **not** include noisy props in v1.

---

## Row keys
Each training row should retain:
- `candidate_id`
- `event_id`
- `feature_row_id` where available
- `decision_id` where available
- `snapshot_id`
- `event_snapshot_id`
- `capture_ts`
- `event_date`
- `sport`
- `market_type`

---

## Core feature blocks

### 1. Market state
- `odds`
- `line`
- implied probability
- market type
- side / selection
- book
- best-vs-median price gap
- dispersion across books
- count of books seen for same market
- movement since previous checkpoint

### 2. Event context
- sport
- game date
- commence time
- home vs away
- team identifiers
- rest/back-to-back/travel flags where available

### 3. Form and strength
- rolling team performance windows
- offensive / defensive quality metrics
- scoring environment context
- sport-specific strength proxies

### 4. Availability context
- probable starters for MLB
- lineup/injury/news indicators where timestamp-safe
- goalie/starter confirmation state where available

### 5. Internal signal context
- heuristic qualifier count
- qualifying systems list
- whether candidate was best-price row
- freshness and source-health indicators

---

## Labels
Primary v1 label:
- binary settled outcome for the candidate
  - `1 = win`
  - `0 = loss`

Handle separately:
- pushes
- voids
- cancellations
- postponements
- unresolved/manual-review rows

These should not silently leak into the binary training target.

---

## Leakage rules
Hard rules:
- no closing values in rows representing earlier decisions unless model is explicitly a closing-line model
- no future lineup/injury confirmation attached backward in time
- no final boxscore stats in pregame features
- no post-settlement grading artifacts inside feature blocks
- all rolling stats must be reproducible from pre-capture state

---

## Split policy
Use strictly time-based splits.

Recommended initial pattern:
- train: oldest 70%
- validation: next 15%
- test: newest 15%

Also maintain sport-specific holdouts if sample size allows.

Never random-split across time.

---

## Quality checklist before first training run
- [ ] identity audit clean for included rows
- [ ] grading audit clean or warning-only for included rows
- [ ] feature timestamps verified pre-decision
- [ ] sample rows manually inspected
- [ ] excluded rows counted and categorized
- [ ] train/validation/test split reproducible
- [ ] baseline implied-probability benchmark defined

---

## Minimum artifact for v1 build
Before model training starts, produce:
1. dataset schema
2. feature dictionary
3. exclusion rules list
4. sample exported rows
5. row-count summary by sport/market/result bucket
6. leakage signoff checklist

---

## Recommendation
The next implementation target should be a materialized view or reproducible extraction job that outputs this v1 dataset with explicit exclusion reasons per dropped row.
