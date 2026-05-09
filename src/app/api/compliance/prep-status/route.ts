import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const auditId = req.nextUrl.searchParams.get('auditId');
  if (!auditId) return NextResponse.json({ error: 'auditId required' }, { status: 400 });

  const { data } = await supabase
    .from('compliance_audits')
    .select('status')
    .eq('id', auditId)
    .single();

  const dbStatus = data?.status ?? 'pending';

  // Map DB status to what AuditPrepLoader expects
  const status =
    dbStatus === 'in_progress' || dbStatus === 'completed' || dbStatus === 'submitted'
      ? 'ready'
      : dbStatus === 'failed'
        ? 'failed'
        : 'preparing';

  return NextResponse.json({ status });
}