-- ============================================================
-- Migration 004: Inspection Evidence Storage + QR helpers
-- Run in Supabase SQL Editor
-- ============================================================

-- Enable Realtime on tables that the NotificationBell subscribes to
ALTER PUBLICATION supabase_realtime ADD TABLE public.hazard_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inspections;

-- Add QR code generation helper: stores a URL-encoded tag_number
-- so the QR just encodes the tag_number string directly
COMMENT ON COLUMN public.assets.qr_code IS
  'Stores the tag_number as plain text. QR codes encode this value directly.';

-- ── Storage buckets ───────────────────────────────────────────────────────────
-- Run these in Supabase Dashboard > Storage > New Bucket, OR via service role:

-- 1. inspection-evidence (authenticated users only)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('inspection-evidence', 'inspection-evidence', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload inspection evidence"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inspection-evidence');

CREATE POLICY "Inspection evidence is publicly readable"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'inspection-evidence');

-- 2. hazard-evidence (already in migration 002, ensure it exists)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('hazard-evidence', 'hazard-evidence', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload hazard evidence"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hazard-evidence');

CREATE POLICY "Hazard evidence is publicly readable"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'hazard-evidence');
