# Goose 2.0 — Phase 1 Implementation Pack

**Status:** In progress  
**Last Updated:** 2026-04-09  
**Owner:** Magoo  
**Goal:** Turn the Goose 2.0 roadmap into actual schema, contracts, and build order the repo can execute against immediately  
**Proof required:** migration files, TypeScript contracts, ingest scaffolding, verification output, git commit

---

## 1. What Phase 1 actually is

Phase 1 is not "the model is done".

Phase 1 is the warehouse spine that Goose 2.0 needs before the modeling layer can be real.

Specifically, Phase 1 creates:
- a canonical event spine
- a real candidate universe
- a candidate result layer
- a feature row layer
- an explicit decision log
- shared market taxonomy + ID generation rules

This lets Goose stop learning only from picks it already chose.

---

## 2. Existing tables we are keeping

These stay in place.

### Raw archive rails
- `market_snapshots`
- `market_snapshot_events`
- `market_snapshot_prices`

Role:
- raw archived odds board capture
- not the candidate universe
- source material for Goose 2.0 ingestion

### Current pick-output / learning rails
- `goose_model_picks`
- `goose_signal_weights`

Role:
- current sandbox pick artifacts
- current signal learning loop
- not the Goose 2.0 warehouse core

### System / production rails
- `system_qualifiers`
- `pick_history`
- `pick_slates`

Role:
- upstream signal sources or downstream published output
- not the Goose 2.0 warehouse core

---

## 3. New Phase 1 tables

## 3.1 `goose_market_events`
One canonical event row per game, matchup, or tournament event.

Purpose:
- stable join target for every market candidate
- decouples event identity from any one book or snapshot

## 3.2 `goose_market_candidates`
One row per captured bettable market observation.

Purpose:
- the real candidate universe
- supports multiple books, multiple timestamps, multiple market types

## 3.3 `goose_market_results`
One settlement row per candidate.

Purpose:
- candidate truth labels
- training and audit source of truth for outcomes

## 3.4 `goose_feature_rows`
One auditable feature payload per candidate per feature version.

Purpose:
- store derived features without prematurely hard-coding every feature into columns
- support feature-versioned modeling and replay

## 3.5 `goose_decision_log`
One explicit decision record per scoring / policy action.

Purpose:
- track why a candidate was accepted, rejected, shadowed, or published
- separate prediction from decisioning

---

## 4. Canonical market taxonomy for Phase 1

We need one naming system, otherwise this turns into spaghetti again.

### Core `market_type`
Allowed Phase 1 values:
- `moneyline`
- `spread`
- `total`
- `first_five_moneyline`
- `first_five_total`
- `first_quarter_spread`
- `third_quarter_spread`
- `player_prop_points`
- `player_prop_rebounds`
- `player_prop_assists`
- `player_prop_shots_on_goal`
- `player_prop_goals`
- `player_prop_hits`
- `player_prop_total_bases`
- `player_prop_strikeouts`
- `golf_outright`
- `golf_top_5`
- `golf_top_10`
- `golf_top_20`
- `golf_matchup`
- `unknown`

### Optional `submarket_type`
Use this only when needed to preserve detail without polluting `market_type`.

Examples:
- `full_game`
- `away_team`
- `home_team`
- `over`
- `under`
- `round_1`
- `finishing_position`
- `head_to_head`

Rule:
- `market_type` is the stable canonical bucket
- `submarket_type` stores narrower distinctions

---

## 5. ID strategy

Phase 1 uses deterministic text business IDs for the Goose 2.0 spine.

Why:
- current repo already mixes ID styles
- deterministic IDs make replay, dedupe, shadow mode, and backfill safer
- they are easier to compute from raw capture inputs

## 5.1 Event ID
Format:
- `evt:{sport}:{league}:{away}@{home}:{date_bucket}`
- fallback for golf or non-team events:
  - `evt:{sport}:{league}:{source}:{source_event_id}`

## 5.2 Candidate ID
Format:
- `cand:{event_id}:{market_type}:{participant_key}:{side}:{line_key}:{book}:{capture_bucket}`

## 5.3 Feature row ID
Format:
- `feat:{candidate_id}:{feature_version}`

