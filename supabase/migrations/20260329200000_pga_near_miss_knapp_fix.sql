-- ============================================================
-- PGA Near-Miss Learning Support + Jake Knapp Odds Correction
-- 2026-03-29
-- ============================================================
--
-- Near-miss metadata is stored in two existing columns (no new columns needed):
--   actual_result (text): human-readable finish description,
--     e.g. "Finished 11th (near miss, Top 10 threshold)"
--   pick_snapshot.near_miss (jsonb key): structured object:
--     { is_near_miss: boolean, actual_place: int, threshold: int, margin: int, label: text }
--
-- Near-miss rules (application-layer — exact thresholds for reference):
--   top_5    → near miss if actual_place = 6 (margin 1)
--   top_10   → near miss if actual_place = 11 (margin 1)
--   top_20   → near miss if actual_place = 21 (margin 1)
--   outright → near miss if actual_place in (2, 3) (margin ≤ 2)
--   make_cut, matchup, round_score, unknown → near miss NOT tracked
--
-- CRITICAL: near misses are LEARNING METADATA ONLY.
--   - W/L/P result column is never changed by near-miss detection.
--   - Signal weights are NOT modified differently for near misses.
--   - Units calculation is unaffected.
--
-- Jake Knapp Houston Open Top 10 — odds correction:
--   pick_history row 49c9e39d already patched manually on 2026-03-29.
--   This migration patches the corresponding goose_model_picks row
--   (matched by player_name + date + pick_label pattern).
-- ============================================================

-- 1. Index on pick_snapshot->near_miss for admin visibility queries
-- (Partial index — only rows where near_miss data exists)
create index if not exists idx_goose_picks_pga_near_miss
  on goose_model_picks ((pick_snapshot -> 'near_miss' ->> 'is_near_miss'))
  where sport = 'PGA'
    and pick_snapshot is not null
    and pick_snapshot -> 'near_miss' is not null;

-- 2. Jake Knapp Houston Open Top 10 — correct odds from -110 placeholder to +280
-- (BettingPros screenshot verified by Marco 2026-03-29)
-- pick_history row 49c9e39d-c332-403c-a718-bde4471a451b was already patched.
-- This patches the goose_model_picks row for the same pick.
update goose_model_picks
set
  odds              = 280,
  odds_at_capture   = 280,
  updated_at        = now()
where sport      = 'PGA'
  and date       = '2026-03-26'
  and lower(player_name) like '%knapp%'
  and lower(pick_label)  like '%top%10%'
  and odds        = -110;  -- guard: only if still at the wrong placeholder value

-- Confirm: zero rows updated is OK if already patched; multiple rows would be a bug.
-- Expected: 0 or 1 rows affected.
