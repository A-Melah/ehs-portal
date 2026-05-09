import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import ComplianceAuditForm   from '@/components/compliance/ComplianceAuditForm';
import ComplianceAuditReport from '@/components/compliance/ComplianceAuditReport';
import AuditPrepLoader       from '@/components/compliance/AuditPrepLoader';

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: audit } = await supabase
    .from('compliance_audits')
    .select('*, auditor:profiles(full_name, email)')
    .eq('id', auditId)
    .single();

  if (!audit) notFound();

  const { data: requirements } = await supabase
    .from('legal_requirements')
    .select('*')
    .eq('active', true)
    .overlaps('applies_to_sections', audit.sections)
    .order('area')
    .order('legal_document');

  const { data: lineItems } = await supabase
    .from('audit_line_items')
    .select('*')
    .eq('audit_id', audit.id);

  // ── Route by status ────────────────────────────────────────────────────────

  // Completed / submitted → recalculate and re-save score, then show report
  if (audit.status === 'completed' || audit.status === 'submitted') {
    // Recalculate with correct formula and update DB if stale
    const reqs  = requirements ?? [];
    const items = lineItems    ?? [];
    let compliant = 0, total = 0;
    reqs.forEach(req => {
      (audit.sections as string[]).forEach(section => {
        if (!req.applies_to_sections.includes(section)) return;
        total++;
        const li = items.find(i => i.requirement_id === req.id && i.section === section);
        if (li?.status === 'compliant') compliant++;
      });
    });
    const correctScore = total > 0 ? Math.round((compliant / total) * 100) : 0;

    // Silently update if the stored score differs
    if (Math.round(audit.overall_score ?? 0) !== correctScore) {
      await supabase
        .from('compliance_audits')
        .update({ overall_score: correctScore })
        .eq('id', auditId);
      audit.overall_score = correctScore;
    }

    return (
      <ComplianceAuditReport
        audit={audit}
        requirements={reqs}
        lineItems={items}
      />
    );
  }

  // Pending → show prep loader (AI hasn't generated measures yet)
  // Preparing / failed → also show prep loader (still running or needs retry)
  if (audit.status === 'pending' || audit.status === 'preparing' || audit.status === 'failed') {
    return (
      <AuditPrepLoader
        auditId={audit.id}
        auditTitle={audit.title}
        sections={audit.sections as string[]}
        currentStatus={audit.status}
      />
    );
  }

  // in_progress → show audit form
  return (
    <ComplianceAuditForm
      audit={audit}
      requirements={requirements ?? []}
      existingLineItems={lineItems ?? []}
    />
  );
}