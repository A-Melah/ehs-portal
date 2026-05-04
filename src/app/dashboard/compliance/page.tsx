import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, FileCheck, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import NewAuditButton from '@/components/compliance/NewAuditButton';

const statusConfig = {
  in_progress: { icon: Clock,         color: 'text-amber-600', bg: 'bg-amber-50',  label: 'In Progress' },
  completed:   { icon: CheckCircle,   color: 'text-brand-600', bg: 'bg-brand-50',  label: 'Completed' },
  submitted:   { icon: FileCheck,     color: 'text-blue-600',  bg: 'bg-blue-50',   label: 'Submitted' },
};

export default async function CompliancePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const [{ data: audits }, { data: sections }, { count: reqCount }] = await Promise.all([
    supabase
      .from('compliance_audits')
      .select('*, auditor:profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('facility_sections')
      .select('*')
      .eq('active', true)
      .order('order_index'),
    supabase
      .from('legal_requirements')
      .select('*', { count: 'exact', head: true })
      .eq('active', true),
  ]);

  return (
    <div className="fade-up space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-0 justify-between">
        <div>
          <h1 className="text-3xl font-display">Legal Compliance Audits</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {reqCount} legal requirements across {sections?.length ?? 0} facility sections
          </p>
        </div>
        <NewAuditButton sections={sections ?? []} />
      </div>

      {/* Section cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {sections?.map(s => (
          <div key={s.id} className="card p-4 text-center">
            <p className="text-sm font-semibold">{s.name}</p>
            <p className="text-xs text-[var(--color-muted)] mt-1">{s.description}</p>
          </div>
        ))}
      </div>

      {/* Audits table */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold">Audit History</h2>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {audits?.map(audit => {
            const cfg = statusConfig[audit.status as keyof typeof statusConfig] ?? statusConfig.in_progress;
            const Icon = cfg.icon;
            const score = audit.overall_score ? Math.round(audit.overall_score) : null;
            return (
              <Link key={audit.id} href={`/dashboard/compliance/${audit.id}`}
                className="flex items-start sm:items-center gap-3 px-4 sm:px-6 py-4 hover:bg-[var(--color-surface)] transition-colors">
                <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={16} className={cfg.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{audit.title}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {(audit.auditor as any)?.full_name} · {new Date(audit.created_at).toLocaleDateString('en-NG')}
                    {audit.period ? ` · ${audit.period}` : ''}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(audit.sections as string[]).map(s => (
                      <span key={s} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {score !== null ? (
                    <p className={`text-lg font-display font-semibold ${score >= 80 ? 'text-brand-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                      {score}%
                    </p>
                  ) : (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
          {!audits?.length && (
            <div className="px-6 py-12 text-center">
              <FileCheck size={32} className="mx-auto text-[var(--color-muted)] opacity-30 mb-3" />
              <p className="text-sm text-[var(--color-muted)]">No audits yet. Start your first compliance audit.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}