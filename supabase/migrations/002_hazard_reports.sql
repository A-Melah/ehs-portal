-- ============================================================
-- Migration 002: Hazard Reports (Public / Anonymous Submissions)
-- Run this in your Supabase SQL Editor after 001_initial_schema.sql
-- ============================================================

CREATE TABLE public.hazard_reports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,  -- nullable = anonymous
  location       TEXT NOT NULL,
  description    TEXT NOT NULL,
  severity       TEXT NOT NULL DEFAULT 'moderate'
                 CHECK (severity IN ('low', 'moderate', 'high', 'critical')),
  evidence_url   TEXT,                  -- Supabase Storage public URL
  status         TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'in_review', 'resolved')),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.hazard_reports ENABLE ROW LEVEL SECURITY;

-- Authenticated workers can INSERT their own reports
CREATE POLICY "Anyone can submit a hazard report"
  ON public.hazard_reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- Only authenticated managers/admins can read all reports
CREATE POLICY "Managers can view all hazard reports"
  ON public.hazard_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('ehs_manager', 'admin')
    )
  );

-- Managers can update status (open → in_review → resolved)
CREATE POLICY "Managers can update hazard report status"
  ON public.hazard_reports FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('ehs_manager', 'admin')
    )
  );

-- ── Supabase Storage bucket for hazard evidence ──────────────────────────────
-- Run this separately in the Supabase dashboard under Storage > New bucket,
-- OR uncomment and run via the service role:
--
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('hazard-evidence', 'hazard-evidence', true);
--
-- CREATE POLICY "Anyone can upload hazard evidence"
--   ON storage.objects FOR INSERT TO anon, authenticated
--   WITH CHECK (bucket_id = 'hazard-evidence');
--
-- CREATE POLICY "Hazard evidence is publicly readable"
--   ON storage.objects FOR SELECT TO anon, authenticated
--   USING (bucket_id = 'hazard-evidence');
