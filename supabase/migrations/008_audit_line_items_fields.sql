-- ============================================================
-- Migration 008: Add AI-suggested fields to audit_line_items
-- ============================================================

ALTER TABLE public.audit_line_items
  ADD COLUMN IF NOT EXISTS ai_measures    TEXT,       -- AI-suggested compliance measures
  ADD COLUMN IF NOT EXISTS frequency      TEXT,       -- Shift / Monthly / Annually / etc.
  ADD COLUMN IF NOT EXISTS due_date_label TEXT;       -- 'Continuous Action', 'Annually', 'N/A', etc.
