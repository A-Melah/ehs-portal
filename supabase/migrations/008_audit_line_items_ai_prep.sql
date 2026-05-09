-- ============================================================
-- Migration 008: Audit Line Items — AI pre-generation fields
-- Adds columns to store AI-suggested compliance measures,
-- responsible person, frequency, and due date type
-- so inspectors only need to validate YES/NO.
-- ============================================================

ALTER TABLE public.audit_line_items
  ADD COLUMN IF NOT EXISTS ai_compliance_measures TEXT,       -- AI-suggested measures
  ADD COLUMN IF NOT EXISTS ai_responsible_person  TEXT,       -- AI-assigned owner
  ADD COLUMN IF NOT EXISTS ai_frequency           TEXT,       -- shiftly|daily|monthly|quarterly|bi-annually|annually|as applicable
  ADD COLUMN IF NOT EXISTS ai_due_date_type       TEXT        -- 'specific'|'continuous'|'na'
    CHECK (ai_due_date_type IN ('specific', 'continuous', 'na', NULL)),
  ADD COLUMN IF NOT EXISTS inspector_validated    BOOLEAN,    -- TRUE=compliant, FALSE=non_compliant, NULL=not assessed
  ADD COLUMN IF NOT EXISTS inspector_comment      TEXT;       -- optional note from inspector

-- Pre-generation status on the audit itself
ALTER TABLE public.compliance_audits
  ADD COLUMN IF NOT EXISTS ai_prep_status TEXT DEFAULT 'pending'
    CHECK (ai_prep_status IN ('pending', 'preparing', 'ready', 'failed'));
