-- Migration: pick_history modern schema columns
-- Adds sportsbook, provenance, provenance_note, pick_snapshot, and pick_type
-- to bring the production table in line with what the code's modern insert
-- path expects.  The legacy_minimal fallback already works around missing
-- columns, but applying this migration lets the modern path succeed and
-- enables full pick-snapshot storage going forward.
--
-- Background: commit 502895c added sportsbook to the insert payload without
-- a matching schema migration, causing pick insertions to fail for NHL/NBA
-- on 2026-03-26.  The code fix (c5962d2) handles the fallback chain, but
-- the proper fix is to have the columns.

-- 1. Add new columns (idempotent — all use IF NOT EXISTS / or checks)
ALTER TABLE public.pick_history
  ADD COLUMN IF NOT EXISTS sportsbook text,
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS provenance_note text,
  ADD COLUMN IF NOT EXISTS pick_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS pick_type text;

-- 2. Backfill sportsbook from book (same data, new name)
UPDATE public.pick_history
SET sportsbook = book
WHERE sportsbook IS NULL AND book IS NOT NULL;

-- 3. Backfill pick_type from type (same data, new name)
UPDATE public.pick_history
SET pick_type = type
WHERE pick_type IS NULL AND type IS NOT NULL;

-- 4. Backfill pick_snapshot from pick_data (old jsonb column, if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pick_history'
      AND column_name = 'pick_data'
  ) THEN
    UPDATE public.pick_history
    SET pick_snapshot = pick_data
    WHERE pick_snapshot IS NULL AND pick_data IS NOT NULL;
  END IF;
END
$$;

-- 5. Mark 2026-03-26 NHL and NBA slates as permanently incomplete
--    (picks were generated but never stored due to the sportsbook bug;
--     live game data is no longer available, so they cannot be recovered.)
UPDATE public.pick_slates
SET
  integrity_status = 'incomplete',
  status_note = 'UNRECOVERABLE: Picks were generated on 2026-03-26 but failed to persist due to missing sportsbook column in pick_history (bug introduced by commit 502895c, fixed by c5962d2). Live game/prop data for this date is no longer available. This gap is permanent.',
  updated_at = now()
WHERE date = '2026-03-26'
  AND league IN ('NHL', 'NBA')
  AND pick_count = 0;
