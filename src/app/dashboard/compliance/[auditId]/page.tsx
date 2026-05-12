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

  // Line items now contain inline requirement data — no separate legal_requirements fetch needed
  const { data: lineItems } = await supabase
    .from('audit_line_items')
    .select('*')
    .eq('audit_id', audit.id)
    .order('section');

  const items = lineItems ?? [];

  // ── Route by status ──────────────────────────────────────────────────────

  if (audit.status === 'completed' || audit.status === 'submitted') {
    // Recalculate score from line items directly
    const compliant = items.filter(i => i.status === 'compliant').length;
    const total     = items.length;
    const correctScore = total > 0 ? Math.round((compliant / total) * 100) : 0;

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
        requirements={[]}
        lineItems={items}
      />
    );
  }

  if (audit.status === 'pending' || audit.status === 'preparing' || audit.status === 'failed') {
    return (
      <AuditPrepLoader
        auditId={audit.id}
        auditTitle={audit.title}
        industryId={audit.industry_id}
        subSectorId={audit.sub_sector_id}
        industryName={audit.industry_name ?? (audit.sections as string[])?.[0] ?? 'General'}
        subSectorName={audit.sub_sector_name}
        currentStatus={audit.status}
      />
    );
  }

  return (
    <ComplianceAuditForm
      audit={audit}
      requirements={[]}
      existingLineItems={items}
    />
  );
}