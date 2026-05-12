import { createClient } from '@/lib/supabase/server';
import { redirect }     from 'next/navigation';
import Link             from 'next/link';
import { CheckCircle, Clock, AlertTriangle, XCircle } from 'lucide-react';
import NewAuditButton from '@/components/compliance/NewAuditButton';

const statusConfig = {
  completed:   { icon: CheckCircle,   color: 'text-brand-600', bg: 'bg-brand-50',  label: 'Completed'   },
  submitted:   { icon: CheckCircle,   color: 'text-blue-600',  bg: 'bg-blue-50',   label: 'Submitted'   },
  in_progress: { icon: Clock,         color: 'text-amber-600', bg: 'bg-amber-50',  label: 'In Progress' },
  pending:     { icon: Clock,         color: 'text-gray-400',  bg: 'bg-gray-50',   label: 'Pending'     },
  preparing:   { icon: Clock,         color: 'text-blue-500',  bg: 'bg-blue-50',   label: 'Preparing'   },
  failed:      { icon: XCircle,       color: 'text-red-600',   bg: 'bg-red-50',    label: 'Failed'      },
};

export default async function CompliancePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const [{ data: audits }, { count: industryCount }, { count: cacheCount }] = await Promise.all([
    supabase
      .from('compliance_audits')
      .select('*, auditor:profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('industries').select('*', { count: 'exact', head: true }),
    supabase.from('industry_requirements_cache').select('*', { count: 'exact', head: true }),
  ]);

  return (
    <div className="fade-up space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
        <div>
          <h1 className="text-3xl font-display">Legal Compliance Audits</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {industryCount ?? 0} industries · {cacheCount ?? 0} cached requirement sets
          </p>
        </div>
        <NewAuditButton />
      </div>

      {/* Audit history */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold">Audit History</h2>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {audits?.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-[var(--color-muted)]">No audits yet — create your first audit above.</p>
            </div>
          )}
          {audits?.map(audit => {
            const cfg   = statusConfig[audit.status as keyof typeof statusConfig] ?? statusConfig.in_progress;
            const Icon  = cfg.icon;
            const score = audit.overall_score ? Math.round(audit.overall_score) : null;
            const industryLabel = audit.industry_name
              ?? (Array.isArray(audit.sections) ? (audit.sections as string[]).join(', ') : '');
            const subLabel = audit.sub_sector_name;

            return (
              <Link key={audit.id} href={`/dashboard/compliance/${audit.id}`}
                className="flex items-start sm:items-center gap-3 px-4 sm:px-6 py-4
                           hover:bg-[var(--color-surface)] transition-colors">
                <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={16} className={cfg.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{audit.title}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {new Date(audit.created_at).toLocaleDateString('en-NG')}
                    {audit.period ? ` · ${audit.period}` : ''}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {industryLabel && (
                      <span className="text-[10px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                        {industryLabel}
                      </span>
                    )}
                    {subLabel && (
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {subLabel}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {score !== null ? (
                    <p className={`text-lg font-display font-semibold
                      ${score >= 80 ? 'text-brand-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
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
        </div>
      </div>
    </div>
  );
}