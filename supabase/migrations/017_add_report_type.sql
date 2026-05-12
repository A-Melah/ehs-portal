-- ============================================================
-- Migration: Add report_type to hazard_reports
-- Supports: hazard, incident, accident, near_miss
-- ============================================================

ALTER TABLE public.hazard_reports
  ADD COLUMN IF NOT EXISTS report_type TEXT
    CHECK (report_type IN ('hazard', 'incident', 'accident', 'near_miss'))
    DEFAULT 'hazard';

-- Add injury/corrective action fields for incidents and accidents
ALTER TABLE public.hazard_reports
  ADD COLUMN IF NOT EXISTS injury_details   TEXT,
  ADD COLUMN IF NOT EXISTS corrective_action TEXT,
  ADD COLUMN IF NOT EXISTS date_of_event    DATE;

-- Backfill existing records
UPDATE public.hazard_reports SET report_type = 'hazard' WHERE report_type IS NULL;

-- Index for filtering by type
CREATE INDEX IF NOT EXISTS idx_hazard_reports_type ON public.hazard_reports(report_type);
