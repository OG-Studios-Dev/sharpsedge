# Goose2 Baseline Trainer Results — 2026-04-11

## Purpose
Run the first honest baseline model on the cleaned Goose2 training export and compare it against implied odds.

## Implementation
Trainer added:
- `scripts/goose2-train-baseline.mjs`
- command: `npm run goose2:train-baseline`
- output: `tmp/goose2-baseline-report.json`

Model choice:
- logistic regression
- no external ML dependency
- strict time-order split
- compared directly against implied probability from market odds

## Dataset used
From `tmp/goose2-training-dataset-v1.json`:
- total rows: **276**
- train: **193**
- validation: **41**
- test: **42**

Split ranges:
- train: `2026-04-09T21:20:47.162+00:00` → `2026-04-10T18:09:19.282+00:00`
- validation: `2026-04-10T18:09:19.282+00:00` → `2026-04-10T18:09:19.282+00:00`
- test: `2026-04-10T18:09:19.282+00:00` → `2026-04-11T00:35:33.96+00:00`

## Features used
Very simple v1 baseline only:
- implied probability
- line
- odds
- best/opening/closing flags
- qualifier count
- one-hot sport
- one-hot market type
- one-hot book

## Results
### Validation
Model:
- log loss: **0.6264**
- brier: **0.2190**
- accuracy @ 0.50: **65.9%**

Implied-odds baseline:
- log loss: **0.6409**
- brier: **0.2260**
- accuracy @ 0.50: **61.0%**

### Test
Model:
- log loss: **0.4660**
- brier: **0.1578**
- accuracy @ 0.50: **78.6%**

Implied-odds baseline:
- log loss: **0.7206**
- brier: **0.2630**
- accuracy @ 0.50: **50.0%**

## Honest interpretation
This is encouraging, but not victory-lap material.

What it means:
- even with a crude feature set, Goose2 can produce a baseline model that beats raw implied odds on this tiny sample
- that is enough evidence to keep going

What it does **not** mean:
- it does not prove robust production edge yet
- it does not mean the current model is ready to publish autonomous picks
- it may be flattering itself on small-sample structure and date clustering

## Biggest limitations
1. **sample is tiny**
   - especially NBA
2. **time split is honest but narrow**
   - most rows come from a very short window
3. **features are still shallow**
   - mostly market-state, not rich pregame context
4. **decision layer is not wired yet**
   - model scores are not yet flowing back into `goose_decision_log`

## Decision
### Yes
- baseline training is worth continuing
- the signal is good enough to justify building the next layer

### No
- this is not enough to trust autonomous publishing
- we should not oversell these numbers to ourselves

## Best next step
Wire a scoring job that takes the current day’s feature rows and writes back shadow model outputs into `goose_decision_log`:
- `model_version`
- `p_true`
- `calibrated_p_true`
- `edge`
- `recommended_tier`
- explanation / rejection reasons

That creates a real loop:
1. bank data
2. settle labels
3. train baseline
4. score new rows
5. compare shadow predictions against outcomes

## Bottom line
Goose2 is no longer just collecting data.
It has now produced the first real baseline model result that beats implied odds on held-out rows.

That is the first actual sign of learning, even if it is still early and fragile.
