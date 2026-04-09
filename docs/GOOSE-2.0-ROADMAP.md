# Goose 2.0 — Full Plan and Execution Roadmap

**Status:** Proposed, not started  
**Last Updated:** 2026-04-09  
**Owner:** Magoo  
**Goal:** Turn Goose from a signal-weight sandbox into a real per-sport, per-market betting intelligence engine  
**Proof required:** schema changes, ingest jobs, model artifacts, backtest outputs, calibration reports, shadow-mode results

---

## 1. Executive Summary

Goose today is a useful learning layer, but it is not yet a real ML betting engine.

Current Goose:
- scores candidates surfaced by upstream pick APIs
- learns signal weights from graded picks
- has decent sport-specific context rails
- is admin-only and sandboxed

Current Goose is **not**:
- a universal market scanner
- a line-level candidate engine
- a proper prediction + decision system
- a true out-of-sample ML pipeline

### Goose 2.0 objective
Build a system that:
1. captures all supported markets and lines
2. creates a labeled candidate universe
3. scores every candidate with sport/market-specific models
4. decides bet/no-bet in a separate policy layer
5. learns continuously from outcomes, CLV, and model drift

---

## 2. Hard Truths / Non-Negotiables

### What must be true
- Systems are **features**, not separate pick silos
- The model must learn from the **full opportunity set**, not only chosen picks
- Prediction and betting policy must be separate
- Every model must be evaluated out-of-sample by time
- No user-facing Goose 2.0 rollout until shadow mode proves edge

### What we are explicitly not doing
- No LLM-as-core-predictor nonsense
- No one-model-for-all-sports shortcut
- No “confidence score” theater without calibration
- No merging model picks into production because the UI looks cool

---

## 3. Current-State Audit

### What exists now
- Goose model generation routes
- Signal weight store and grading loop
- System qualifier ingestion
- Production pick ingestion
- Sport-specific feature enrichers for NHL/NBA/MLB
- Admin UI for sandbox monitoring

### Main gap
The generator currently depends on upstream pick APIs rather than generating a full candidate universe itself.

### Bottom-line diagnosis
The current architecture is downstream-of-selection. Goose 2.0 must become the selector.

---

## 4. Goose 2.0 Target Architecture

Goose 2.0 has five layers.

## Layer A — Market Capture Layer
Purpose: store every supported line and price we can see.

### Core responsibilities
- ingest sportsbook odds snapshots repeatedly through the day
- normalize books, markets, participants, and lines
- preserve open/current/close snapshots
- preserve multiple books, not just best line

### New tables
- `market_events`
- `market_candidates`
- `market_snapshots`
- `market_results`

### Minimum columns for `market_candidates`
- `candidate_id`
- `sport`
- `league`
- `event_id`
- `event_date`
- `market_type`
- `submarket_type`
- `participant_type` (team/player)
- `participant_id`
- `participant_name`
- `opponent_id`
- `opponent_name`
- `side` (over/under/home/away/playerA/playerB)
- `line`
- `odds`
- `book`
- `capture_ts`
- `is_best_price`
- `source`
- `raw_payload`

### Minimum columns for `market_results`
- `candidate_id`
- `closing_line`
- `closing_odds`
- `result`
- `actual_stat`
- `settlement_ts`
- `grade_source`
- `integrity_status`

---

## Layer B — Feature Store Layer
Purpose: build one auditable feature row per candidate.

### Feature groups
#### Shared betting features
- implied probability from odds
- line movement since open
- best price rank across books
- market dispersion across books
- time-to-start
- market volatility
- closing-line delta

#### System-derived features
- qualifying systems fired yes/no
- qualifier count per candidate
- system-specific confidence/grade
- historical system win rate in similar contexts

#### Sport-specific features
##### NHL
- confirmed starter / backup / probable
- goalie quality
- rest gap
- travel fatigue
- three-in-four
- MoneyPuck xG deltas
- PP/PK differential
- shot danger profile
- likely line combinations where available

##### NBA
- player L5/L10 stat distribution
- projected minutes tier
- teammate-out usage bump
- DvP rank by stat and position
- pace proxy
- opponent injury impact
- role security

##### MLB
- starter quality
- FIP vs ERA divergence
- bullpen fatigue
- weather
- park factor
- handedness split
- umpire context
- lineup confirmation
- F5-specific context

##### PGA
- outright model probability
- top-5/top-10/top-20 estimated finish probabilities
- strokes gained trend
- field strength
- course fit
- historical placement distribution
- live odds divergence vs fair price

### New table
- `feature_store`

Suggested schema:
- `candidate_id`
- `sport`
- `market_type`
- `feature_version`
- `feature_payload` (jsonb)
- `system_flags` (jsonb)
- `source_chain` (jsonb)
- `generated_ts`

---

## Layer C — Prediction Layer
Purpose: estimate true probability for each candidate.

