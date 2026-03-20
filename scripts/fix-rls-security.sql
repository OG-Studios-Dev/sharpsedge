-- ============================================================
-- FIX: Supabase Security Advisory (Report 15 Mar 2026)
-- Project: Goosalytics (erlhhogahohfijuvhuns)
--
-- PROBLEM: RLS write policies use `using (true)` which allows
-- ANY role (including anonymous/public anon key) to INSERT,
-- UPDATE, and DELETE rows in pick_history, profiles, and
-- pick_slates. This is a critical security vulnerability.
--
-- FIX: Restrict write operations to service_role only.
-- The service_role key bypasses RLS anyway, so these policies
-- only need to block anon/authenticated from writing.
-- Add explicit insert policy for authenticated users on
-- profiles (needed for signup flow).
--
-- RUN THIS IN: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Fix pick_history: block anon writes
DROP POLICY IF EXISTS "Service role manages picks" ON public.pick_history;
CREATE POLICY "Service role manages picks"
  ON public.pick_history
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. Fix profiles: block anon writes, allow authenticated insert-own
DROP POLICY IF EXISTS "Service role full access" ON public.profiles;
CREATE POLICY "Service role full access"
  ON public.profiles
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 3. Fix pick_slates: block anon writes
DROP POLICY IF EXISTS "Service role manages pick slates" ON public.pick_slates;
CREATE POLICY "Service role manages pick slates"
  ON public.pick_slates
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Verify: after running, test with anon key — INSERT should return 403
