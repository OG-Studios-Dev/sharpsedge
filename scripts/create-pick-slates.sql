-- ============================================================
-- CREATE pick_slates table
-- This table locks daily pick generation to prevent duplicates.
-- Without it, every API hit regenerates new picks.
-- RUN THIS IN: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pick_slates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date text NOT NULL,
  league text NOT NULL,
  status text NOT NULL DEFAULT 'incomplete',
  provenance text NOT NULL DEFAULT 'original',
  provenance_note text,
  expected_pick_count integer NOT NULL DEFAULT 3,
  pick_count integer NOT NULL DEFAULT 0,
  status_note text,
  integrity_status text NOT NULL DEFAULT 'ok',
  locked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (date, league)
);

-- Enable RLS
ALTER TABLE public.pick_slates ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read pick_slates"
  ON public.pick_slates
  FOR SELECT
  USING (true);

-- Service role only for writes
CREATE POLICY "Service role manages pick slates"
  ON public.pick_slates
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Verify
SELECT 'pick_slates created successfully' AS status;
