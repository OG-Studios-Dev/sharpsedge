# Goose2 Training Readiness — 2026-04-11

## Purpose
Translate the cleaned Goose2 banking layer into an honest read on whether the model can start learning now.

## Current state
### Identity layer
- NHL duplicate cluster cleanup is complete
- phase-1 identity audit now reports:
  - NHL suspicious_event_id_count = 0
  - NHL duplicate_cluster_count = 0
  - NBA suspicious_event_id_count = 0
  - MLB suspicious_event_id_count = 0

### Banking layer
Current total rows observed:
- `goose_market_candidates`: 1159
- `goose_feature_rows`: 1104
- `goose_decision_log`: 6461
- `goose_market_results`: 641

### Trainable settled rows
Using settled `win/loss` rows with `integrity_status = ok` only:
- NHL: **124**
- MLB: **124**
- NBA: **28**
- Total: **276**

### Dataset export
A first reproducible export job now exists:
- script: `scripts/goose2-export-training-dataset.mjs`
- command: `npm run goose2:export-training`
- outputs:
  - `tmp/goose2-training-dataset-v1.json`
  - `tmp/goose2-training-dataset-v1.csv`

Current export summary:
- source rows scanned: **1000**
- included rows: **276**
- excluded rows: **724**

Included by market:
- moneyline: **130**
- spread: **55**
- total: **85**
- first_five_total: **6**

Excluded by reason:
- manual_review: **183**
- non_trainable_label: **478**
- pending: **12**
- push: **3**
- unsupported_market: **48**

## Honest read
We are now clean enough to start training experiments.

But we are **not** at the point where the model should be trusted to build a strong autonomous pick system on its own yet.

Why:
1. **sample size is still small**, especially NBA
2. **manual-review volume is still high**, especially NHL alternate / unsupported grading paths
3. current feature rows are still mostly **phase1 minimal market-state features**, not deep pregame context
4. current decision logs are largely **shadow placeholders**, not real scored model decisions with populated `p_true`, `edge`, and tiering

## What is now true
### Yes
- we can begin building and testing a real supervised dataset now
- we can run baseline training loops on settled rows now
- we can measure calibration vs implied probability now

### Not yet
- we cannot honestly claim the model already has enough volume to self-build reliable production logic
- we should not trust autonomous publishing without more settled volume and richer features

## Next execution path
### Immediate
1. keep daily ingest and grading running
2. regenerate the training export daily
3. start a baseline model on the 276 clean rows as a calibration exercise, not as production truth

### Next required implementation
1. build a proper training runner
   - logistic regression baseline first
   - time-based train/validation/test split
   - benchmark against implied probability
2. enrich feature rows beyond raw market state
   - rest / schedule context
   - starter / goalie confirmation flags
   - price dispersion and movement features
   - system qualifier metadata
3. replace shadow-only decision placeholders with scored outputs
   - `p_true`
   - `calibrated_p_true`
   - `edge`
   - `recommended_tier`
   - rejection reasons grounded in model output

## Bottom line
The plumbing cleanup is done.
The first honest training dataset is now exportable.
The model can start learning.

But the model is still in **early training-wheel territory**, not "fully formed autonomous picker" territory.
