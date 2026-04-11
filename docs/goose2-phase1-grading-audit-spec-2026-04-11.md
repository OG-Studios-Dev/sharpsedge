# Goose2 Phase 1 Grading Audit Spec — 2026-04-11

## Goal
Make sure supervised labels are trustworthy before they ever reach a training dataset.

## Owner
Magoo

## Why this exists
A bad label is worse than a missing label.

If results are wrong, duplicated, stale, or unresolved when they should be settled, the model will learn garbage with false confidence.

---

## Audit scope
Primary tables:
- `goose_market_results`
- `goose_market_candidates`
- `goose_market_events`
- optional joins to source grading payloads where available

Sports in scope now:
- NHL
- NBA
- MLB

---

## Required checks

### 1. Ungraded stale candidates
Flag settled-looking events whose candidate rows still have no result after a defined buffer.

Recommended buffers:
- NHL/NBA: 8+ hours after scheduled start for basic detection
- MLB: 10+ hours after scheduled start for basic detection

This is not final logic, just the first operational threshold.

### 2. Impossible result states
Flag rows such as:
- `result = win/loss/push` with missing settlement timestamp
- `result = pending` with old settlement timestamp already present
- `integrity_status = ok` but missing core result fields where expected
- `result = cancelled/void` with contradictory explanatory payload

### 3. Duplicate result writes
Check for:
- multiple conflicting result records for the same candidate
- repeated updates that oscillate between states
- mismatched result vs integrity status

### 4. Event-result mismatch
Flag cases where:
- event appears final but many candidate rows are still pending
- event appears postponed/cancelled but candidate results are graded as normal wins/losses
- result timestamps predate candidate capture timestamps in impossible ways

### 5. Odds / settlement sanity
Spot-check for:
- clearly impossible closing odds
- missing closing values where policy expects them
- nonsensical actual stat values
- grading notes missing on manual review cases

### 6. Label eligibility for training
Every audit should classify candidate rows into:
- trainable settled rows
- push rows
- void/cancelled/postponed rows
- manual-review rows
- unresolved/problem rows

That gives us the real clean-label inventory.

---

## Minimum daily output
For each sport, produce:
- candidate count in grading window
- settled/trainable row count
- push count
- void/cancelled/postponed count
- unresolved stale count
- impossible-state count
- sample broken rows
- final status: `clean`, `warning`, or `critical`

---

## Severity rules
### Clean
- no impossible result states
- stale unresolved rows near zero
- no contradictory event/result states

### Warning
- small unresolved backlog
- some manual-review rows or missing auxiliary fields
- no evidence of systematic corruption

### Critical
- impossible states present
- contradictory event/result state present
- duplicate/conflicting results detected
- unresolved backlog large enough to poison training coverage

---

## Definition of done
This audit is useful only if:
- it tells us how many rows are genuinely trainable
- it flags exact broken labels
- it distinguishes missing data from corrupted data
- it can be rerun daily without interpretation games

---

## Follow-up action policy
If audit returns `critical`:
1. stop expanding training set claims
2. quarantine affected rows from trainable datasets
3. fix grading logic or source mapping
4. rerun audit and prove clean label recovery

---

## Proof required
- first successful grading audit run artifact
- sample trainable rows from NHL/NBA/MLB
- sample excluded rows with clear reasons
