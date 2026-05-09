-- ============================================================
-- Migration 003: Add shopfloor_worker role
-- Only needed if you already ran 001_initial_schema.sql.
-- New installs can skip this — it's already in 001.
-- ============================================================

-- Drop the old constraint and recreate with the new role
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('shopfloor_worker', 'inspector', 'ehs_manager', 'admin'));

-- Also tighten hazard_reports INSERT policy if migration 002 was run with anon access
DROP POLICY IF EXISTS "Anyone can submit a hazard report" ON public.hazard_reports;

CREATE POLICY "Workers can submit hazard reports"
  ON public.hazard_reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());