### Rule
One giant cross-sport model is banned for v1 of Goose 2.0.

### Initial model families
1. NHL team moneyline
2. NHL player SOG
3. NBA player points
4. MLB team moneyline
5. MLB F5 moneyline / F5 total
6. PGA placements
7. PGA outrights (separate model)

### Recommended first modeling stack
- baseline: logistic regression
- next: LightGBM / XGBoost
- calibration: isotonic or Platt scaling

### Output fields
- `p_true`
- `model_version`
- `calibrated_p_true`
- `prediction_confidence_band`
- `prediction_ts`

### New table
- `model_predictions`

---

## Layer D — Decision Policy Layer
Purpose: decide whether a candidate is actually bettable.

This is where business rules live, not in the model.

### Inputs
- calibrated probability
- current odds
- edge
- book quality
- line quality
- sport caps
- daily exposure
- market correlation
- hard rules from Marco

### Outputs
- `bet_decision` yes/no
- `recommended_tier` (A/B/C or High/Med/Low)
- `reason_rejected`
- `stake_suggestion`
- `policy_version`

### Policy checks
- hard odds cap
- minimum edge by sport/market
- max picks per sport
- max correlated picks per event
- no forced volume
- book trust rules
- line freshness rule

### New table
- `decision_log`

---

## Layer E — Learning / Monitoring Layer
Purpose: learn from what happened and detect bullshit quickly.

### Metrics to track
- hit rate
- ROI
- CLV
- calibration error
- Brier score / log loss
- edge bucket performance
- model drift over time
- signal drift over time
- per-book performance
- per-market performance
- no-bet false negative review sample

### Monitoring surfaces
- daily model health board
- weekly calibration report
- per-sport shadow-mode summary
- candidate funnel report
  - candidates seen
  - candidates scored
  - candidates passed policy
  - candidates published
  - settled outcomes

---

## 5. Data Model Rollout Plan

## Phase 1 — Build the Spine
### Goal
Create the universal candidate universe.

### Deliverables
- canonical market taxonomy
- candidate/event/snapshot/result tables
- first ingestion jobs for active sports
- market ID normalization rules

### Definition of done
- one row per candidate market instance
- same candidate can be traced across price updates and closing result
- all active books normalize into one structure

### Risk
This is the hardest and most important step. If this is messy, the rest is fake.

---

## Phase 2 — Promote Systems into Features
### Goal
Stop treating systems as sidecars.

### Deliverables
- every system writes feature flags against candidate rows
- system outputs normalized as qualifiers, not direct picks
- candidate rows show which systems fired and why

### Definition of done
- for any candidate, we can answer: which systems liked this and why?
- systems can influence scoring without owning selection

---

## Phase 3 — Feature Store and Labeling
### Goal
Make training data real.

### Deliverables
- feature generation jobs per sport/market
- settlement labeling pipeline
- integrity checks for missing stats or stale lines
- dataset versioning

### Definition of done
- training export works by sport/market/date window
- labels are reproducible
- bad/missing rows are flagged, not silently accepted

---

## Phase 4 — First Real Models
### Goal
Ship first real predictive models in shadow mode.

### Order
1. NHL team ML
2. MLB F5
3. NBA points props
4. NHL SOG props
5. PGA placements

### Deliverables
- baseline models
- feature importance reports
- calibration reports
- backtest notebooks or scripts
- model registry with versions

### Definition of done
- each model beats naive baseline out-of-sample
- calibration is sane
- no absurd overconfidence

---

## Phase 5 — Decision Engine
### Goal
Move from probability to actual picks.

### Deliverables
- policy service
- stake/priority framework
- anti-correlation logic
- per-sport exposure limits
- daily pick caps enforced after scoring

### Definition of done
- output is a ranked list of candidates with explicit accept/reject reasons
- every rejected edge has a reason logged

---

## Phase 6 — Shadow Mode
### Goal
Run Goose 2.0 live without exposing it.

### Deliverables
- daily shadow picks
- compare against current production rail
- compare against close
- compare against system picks
- compare against no-bet opportunities

### Definition of done
- 30 to 60 days of clean shadow evidence
- positive CLV
- coherent edge-bucket behavior
- acceptable calibration by sport

---

## Phase 7 — Controlled Rollout
### Goal
Expose Goose 2.0 only if earned.

### Rollout ladder
- Stage 0: admin only
- Stage 1: internal allowlist
- Stage 2: optional experimental toggle
- Stage 3: default only if clearly superior over time

### Entry gates
- stable shadow performance
- positive CLV
- no catastrophic drift
- strong auditability
- clear explanation layer

---

## 6. 8-Week Execution Roadmap

## Week 1 — Architecture and Taxonomy
### Focus
Stop ambiguity.

### Tasks
- define supported sports and first markets
- define canonical market taxonomy
- define event/candidate/result IDs
- define book normalization rules
- define system-to-feature mapping

