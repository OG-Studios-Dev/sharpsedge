# System Data / Logic Audit — 2026-03-21

Purpose: final pre-qualification-tracking audit of every cataloged system.

This doc answers four things for each system:
1. current input data path
2. current logic / rule path
3. honest output status
4. missing dependencies to close before qualification-performance tracking

It also leaves a concrete tomorrow-7am attack list.

---

## Executive reality check

The repo has **two layers** that matter:
- **Catalog/store layer:** `data/systems-tracking.json`
- **Actual system logic layer:** `src/lib/systems-tracking-store.ts`

The important gap tonight was that these two layers were **not fully aligned**:
- `Swaggy Stretch Drive` had real refresh logic in code but the store still presented it as parked/context-only.
- `Tony’s Hot Bats` had real refresh logic in code but the store still presented it as blocked.

That is exactly the kind of dishonesty that would poison qualification performance tracking if left unresolved.

### What got closed tonight
- Updated `data/systems-tracking.json` so **Swaggy** is honestly represented as `trackable_now` / alert-only qualifier logic live.
- Updated `data/systems-tracking.json` so **Tony’s Hot Bats** is honestly represented as `trackable_now` / early-trigger watchlist live, while still clearly **not** a validated picks model.
- Created this repo artifact to freeze the current system-by-system truth before building qualification performance tracking.

---

## System-by-system review

### 1) NBA Goose System
- Input path:
  - `getAggregatedOddsForSport("NBA")`
  - `getNBASchedule(...)`
  - `getNBAGameSummary(...)`
  - store file: `data/systems-tracking.json`
- Logic path:
  - `isGooseQualifier(...)`
  - `buildGooseRecord(...)`
  - `refreshGooseSystemData(...)`
  - readiness: `applyGooseReadiness(...)`
- Honest output status:
  - **live qualifier**, but **partial settlement only**
- Missing dependencies:
  - quarter-line ingestion for 1Q ATS
  - quarter-line ingestion for 3Q ATS
  - stable quarter settlement completeness across all qualifiers
- Notes:
  - This is the closest thing to a real sequence-tracking system already in motion.
  - Performance tracking should not pretend sequence history is complete until quarter lines exist consistently.

### 2) Beefs Bounce-Back / Big ATS Loss
- Input path:
  - none wired beyond catalog metadata
- Logic path:
  - no registered refresh tracker
- Honest output status:
  - **blocked**
- Missing dependencies:
  - prior-game closing spread archive
  - ATS result history
  - rest/travel context
  - explicit threshold definition for “big ATS loss”

### 3) The Blowout
- Input path:
  - NBA schedule/results/standings/odds via helper rails in `systems-tracking-store.ts`
  - effectively built on `getNBAQualifierContext()` + `getNBATargetEvents()` + recent games / standings / spreads
- Logic path:
  - `getTheBlowoutQualifiers(...)`
  - `buildBlowoutRecord(...)`
  - `refreshTheBlowoutSystemData(...)`
- Honest output status:
  - **context-only watchlist / qualifier tracker**
- Missing dependencies:
  - bet-direction rulebook
  - optional historical close-vs-margin validation for stronger confidence
- Notes:
  - Input and logic are real.
  - Output is not a picks system; it is a neutral qualifier feed.

### 4) Hot Teams Matchup
- Input path:
  - NBA schedule/results/standings/current odds/posted totals via qualifier helpers
- Logic path:
  - `getHotTeamsMatchupQualifiers(...)`
  - `buildHotTeamsMatchupRecord(...)`
  - `refreshHotTeamsMatchupSystemData(...)`
- Honest output status:
  - **context-only watchlist / qualifier tracker**
- Missing dependencies:
  - side-vs-total-vs-pass decision rulebook
  - proof that this should graduate beyond discovery mode

### 5) Fat Tonys Fade
- Input path:
  - none wired beyond catalog metadata
- Logic path:
  - no registered refresh tracker
- Honest output status:
  - **blocked**
- Missing dependencies:
  - public handle/ticket splits source
  - line-move history
  - consensus threshold / trigger logic

### 6) Coaches Fuming Scoring Drought
- Input path:
  - none wired beyond catalog metadata
- Logic path:
  - no registered refresh tracker
- Honest output status:
  - **blocked**
- Missing dependencies:
  - scoring-drought event definition
  - coach/player quote tagging rail
  - offensive baseline filter

### 7) Swaggy Stretch Drive
- Input path:
  - `getTodayNHLContextBoard()`
  - `getAggregatedOddsForSport("NHL")`
  - MoneyPuck / goalie / schedule / standings / official-news rails via NHL context board
- Logic path:
  - `qualifiesForSwaggy(...)`
  - `buildSwaggyQualifierRecord(...)`
  - `refreshSwaggyStretchDriveSystemData(...)`
