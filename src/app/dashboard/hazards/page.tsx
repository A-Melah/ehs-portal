import { createClient } from '@/lib/supabase/server';
import { ShieldAlert, Clock, CheckCircle, Eye } from 'lucide-react';
import HazardStatusUpdater from '@/components/dashboard/HazardStatusUpdater';

const severityStyle = {
  low:      { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Low' },
  moderate: { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Moderate' },
  high:     { bg: 'bg-orange-100', text: 'text-orange-700', label: 'High' },
  critical: { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Critical' },
};

const statusStyle = {
  open:      { icon: ShieldAlert,  color: 'text-red-600',    bg: 'bg-red-50',    label: 'Open' },
  in_review: { icon: Eye,         color: 'text-amber-600',  bg: 'bg-amber-50',  label: 'In Review' },
  resolved:  { icon: CheckCircle, color: 'text-brand-600',  bg: 'bg-brand-50',  label: 'Resolved' },
};

export default async function HazardsPage() {
  const supabase = await createClient();

  const { data: reports } = await supabase
    .from('hazard_reports')
    .select('*')
    .order('created_at', { ascending: false });

  const openCount     = reports?.filter(r => r.status === 'open').length ?? 0;
  const criticalCount = reports?.filter(r => r.severity === 'critical').length ?? 0;
  const resolvedCount = reports?.filter(r => r.status === 'resolved').length ?? 0;

  return (
    <div className="fade-up space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display">Hazard Reports</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Anonymous shopfloor submissions — reported without login
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--color-muted)]">Public report URL</p>
          <code className="text-xs font-mono bg-white border border-[var(--color-border)] px-2 py-1 rounded-lg">
            /report
          </code>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
            <ShieldAlert size={16} className="text-red-600" />
          </div>
          <div>
            <p className="text-xl font-display text-red-600">{openCount}</p>
            <p className="text-xs text-[var(--color-muted)]">Open</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center">
            <Clock size={16} className="text-orange-600" />
          </div>
          <div>
            <p className="text-xl font-display text-orange-600">{criticalCount}</p>
            <p className="text-xs text-[var(--color-muted)]">Critical</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
            <CheckCircle size={16} className="text-brand-600" />
          </div>
          <div>
            <p className="text-xl font-display text-brand-600">{resolvedCount}</p>
            <p className="text-xs text-[var(--color-muted)]">Resolved</p>
          </div>
        </div>
      </div>

      {/* Reports list */}
      <div className="space-y-3">
        {reports?.map(report => {
          const sev = severityStyle[report.severity as keyof typeof severityStyle] ?? severityStyle.moderate;
          const sts = statusStyle[report.status as keyof typeof statusStyle]       ?? statusStyle.open;
          const StsIcon = sts.icon;

          return (
            <div key={report.id} className="card p-5">
              <div className="flex items-start gap-4">
                {/* Status icon */}
                <div className={`w-10 h-10 rounded-xl ${sts.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <StsIcon size={18} className={sts.color} />
                </div>

                <div className="flex-1 min-w-0">
                  {/* Top row */}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${sev.bg} ${sev.text}`}>
                      {sev.label}
                    </span>
                    <span className="text-xs text-[var(--color-muted)]">·</span>
                    <span className="text-xs font-medium text-[var(--color-text)]">{report.location}</span>
                    <span className="text-xs text-[var(--color-muted)] ml-auto">
                      {new Date(report.created_at).toLocaleDateString('en-NG', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-[var(--color-text)] leading-relaxed">{report.description}</p>

                  {/* Evidence photo */}
                  {report.evidence_url && (
                    <a
                      href={report.evidence_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-2"
                    >
                      <img
                        src={report.evidence_url}
                        alt="Hazard evidence"
                        className="h-24 w-auto rounded-lg border border-[var(--color-border)] object-cover hover:opacity-90 transition-opacity"
                      />
                    </a>
                  )}

                  {/* Status updater */}
                  <div className="mt-3">
                    <HazardStatusUpdater reportId={report.id} currentStatus={report.status} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!reports?.length && (
        <div className="card p-12 text-center">
          <ShieldAlert size={36} className="mx-auto text-[var(--color-muted)] mb-3 opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">No hazard reports yet.</p>
          <p className="text-xs text-[var(--color-muted)] mt-1">
            Share <code className="font-mono">/report</code> with shopfloor workers to start receiving reports.
          </p>
        </div>
      )}
    </div>
  );
}