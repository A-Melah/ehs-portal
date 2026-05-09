-- ============================================================
-- Migration 009: Extend compliance_audits status values
-- Adds 'preparing' and 'failed' to the status CHECK constraint
-- ============================================================

ALTER TABLE public.compliance_audits
  DROP CONSTRAINT IF EXISTS compliance_audits_status_check;

ALTER TABLE public.compliance_audits
  ADD CONSTRAINT compliance_audits_status_check
  CHECK (status IN ('pending', 'preparing', 'in_progress', 'completed', 'submitted', 'failed'));

-- Set any audits that have line_items but no inspector answers to 'in_progress'
-- (they were created before the prep flow existed)
UPDATE public.compliance_audits
SET status = 'in_progress'
WHERE status NOT IN ('pending', 'preparing', 'in_progress', 'completed', 'submitted', 'failed');