- Honest output status:
  - **live qualifier / alert-only**, not mature picks model
- Missing dependencies:
  - better injury/news impact tagging
  - historical market snapshots / CLV rail
  - settlement + performance policy if this is later graded
- Notes:
  - This was the biggest catalog-vs-code honesty mismatch tonight.
  - Code was live; store copy was stale. Fixed.

### 8) Veal Bangers Playoff ZigZag
- Input path:
  - none wired beyond catalog metadata
- Logic path:
  - no registered refresh tracker
- Honest output status:
  - **parked**
- Missing dependencies:
  - playoff series-state data usage
  - overreaction rule set
  - price thresholds

### 9) BigCat Bonaza PuckLuck
- Input path:
  - none wired beyond catalog metadata
- Logic path:
  - no registered refresh tracker
- Honest output status:
  - **blocked**
- Missing dependencies:
  - exact external-source rule capture
  - xG / finishing-luck feed
  - external/native separation if activated later

### 10) Tony’s Hot Bats
- Input path:
  - `getMLBEnrichmentBoard(targetDate)`
  - official/partial MLB lineups
  - hitter game logs via `getMLBPlayerGameLog(...)`
  - weather / park factor / bullpen / F5 board context
- Logic path:
  - `buildTonysHotBatsTrigger(...)`
  - `refreshTonysHotBatsSystemData(...)`
  - readiness: `applyTonysHotBatsReadiness(...)`
- Honest output status:
  - **context-only / early-trigger watchlist live**
- Missing dependencies:
  - opponent starter context
  - explicit price-discipline rules
  - tracked outcomes / validation layer
  - stronger official-lineup completeness on same-day board
- Notes:
  - This is not blocked in the literal code path anymore.
  - It is live as a context/watchlist system, not a validated model. Catalog fixed to reflect that.

### 11) Falcons Fight Pummeled Pitchers
- Input path:
  - `getMLBSchedule(...)`
  - `getMLBOdds()` / `findMLBOddsForGame(...)`
  - probable starters from MLB schedule hydrate
  - `getMLBPlayerGameLog(...)`
  - `getMLBEnrichmentBoard(...)`
- Logic path:
  - `isPummeledStart(...)`
  - `scoreFalconsQualifier(...)`
  - `buildFalconsQualifierRecord(...)`
  - `refreshFalconsFightPummeledPitchersSystemData(...)`
  - readiness: `applyFalconsFightPummeledPitchersReadiness(...)`
- Honest output status:
  - **live qualifier / weighted alert rows**
- Missing dependencies:
  - historical validation layer
  - settlement / outcome ledger if performance is to be tracked
  - optional stronger F5 integration if expanded later
- Notes:
  - Inputs and rule path are real and already fairly mature.
  - Still not honest to present score as win probability.

### 12) Falcons Fight Big Upset Follow-Ups
- Input path:
  - none wired beyond catalog metadata
- Logic path:
  - no registered refresh tracker
- Honest output status:
  - **parked**
- Missing dependencies:
  - upset threshold definition
  - next-game action rules
  - pitching/bullpen carryover logic

### 13) Quick Rips F5
- Input path:
  - partial rails exist elsewhere in repo (`mlb-f5`, enrichment, books), but not connected to this system
- Logic path:
  - no registered refresh tracker for the system itself
- Honest output status:
  - **blocked**
- Missing dependencies:
  - F5 lines feed wired into system tracker
  - probable pitchers confirmation policy
  - starter mismatch model

### 14) Warren Sharp Computer Totals Model
- Input path:
  - none wired beyond catalog metadata
- Logic path:
  - no registered refresh tracker
- Honest output status:
  - **blocked**
- Missing dependencies:
  - external projections feed
  - totals line archive
  - external-model separation if activated later

### 15) Fly Low Goose
- Input path:
  - none wired beyond catalog metadata
- Logic path:
  - no registered refresh tracker
- Honest output status:
  - **parked**
- Missing dependencies:
  - actual NFL Goose qualifier rules

### 16) Tony’s Teaser Pleaser
- Input path:
  - none wired beyond catalog metadata
- Logic path:
  - no registered refresh tracker
- Honest output status:
  - **blocked**
- Missing dependencies:
  - teaser pricing ledger
  - key-number crossing rules
  - leg-level grading logic

---

## Cross-system truth table

### Systems with real wired input + rule paths right now
- NBA Goose System
- The Blowout
- Hot Teams Matchup
- Swaggy Stretch Drive
- Tony’s Hot Bats
- Falcons Fight Pummeled Pitchers

### Systems that are catalog-only today
- Beefs Bounce-Back / Big ATS Loss
- Fat Tonys Fade
- Coaches Fuming Scoring Drought
- Veal Bangers Playoff ZigZag
- BigCat Bonaza PuckLuck
- Falcons Fight Big Upset Follow-Ups
- Warren Sharp Computer Totals Model
- Fly Low Goose
- Tony’s Teaser Pleaser

