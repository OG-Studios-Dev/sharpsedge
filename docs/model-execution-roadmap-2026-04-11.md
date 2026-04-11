# Goosalytics Model Execution Roadmap — 2026-04-11

## Goal
Build a model pipeline that is trustworthy enough to bet from, not just interesting enough to demo.

## Hard truth
A "perfect model" does not exist.

What we can build is a model system that is:
- data-clean
- leakage-resistant
- calibrated
- continuously audited
- good enough to beat our current manual/system baseline

If the rails are dirty, the model will lie with confidence.

---

# Phase 1 — Perfect the data rails

## Objective
Make event identity, market capture, and grading reliable enough that training data is not poisoned.

## Owner
Magoo

## Success looks like
- canonical event identity per real game
- no legacy/synthetic duplicates leaking into training tables
- repeatable daily ingest across NHL, NBA, MLB
- grading outcomes trustworthy enough for supervised training

## Required work
### 1. Event identity discipline
- enforce one canonical `event_id` per game
- preserve legacy ids only in metadata, never as active competing rows
- add recurring drift audit for:
  - duplicate matchup-time ids
  - synthetic snapshot ids becoming permanent ids
  - mismatched upstream ids

### 2. Market capture quality
- continue daily snapshot ingest for NHL, NBA, MLB
- verify market families are being banked consistently:
  - moneyline
  - spread
  - total
  - first period / first quarter / first five where supported
  - selected player props where source quality is acceptable
- track source freshness and missing-book gaps

### 3. Grading integrity
- ensure `goose_market_results` is reliable for:
  - win
  - loss
  - push
  - void
  - postponed
  - cancelled
  - manual review
- add audit checks for:
  - ungraded stale rows
  - impossible grades
  - missing settlement timestamps
  - duplicate result writes

### 4. Query correctness
- update audits/debug tooling so decision-log reads use `goose_market_events` joins where needed
- stop relying on invalid direct filters like `goose_decision_log.sport`

## Proof required
- daily audit output showing clean identity state
- sample event mappings proving no active duplicate ids
- sample graded rows across NHL/NBA/MLB
- proof that snapshot ingest, shadow, and grade are running daily

## Phase 1 gate
Do not move on until:
- daily banking is stable for at least 7 straight days
- no known duplicate identity pollution remains in active rows
- grading error rate is effectively zero on reviewed samples

---

# Phase 2 — Build the training dataset

## Objective
Create a model-ready table that joins market state, features, and final outcomes without leakage.

## Owner
Magoo

## Success looks like
- one row per candidate/market observation or one clearly defined training grain
- all features timestamp-correct
- labels attached only from post-settlement truth
- reproducible train/validation/test slices by date

## Required work
### 1. Define training grain
Choose one, then stay disciplined:
- per candidate snapshot row, or
- per best-price candidate at fixed checkpoints, or
- per final pregame decision candidate

Recommendation:
- start with **pregame best-price candidate rows at fixed capture checkpoints**
- easier to reason about, less noisy than every micro-snapshot

### 2. Build feature groups
Minimum useful feature groups:
- market features
  - odds
  - implied probability
  - spread / total / line
  - book source
  - price dispersion across books
  - best vs median price
  - line movement and odds movement
- event context
  - sport
  - game date/time
  - home/away
  - rest/travel/back-to-back where available
- team strength / form
  - rolling performance windows
  - offensive/defensive metrics
  - recent game states
- availability/context features
  - probable starters
  - lineup quality
  - injury/news flags
- internal system features
  - which heuristic systems qualified the candidate
  - qualifier count
  - prior system hit rate only if timestamp-safe

### 3. Build label rules
For each row, define:
- target = win/loss/push/void eligibility
- whether pushes are dropped or modeled separately
- whether cancelled/postponed rows are excluded
- whether odds range filters apply to training

Recommendation:
- train first on binary settled bets only
- exclude void/cancelled/postponed/manual-review rows
- treat pushes separately, not as wins

### 4. Prevent leakage
Mandatory rules:
- no using closing lines for rows meant to simulate earlier decisions
- no future injury/news data attached retroactively
- no final stats leaking into pregame features
- all rolling stats must be computed from data available before capture time

## Proof required
- schema for training table/view
- example feature row with timestamps
- train/validation/test split logic documented
- leakage checklist completed

## Phase 2 gate
Do not train until:
- sample training rows are manually spot-checked
- feature timestamps are proven pre-decision
- label attachment is verified on random samples

---

# Phase 3 — Train the first real shadow model

## Objective
Train a model that predicts outcome probability better than heuristics and raw market intuition.

## Owner
Magoo

## Success looks like
- calibrated probabilities, not just class picks
- meaningful lift over baseline
- stable performance across holdout windows

## Required work
### 1. Baselines first
Before any fancy model, compare against:
- implied probability baseline from market odds
- simple system-rule baseline
- naive recent-form baseline

If the model cannot beat these, it is not ready.

### 2. Train simple before clever
Start with:
- logistic regression
- gradient boosted trees
- calibrated tree ensemble

Do not jump straight to overfit wizard bullshit.

### 3. Evaluate the right way
Track:
- log loss
- Brier score
- calibration curve
- ROI by threshold bucket
- CLV relationship where available
- performance by sport, market type, and odds bucket

### 4. Shadow only
The first model does not place production picks.
It only:
- scores candidates
- logs probabilities
- compares to outcomes later
- competes silently against current systems

## Proof required
- training run artifact
- validation metrics vs baselines
- calibration output
- shadow predictions logged daily

## Phase 3 gate
Do not promote until:
- model beats baseline on holdout data
- calibration is acceptable
- shadow results stay stable for a meaningful sample size

---

# Phase 4 — Promotion standards for live picks

## Objective
Define when a model is allowed to influence or drive picks.

## Owner
Marco approves, Magoo enforces

## Success looks like
- promotion is rule-based, not vibe-based
- production picks remain explainable and auditable

## Required rules
### 1. Promotion requirements
A model can influence production only if:
- holdout metrics beat baseline
- shadow performance remains stable across a real sample
- no active data integrity issue exists
- explanation output is intelligible enough for pick writeups

### 2. Production guardrails
- no pick if source odds are stale or missing
- no pick if confidence comes from thin or broken inputs
- no pick if there is disagreement between model output and known bad data state
- keep sport-specific odds caps and quality gates

### 3. Human override
- Marco can always veto
- Magoo can suppress model output if integrity checks fail
- no autonomous production betting off a broken pipeline

## Proof required
- written promotion checklist
- model card / versioning record
- rollback path
- daily QA summary for live model-assisted picks

## Phase 4 gate
Production influence begins only after explicit approval.

---

# Operating cadence

## Daily
- snapshot ingest audit
- identity drift audit
- grading audit
- shadow output logging

## Weekly
- feature quality review
- error review
- model-vs-baseline dashboard
- market coverage gap review

## Monthly
- retraining decision
- feature pruning/addition review
- calibration review
- backfill progress review

---

# The actual order of attack

## Right now
1. keep daily NHL/NBA/MLB banking alive
2. tighten identity and grading audits
3. define the exact training grain
4. build the first leakage-safe training table
5. run baseline models
6. run first shadow model
7. promote only if it wins honestly

---

# What would kill this project fast
- training on dirty event identities
- bad grading labels
- using future info in features
- obsessing over win rate instead of calibration and price edge
- shipping a model because it feels smart

---

# Recommendation
The next concrete build target should be:

**Create the first training-ready dataset spec and audit checklist, then backfill enough clean rows to train a baseline model honestly.**

That is the hinge point between "cool data project" and "actual betting model." 