### Deliverables
- schema spec
- market taxonomy doc
- candidate ID strategy

## Week 2 — Candidate Capture Infrastructure
### Focus
Get every market row flowing.

### Tasks
- build `market_events`, `market_candidates`, `market_snapshots`
- wire odds ingestion into normalized writes
- store open/current/close chain where available
- build snapshot dedupe rules

### Deliverables
- working candidate ingestion for at least NHL + MLB + NBA core markets

## Week 3 — Results + Labeling
### Focus
Make rows trainable.

### Tasks
- build `market_results`
- attach settlement logic per market
- build integrity flags
- handle void/postponed/unavailable cleanly

### Deliverables
- end-to-end candidate -> result lifecycle

## Week 4 — Feature Store v1
### Focus
Attach useful context to every candidate.

### Tasks
- implement `feature_store`
- attach shared betting features
- attach system flags
- attach sport-specific feature payloads
- add provenance chain

### Deliverables
- one feature row per candidate for first model markets

## Week 5 — First Models
### Focus
Train, don’t guess.

### Tasks
- train first baseline models
- establish naive baselines
- build time-split evaluation
- calibrate probabilities

### Deliverables
- baseline model artifacts for 2-3 markets
- evaluation report

## Week 6 — Decision Layer
### Focus
Turn probabilities into disciplined picks.

### Tasks
- build policy engine
- implement edge thresholds by market
- implement daily exposure and correlation caps
- create accept/reject audit log

### Deliverables
- ranked bet/no-bet output in shadow mode

## Week 7 — Shadow Comparisons
### Focus
Pressure test against reality.

### Tasks
- compare Goose 2.0 vs current production rail
- compare Goose 2.0 vs system-only picks
- compare Goose 2.0 vs close line
- surface candidate funnel metrics

### Deliverables
- weekly shadow report

## Week 8 — Review and Cutover Decision
### Focus
Decide with evidence.

### Tasks
- review calibration, ROI, CLV, stability
- identify weak markets to park
- decide what stays sandboxed vs promoted
- lock next 30-day operating plan

### Deliverables
- go / no-go recommendation for internal live trial

---

## 7. Workstreams and Owners

## Workstream A — Data Spine
### Scope
Tables, normalization, ingestion, results
### Owner
Engineering
### Priority
P0

## Workstream B — Feature Platform
### Scope
Feature generation, provenance, system flags
### Owner
Engineering / analytics
### Priority
P0

## Workstream C — Modeling
### Scope
Training pipelines, calibration, evaluation
### Owner
Analytics / ML
### Priority
P1 after data spine

## Workstream D — Policy Engine
### Scope
Edge logic, caps, ranking, decision log
### Owner
Product + engineering
### Priority
P1

## Workstream E — Monitoring
### Scope
Health boards, drift, CLV, reports
### Owner
Ops / engineering
### Priority
P1

---

## 8. Initial Market Scope

Do not boil the ocean.

### First markets to fully support
#### NHL
- team ML
- player SOG

#### NBA
- player points

#### MLB
- team ML
- F5 ML
- F5 total

#### PGA
- top 5
- top 10
- top 20
- outrights

### Markets to delay
- obscure alternates
- same game parlays
- exotics with weak data density
- props without reliable settlement rails

---

## 9. Success Metrics

## Data quality metrics
- candidate capture coverage by sport/market
- percentage of rows with full settlement
- percentage of rows with complete feature payloads
- stale line rate
- duplicate candidate rate

## Model quality metrics
- out-of-sample hit rate
- Brier score
- log loss
- calibration curve quality
- edge bucket monotonicity
- CLV by model and market

## Business metrics
- shadow ROI vs production ROI
- picks accepted vs rejected
- average edge of published picks
- average price quality vs close
- stability across 30-day windows

---

## 10. Kill Rules / Safety Rails

Pause a market/model if any of the following happen:
- calibration blows out for 2 consecutive weekly checks
- CLV turns materially negative over meaningful sample
- model underperforms naive baseline over a full review window
- settlement integrity drops below acceptable threshold
- source freshness becomes unreliable

Goose 2.0 should be allowed to say:
- no pick
- not enough data
- this market is parked

That’s a strength, not a weakness.

---

## 11. Immediate Next Actions

## This week
1. Approve Goose 2.0 architecture direction
2. Freeze first supported market list
3. Design universal candidate schema
4. Design system-to-feature mapping
5. Decide what is in and out for v1

## Next build sequence
1. schema + taxonomy
2. candidate ingestion
3. result labeling
4. feature store
5. first models
6. decision layer
7. shadow mode

---

## 12. Final Recommendation

Do not treat Goose 2.0 as “more AI.”
Treat it as a disciplined market intelligence platform.

If we get the data spine and training set right, the model layer becomes real.
If we skip that and jump to flashy AI, we’re just dressing up heuristics.

That’s the difference between a product and a toy.
