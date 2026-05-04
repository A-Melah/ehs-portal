import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import ComplianceAuditForm   from '@/components/compliance/ComplianceAuditForm';
import ComplianceAuditReport from '@/components/compliance/ComplianceAuditReport';

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  // Next.js 15: params must be awaited
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

  const isCompleted = audit.status !== 'in_progress';

  if (isCompleted) {
    return (
      <ComplianceAuditReport
        audit={audit}
        requirements={requirements ?? []}
        lineItems={lineItems ?? []}
      />
    );
  }

  return (
    <ComplianceAuditForm
      audit={audit}
      requirements={requirements ?? []}
      existingLineItems={lineItems ?? []}
    />
  );
}