### Systems with partial repo rails but no system tracker wired
- Quick Rips F5

---

## What qualification-performance tracking can honestly target first

If qualification tracking starts tomorrow, the honest first-wave systems are:
- NBA Goose System
- The Blowout
- Hot Teams Matchup
- Swaggy Stretch Drive
- Tony’s Hot Bats
- Falcons Fight Pummeled Pitchers

But they do **not** all support the same grading model.

### Safe first-wave grading buckets
1. **Qualifier-only logging now**
   - The Blowout
   - Hot Teams Matchup
   - Tony’s Hot Bats
   - Swaggy Stretch Drive
   - Falcons Fight Pummeled Pitchers

2. **Qualifier + settlement candidate**
   - NBA Goose System
   - only after quarter-line completeness is explicitly handled

3. **Do not include yet**
   - every catalog-only / blocked / parked system

---

## Tomorrow 7am attack list

Priority order is based on leverage and risk.

### P0 — qualification-tracking schema and immutability
1. Add a dedicated immutable qualification ledger separate from mutable catalog presentation.
2. Store:
   - system id
   - qualifier timestamp
   - event/game id
   - market snapshot used at qualification time
   - status (`qualified`, `invalidated`, `graded`, `void`, etc.)
   - grading fields by system type
3. Do not rely on `data/systems-tracking.json` rows alone as the long-term performance source of truth.

### P1 — separate system types by what can actually be graded
4. Add system classification for tracking mode:
   - `qualifier_only`
   - `qualifier_plus_settlement`
   - `definition_only`
5. Use that classification to prevent fake win-rate math on context-only systems.

### P1 — Goose settlement honesty
6. Add explicit missing-quarter-line flags and “ungradeable” state for Goose.
7. Do not count Goose qualifier rows in performance summaries unless required quarter market + score inputs exist.

### P1 — first-wave qualification capture
8. Instrument refresh flows for:
   - The Blowout
   - Hot Teams Matchup
   - Swaggy Stretch Drive
   - Tony’s Hot Bats
   - Falcons Fight Pummeled Pitchers
   so each refresh writes immutable qualification events, not just mutable current rows.

### P2 — market snapshot linkage
9. Link qualification rows to `data/market-snapshots/...` where possible.
10. For systems lacking history, store current observed market at qualification time so later CLV / invalidation work is possible.

### P2 — outcome policy per system
11. Write grading policy doc for each first-wave system:
   - what counts as a qualified play vs context row
   - whether there is an actual “bet” to grade
   - what market/outcome settles it
12. Especially decide whether Swaggy / Hot Bats / Blowout / Hot Teams remain qualifier-only dashboards for now.

### P3 — next missing rails
13. Quick Rips F5: decide whether to wire actual F5 inputs next or leave parked.
14. Beefs Bounce-Back: line archive + ATS margin feed if NBA historical bounce-back matters.
15. Fat Tonys Fade: either source real splits or stop talking about it.

---

## Recommendation before building performance tracking

Do **not** build one monolithic “system record / units / win%” layer across all systems.
That will create fake precision immediately.

Build two lanes:
- **Qualification lane**: immutable, all first-wave live systems
- **Performance lane**: only systems with explicit market, entry, and grading policy

That is the honest architecture.

---

## Files touched tonight
- `data/systems-tracking.json`
- `docs/SYSTEM-DATA-LOGIC-AUDIT-2026-03-21.md`

---

## 2026-03-22 hardening follow-up
- Verified build passes after the tracking-layer cleanup (`npm run build`).
- Fixed a store-layer coherence bug: `writeSystemsTrackingData()` now regenerates `qualificationLog` for every persisted system before writing `data/systems-tracking.json`. Before this patch, refresh/write paths only upserted refreshed systems, so the on-disk store could lag behind the in-memory read normalization.
- Verified current persisted artifact remains honest:
  - **NBA Goose System:** 1 live qualifier row stored for 2026-03-22, with qualification log entry present.
  - **The Blowout / Hot Teams Matchup / Swaggy Stretch Drive / Tony's Hot Bats / Falcons Fight Pummeled Pitchers:** 0 stored rows in the checked-in artifact at verification time. That is acceptable and more honest than seeding fake history.
- The qualifier-only vs settlement-capable split is now explicit in code/store behavior:
  - **Settlement-capable now:** NBA Goose only.
  - **Qualifier-only / alert-only now:** The Blowout, Hot Teams Matchup, Swaggy Stretch Drive, Tony's Hot Bats, Falcons Fight Pummeled Pitchers.
- Remaining honest limitation: several refresh rails still depend on live upstream boards/odds/lineups. When the board does not qualify, these systems correctly persist zero rows rather than synthetic placeholders.

