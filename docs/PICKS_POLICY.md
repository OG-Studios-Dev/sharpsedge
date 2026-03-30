# Goosalytics — Picks Volume & Quality Policy

_Effective: 2026-03-29_

---

## Philosophy

The goal is to be **profitable in every sport with a 70%+ hit rate**.
Spray hurts this. Twenty plays a day is not the product. Fewer, better picks is.

---

## Rules

### 1. No Forced Minimum

Zero picks is a valid and correct output for any sport on any given day.
If there are no genuine edges, nothing gets published.

This rule removes the old "fill-to-3" behavior that padded slates with marginal picks
to reach a hard count floor.

### 2. Soft Band: 3–5 Picks Per Sport Per Day

The production system targets **3 player props + 2 team trends = 5 picks** per sport per day.

These are quality ceilings, not floors. If only 2 picks clear the quality gate, 2 picks go out.

### 3. Hard Max: 7 Picks (Strong-Edge Exception Only)

Volume can exceed 5 picks — up to **7** — only when all of the following are true:
- At least 5 qualifying picks each have **edge ≥ 15%** (the strong-edge threshold)
- The picks still pass the standard quality gate (65% hit rate + 10% edge)
- This check applies independently per sport

This is not a routine path. Most days stay at or below 5.

### 4. Quality Gates (Unchanged)

| Floor | NHL | NBA | MLB |
|-------|-----|-----|-----|
| Hit rate | ≥ 65% | ≥ 65% | ≥ 65% |
| Edge | ≥ 10% | ≥ 10% | ≥ 8% |
| Odds | −200 to +300 | −200 to +300 | −200 to +300 |

MLB uses a slightly lower edge floor (8%) to account for thin early-season samples.
The hit rate floor is the same across all sports.

---

## Implementation

### User-Facing Picks Engine (`src/lib/picks-engine.ts`)

| Constant | Value | Role |
|---|---|---|
| `V1_HIT_RATE_FLOOR` | 65 | Hit rate quality gate |
| `V1_EDGE_FLOOR` | 10 | Edge quality gate |
| `SOFT_MAX_PLAYER` | 3 | Default player prop ceiling |
| `SOFT_MAX_TEAM` | 2 | Default team trend ceiling |
| `HARD_MAX_PLAYER` | 4 | Strong-edge player ceiling |
| `HARD_MAX_TEAM` | 3 | Strong-edge team ceiling |
| `STRONG_EDGE_FLOOR` | 15 | Edge % to trigger hard max |

**Removed:** Fill-to-3 loops in `selectTopPicks`, `selectNBATopPicks`, `selectMLBTopPicks`.

### Goose Model Engine (`src/lib/goose-model/generator.ts`)

| Constant | Value | Role |
|---|---|---|
| `PROD_HIT_RATE_FLOOR` | 65 | Production quality gate |
| `PROD_EDGE_FLOOR` | 5 | Production edge minimum |
| `PROD_TOP_N` | 5 | Soft ceiling per sport |
| `PROD_HARD_MAX` | 7 | Absolute max (strong-edge only) |
| `PROD_STRONG_EDGE_FLOOR` | 15 | Edge % to trigger hard max |

The Goose model already had no forced minimum (if 0 qualify, 0 are returned).
The change adds the strong-edge hard-max logic.

### Sandbox Engine (unchanged intentionally)

`SANDBOX_MIN_PICKS_TARGET = 6` triggers a wide-net retry in sandbox mode.
This is **not** a user-facing behavior. The sandbox is an ML data-collection layer —
generating more labeled picks (even borderline ones) accelerates signal-weight learning.
This is deliberately different from production volume rules.

---

## What Remains (Not Yet Implemented)

### Unit Management / Max Bets Per Day

The architecture does not yet track bankroll or per-day unit totals.
Every pick is currently assigned `units: 1` with no relationship to
total exposure across a session.

Until a bankroll/unit layer exists, the volume caps above act as a proxy
for exposure control. When unit management is added, the design should:

- Support a configurable daily unit budget (e.g. 10 units/day total)
- Allocate units proportionally to model confidence / edge
- Enforce a per-sport sub-budget if desired
- Allow the volume cap to be adjusted dynamically based on remaining budget

### Cross-Sport Daily Aggregate Cap

Currently each sport is independently capped at 5 (or 7) picks.
There is no aggregate cross-sport daily pick limit.
If all four sports (NHL + NBA + MLB + PGA) each produce 5 picks, that's 20 plays.
A cross-sport daily cap (e.g. 12–15 total) may be warranted.
This is a gap to address once the unit-management layer exists.

---

## History

| Date | Change |
|------|--------|
| 2026-03-29 | Removed fill-to-3 forced minimum in picks-engine. Added soft band (5) and hard-max (7) volume policy. Added policy spec. |
