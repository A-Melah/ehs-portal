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
    .select('*')
    .eq('id', auditId)
    .single();

  if (!audit) notFound();

  // Fetch auditor profile separately (avoids PostgREST schema cache join issue)
  const { data: auditor } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', audit.auditor_id)
    .single();

  const auditWithAuditor = { ...audit, auditor: auditor ?? null };

  // Line items now contain inline requirement data — no separate legal_requirements fetch needed
  const { data: lineItems } = await supabase
    .from('audit_line_items')
    .select('*')
    .eq('audit_id', auditWithAuditor.id)
    .order('section');

  const items = lineItems ?? [];

  // ── Route by status ──────────────────────────────────────────────────────

  if (auditWithAuditor.status === 'completed' || auditWithAuditor.status === 'submitted') {
    const compliant    = items.filter(i => i.status === 'compliant').length;
    const total        = items.length;
    const correctScore = total > 0 ? Math.round((compliant / total) * 100) : 0;

    if (Math.round(auditWithAuditor.overall_score ?? 0) !== correctScore) {
      await supabase
        .from('compliance_audits')
        .update({ overall_score: correctScore })
        .eq('id', auditId);
      auditWithAuditor.overall_score = correctScore;
    }

    return (
      <ComplianceAuditReport
        audit={auditWithAuditor}
        requirements={[]}
        lineItems={items}
      />
    );
  }

  if (auditWithAuditor.status === 'pending' || auditWithAuditor.status === 'preparing' || auditWithAuditor.status === 'failed') {
    return (
      <AuditPrepLoader
        auditId={auditWithAuditor.id}
        auditTitle={auditWithAuditor.title}
        industryId={auditWithAuditor.industry_id}
        subSectorId={auditWithAuditor.sub_sector_id}
        industryName={auditWithAuditor.industry_name ?? (auditWithAuditor.sections as string[])?.[0] ?? 'General'}
        subSectorName={auditWithAuditor.sub_sector_name}
        currentStatus={auditWithAuditor.status}
      />
    );
  }

  return (
    <ComplianceAuditForm
      audit={auditWithAuditor}
      requirements={[]}
      existingLineItems={items}
    />
  );
}