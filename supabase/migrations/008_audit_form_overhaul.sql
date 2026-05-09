-- ============================================================
-- Migration 008: Audit form overhaul
-- Adds inspector_answer, frequency, ai_suggested_measures,
-- ai_responsible_person, ai_due_date to audit_line_items
-- ============================================================

ALTER TABLE public.audit_line_items
  ADD COLUMN IF NOT EXISTS inspector_answer  TEXT
    CHECK (inspector_answer IN ('yes', 'partial', 'no', NULL)),
  ADD COLUMN IF NOT EXISTS frequency         TEXT,
  ADD COLUMN IF NOT EXISTS ai_responsible    TEXT,
  ADD COLUMN IF NOT EXISTS ai_due_date       TEXT,
  ADD COLUMN IF NOT EXISTS ai_measures       TEXT;

-- Pre-populate frequency and owner on legal_requirements
-- (already in the table as default_frequency and owner — just ensuring they exist)
ALTER TABLE public.legal_requirements
  ADD COLUMN IF NOT EXISTS suggested_due_date TEXT DEFAULT 'Continuous';

-- Update suggested_due_dates based on frequency
UPDATE public.legal_requirements SET suggested_due_date =
  CASE
    WHEN default_frequency ILIKE '%annual%'    THEN 'Annual — renew by December 31'
    WHEN default_frequency ILIKE '%quarterly%' THEN 'Quarterly review'
    WHEN default_frequency ILIKE '%monthly%'   THEN 'Monthly — ongoing'
    WHEN default_frequency ILIKE '%shift%'     THEN 'Every shift'
    WHEN default_frequency ILIKE '%bi-annual%' THEN 'Bi-annual review'
    WHEN default_frequency = 'As applicable'   THEN 'Continuous'
    ELSE 'Continuous'
  END;
