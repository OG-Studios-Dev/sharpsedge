# Goose2 Phase 1 Identity Drift Audit Spec — 2026-04-11

## Goal
Catch event identity corruption before it contaminates training data, reporting, or grading.

## Owner
Magoo

## Why this exists
Goose2 already showed the exact failure mode we need to guard against:
- legacy synthetic or shorthand ids surviving as active event identities
- duplicate rows representing the same real game
- snapshot-born ids becoming permanent when better upstream identity arrives later

If we do not catch this automatically, the model will train on duplicate or conflicting examples.

---

## Audit scope
Run daily across active sports:
- NHL
- NBA
- MLB

Primary tables:
- `goose_market_events`
- `goose_market_candidates`
- `goose_feature_rows`
- `goose_decision_log`
- optional spot checks against `market_snapshot_events`

---

## Required checks

### 1. Legacy-style event ids still active
Flag rows where active `event_id` looks like an old synthetic/legacy format, for example:
- prefixed duplicate forms like `evt:nhl:nhl:nhl-*`
- obvious synthetic snapshot carryovers
- shorthand ids that should now only live in metadata

### 2. Legacy-style source event ids still active
Flag rows where `source_event_id` still looks like shorthand snapshot identity instead of a stable upstream id or derived canonical id, for example:
- `NHL:TBL@MTL:na`
- `NBA:PHI@HOU:na`
- `MLB:COL@SD:na`

Important nuance:
- in some sports, shorthand snapshot ids may still appear in snapshot metadata
- they should not survive as the active canonical identity when a better identity exists

### 3. Duplicate real-game identity clusters
Flag cases where multiple `goose_market_events` rows appear to represent the same real game based on:
- sport
- home/away teams
- commence time bucket
- event date

This is the most important check.

### 4. Canonical-vs-legacy coexistence
Flag cases where both of these exist at once:
- a canonical matchup-time or upstream-id event row
- a stale shorthand/legacy row for the same game

### 5. Downstream contamination
For any flagged event cluster, report counts of related:
- candidates
- feature rows
- decision logs
- results

This tells us whether the identity problem is cosmetic or training-critical.

### 6. Metadata truthfulness
Spot-check event metadata for:
- `source_event_id_kind`
- `source_event_id_truthful`
- `snapshot_game_id`
- `real_game_id`
- `legacy_source_event_ids`
- `replaced_legacy_event_ids`

If metadata lies, audits become useless.

---

## Minimum daily output
For each sport, produce:
- total event count
- suspicious active `event_id` count
- suspicious active `source_event_id` count
- duplicate real-game cluster count
- downstream contaminated row counts
- sample flagged rows
- final status: `clean`, `warning`, or `critical`

---

## Severity rules
### Clean
- no suspicious active legacy rows
- no duplicate clusters

### Warning
- suspicious metadata or shorthand identities still appear
- but no duplicate canonical-vs-legacy coexistence in active rows

### Critical
- duplicate event clusters exist
- or legacy active ids coexist with canonical ids for the same game
- or downstream candidates/features/decisions are attached to stale event identities

---

## Definition of done
This audit is useful only if:
- it can be run daily without manual SQL surgery
- it names the exact bad rows
- it quantifies downstream contamination
- it makes cleanup decisions obvious

---

## Follow-up action policy
If audit returns `critical`:
1. stop claiming data rails are clean
2. map stale ids to canonical ids
3. migrate downstream rows if needed
4. preserve provenance only in metadata
5. rerun audit and save clean proof

---

## Proof required
- first successful audit run artifact
- one clean sample output per sport
- one intentionally explained example of what would trigger `critical`
