import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ClipboardList, Plus, CheckCircle, AlertTriangle, Clock, Download } from 'lucide-react';

const statusConfig = {
  completed:   { icon: CheckCircle,  color: 'text-brand-600', bg: 'bg-brand-50',  label: 'Completed' },
  flagged:     { icon: AlertTriangle, color: 'text-red-600',   bg: 'bg-red-50',    label: 'Flagged' },
  in_progress: { icon: Clock,        color: 'text-amber-600', bg: 'bg-amber-50',  label: 'In Progress' },
};

export default async function InspectionsPage() {
  const supabase = await createClient();

  const [{ data: inspections }, { data: assets }] = await Promise.all([
    supabase
      .from('inspections')
      .select('*, asset:assets(name, type), inspector:profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.from('assets').select('id, name, type').eq('status', 'active'),
  ]);

  return (
    <div className="fade-up space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display">Inspections</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">Field inspection records and AI audit results</p>
        </div>
        <Link href="/dashboard/inspections/new" className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          New Inspection
        </Link>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Asset</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Inspector</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Score</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Date</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {inspections?.map(ins => {
                const cfg = statusConfig[ins.status as keyof typeof statusConfig] ?? statusConfig.in_progress;
                const Icon = cfg.icon;
                const score = Math.round(ins.compliance_score ?? 0);
                return (
                  <tr key={ins.id} className="hover:bg-[var(--color-surface)] transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-medium">{(ins.asset as any)?.name ?? '—'}</p>
                      <p className="text-xs text-[var(--color-muted)]">{(ins.asset as any)?.type}</p>
                    </td>
                    <td className="px-5 py-3.5 text-[var(--color-muted)]">{(ins.inspector as any)?.full_name ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`font-semibold ${score >= 80 ? 'text-brand-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                        {score}%
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                        <Icon size={11} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[var(--color-muted)] text-xs">
                      {new Date(ins.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3.5">
                      <a
                        href={'/api/reports/' + ins.id}
                        download
                        className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)]
                                   hover:text-brand-600 transition-colors"
                        title="Download PDF report"
                      >
                        <Download size={13} />
                        PDF
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!inspections?.length && (
            <div className="p-12 text-center">
              <ClipboardList size={36} className="mx-auto text-[var(--color-muted)] mb-3 opacity-40" />
              <p className="text-sm text-[var(--color-muted)]">No inspections yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}