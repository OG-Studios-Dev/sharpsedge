# Goose2 Shadow Scoring Policy — 2026-04-11

## Purpose
Wire the first real shadow scoring loop and enforce the product philosophy Marco called out plainly:

**few picks, high confidence, no spray-and-pray bullshit.**

## What was added
### New scorer
- `scripts/goose2-score-shadow.mjs`
- command: `npm run goose2:score-shadow`
- output artifact: `tmp/goose2-shadow-score-report.json`

### Policy version
- `phase2-shadow-selective`

### Model version
- `baseline-logreg-v1`

## Current gating rules
A candidate only becomes a shadow-approved pick if **all** conditions pass:
1. linked system qualifier exists
2. `calibrated_p_true >= 0.60`
3. `edge >= 0.035`
4. event still pregame (`scheduled` or `unknown`)
5. max **3 picks per sport per run**

If any fail, the decision is still written to `goose_decision_log`, but marked rejected with explicit reasons.

## Fields now written back to `goose_decision_log`
- `model_version`
- `policy_version`
- `bet_decision`
- `recommended_tier`
- `stake_suggestion`
- `p_true`
- `calibrated_p_true`
- `edge`
- `confidence_band`
- `reason_rejected`
- `rejection_reasons`
- explanation blob with policy thresholds

## First run result
Run completed and wrote real scored rows.

Summary:
- candidates considered: **43**
- decisions written: **43**
- approved picks: **0**
- rejected: **43**

## Why zero picks is actually good here
This is the system behaving correctly.

It means the current shadow model did **not** find enough high-confidence edges with qualifier support to justify a pick.

That is far better than forcing weak plays just to look active.

## What the first run revealed
### Good
- scoring loop works
- writeback works
- decision logs now carry actual probability / edge values
- rejection reasons are explicit and auditable

### Important constraint revealed
Most candidates failed because of one or both of these:
1. **no linked system qualifier**
2. **confidence still below the 0.60 floor**

That is exactly the kind of pressure we want right now.
It forces the system to earn picks.

## Product philosophy now encoded
This is the policy direction from Marco translated into actual system behavior:
- volume is not a KPI
- confidence is a KPI
- users pay for selectivity and trust, not noisy action
- zero picks is acceptable
- low-confidence mass output is not acceptable

## Best next steps
1. improve qualifier linkage coverage
   - more current-day systems should flow into feature rows
2. enrich features so confidence can rise for truly good spots
   - lineup / goalie / rest / movement context
3. add calibration tracking by sport
   - NHL / MLB / NBA should likely get different publish thresholds later
4. keep shadow mode strict
   - do not relax floors just to make the app feel busy

## Bottom line
Goose2 now has a real shadow scoring loop.
And the system is already behaving the right way philosophically:

**if confidence is not there, it shuts the hell up.**