## 5.4 Decision ID
Format:
- `dec:{candidate_id}:{policy_version}:{ts_bucket}`

Rule:
- IDs must be reproducible from normalized values
- raw vendor strings never become canonical IDs directly without normalization

---

## 6. New TypeScript contracts

Create these first.

### `src/lib/goose2/types.ts`
Defines:
- market taxonomy enums / unions
- event, candidate, result, feature row, decision log types
- participant types
- decision statuses
- integrity statuses

### `src/lib/goose2/taxonomy.ts`
Defines:
- canonical market type constants
- mapping helpers from existing odds/snapshot rails into Goose 2.0 taxonomy

### `src/lib/goose2/ids.ts`
Defines:
- deterministic ID builders for event, candidate, feature row, and decision log

### `src/lib/goose2/normalizers.ts`
Defines:
- string normalization helpers
- participant key normalization
- line normalization
- side normalization
- capture bucket helpers

---

## 7. New ingest/service scaffolding

### `src/lib/goose2/ingest-snapshots.ts`
Purpose:
- convert existing `market_snapshot_events` + `market_snapshot_prices` rows into:
  - `goose_market_events`
  - `goose_market_candidates`

First supported source:
- current aggregated team-market archive

### `src/lib/goose2/feature-mappers.ts`
Purpose:
- map current system outputs and current goose-model context into `system_flags` and starter feature payload shape

### `src/lib/goose2/policy.ts`
Purpose:
- shared decision payload contract
- not full production policy yet, but the skeleton for explicit accept/reject decisions

### `src/lib/goose2/repository.ts`
Purpose:
- write helpers for new Goose 2.0 tables
- keep DB interaction out of route handlers

---

## 8. SQL build order

### Migration 1
`create_goose2_phase1_core_tables`

Contains:
- `goose_market_events`
- `goose_market_candidates`
- `goose_market_results`
- `goose_feature_rows`
- `goose_decision_log`
- indexes
- RLS
- service-role write policies
- public or authenticated read policy only where appropriate

### Migration 2
`create_goose2_phase1_views`

Contains optional helper views:
- latest candidate per market
- latest event candidate board
- candidate with latest result
- decision summary view

### Migration 3
`goose2_backfill_from_market_snapshots`

Contains:
- safe backfill SQL or a staging helper path if we choose app-level backfill instead

Recommendation:
- do not put backfill into the core-table migration
- keep core DDL clean and reversible

---

## 9. Compatibility rules

## `market_snapshots*`
- stay untouched
- remain raw archive rails
- Goose 2.0 candidate rows may reference them via nullable foreign keys

## `goose_model_picks`
- stays alive as current sandbox / pick-output table
- Goose 2.0 does not pretend this is the candidate universe
- link only via nullable decision-log references where useful

## `system_qualifiers`
- remains system-trigger log
- used as an upstream feature / provenance input
- not the canonical result truth

## `pick_history`
- remains downstream published history
- never becomes the Goose 2.0 warehouse core

---

## 10. First 2-week build sequence

### Sprint block A, foundation
1. add implementation pack doc
2. add core migration
3. add `src/lib/goose2/types.ts`
4. add `src/lib/goose2/taxonomy.ts`
5. add `src/lib/goose2/ids.ts`
6. add `src/lib/goose2/normalizers.ts`

### Sprint block B, ingest spine
7. add repository helpers for Goose 2.0 tables
8. add snapshot-to-candidate mapper
9. ingest one sport safely from archived team markets
10. verify candidate counts against source snapshots

### Sprint block C, shadow wiring
11. generate initial feature rows from existing context and system rails
12. write decision log entries in shadow mode only
13. compare shadow candidates vs current Goose picks
14. produce first candidate-universe audit

---

## 11. Definition of done for this Phase 1 milestone

This milestone is done when:
- migration exists in repo
- Goose 2.0 core types exist in repo
- taxonomy + ID rules exist in repo
- snapshot ingest scaffold exists in repo
- all changes are committed
- verification output proves the files exist and parse cleanly

This milestone is not done because a roadmap exists.
It is done when the repo has a real spine.
