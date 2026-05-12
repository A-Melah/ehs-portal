-- ============================================================
-- Migration 030: Grant inspector read access to all dashboard data
-- Inspectors need to see audits, inspections, reports, assets etc.
-- ============================================================

-- ── compliance_audits ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditors see own audits, managers see all" ON public.compliance_audits;
CREATE POLICY "Auditors see own audits, managers see all"
  ON public.compliance_audits FOR SELECT TO authenticated
  USING (
    auditor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('ehs_manager', 'admin', 'inspector')
    )
  );

-- ── audit_line_items ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Line items follow audit access" ON public.audit_line_items;
CREATE POLICY "Line items follow audit access"
  ON public.audit_line_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.compliance_audits ca
      WHERE ca.id = audit_id
        AND (
          ca.auditor_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN ('ehs_manager', 'admin', 'inspector')
          )
        )
    )
  );

-- ── inspections ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "inspections_select" ON public.inspections;
CREATE POLICY "inspections_select"
  ON public.inspections FOR SELECT TO authenticated
  USING (
    inspector_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('ehs_manager', 'admin', 'inspector')
    )
  );

-- ── responses (inspection responses) ─────────────────────────────────────────
DROP POLICY IF EXISTS "responses_select" ON public.responses;
CREATE POLICY "responses_select"
  ON public.responses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = inspection_id
        AND (
          i.inspector_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN ('ehs_manager', 'admin', 'inspector')
          )
        )
    )
  );

-- ── hazard_reports ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "hazard_reports_select" ON public.hazard_reports;
CREATE POLICY "hazard_reports_select"
  ON public.hazard_reports FOR SELECT TO authenticated
  USING (
    reporter_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('ehs_manager', 'admin', 'inspector')
    )
  );

-- ── assets ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "assets_select" ON public.assets;
CREATE POLICY "assets_select"
  ON public.assets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('ehs_manager', 'admin', 'inspector')
    )
  );

-- ── legal_documents ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "legal_documents_select" ON public.legal_documents;
CREATE POLICY "legal_documents_select"
  ON public.legal_documents FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('ehs_manager', 'admin', 'inspector')
    )
  );

-- ── legal_requirements ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view legal requirements" ON public.legal_requirements;
CREATE POLICY "Authenticated users can view legal requirements"
  ON public.legal_requirements FOR SELECT TO authenticated
  USING (true);

-- ── profiles — inspectors can see all profiles (for auditor names etc) ────────
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

-- Verify
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('compliance_audits','audit_line_items','inspections','hazard_reports','assets')
ORDER BY tablename, policyname;
