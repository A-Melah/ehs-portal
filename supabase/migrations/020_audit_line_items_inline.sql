-- ============================================================
-- Migration 020: Add inline requirement fields to audit_line_items
-- Requirements are now stored inline per audit rather than as FK
-- ============================================================

ALTER TABLE public.audit_line_items
  ADD COLUMN IF NOT EXISTS legal_document       TEXT,
  ADD COLUMN IF NOT EXISTS source_section       TEXT,
  ADD COLUMN IF NOT EXISTS specific_requirement TEXT;

-- Make requirement_id optional (was required FK)
ALTER TABLE public.audit_line_items
  ALTER COLUMN requirement_id DROP NOT NULL;

-- Rename 'section' to 'area' for clarity (keep section as alias)
ALTER TABLE public.audit_line_items
  ADD COLUMN IF NOT EXISTS area TEXT;

-- Update area from section for existing rows
UPDATE public.audit_line_items SET area = section WHERE area IS NULL;
