import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import {
  ShieldCheck, ShieldAlert, AlertTriangle, Package,
  ClipboardList, Scale, FileText, ChevronRight,
  CheckCircle, XCircle, Clock, TrendingUp,
} from 'lucide-react';
import ComplianceHeatmap   from '@/components/dashboard/ComplianceHeatmap';
import RecentInspections   from '@/components/dashboard/RecentInspections';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user!.id).single();

  const [
    { count: totalInspections },
    { data: inspections },
    { count: totalAssets },
    { count: openHazards },
    { data: recentHazards },
    { data: recentAudits },
    { count: totalRequirements },
    { data: recentInspectionsList },
  ] = await Promise.all([
    supabase.from('inspections').select('*', { count: 'exact', head: true }),
    supabase.from('inspections').select('compliance_score, status').order('created_at', { ascending: false }),
    supabase.from('assets').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('hazard_reports').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('hazard_reports').select('id, report_type, severity, location, description, status, created_at')
      .order('created_at', { ascending: false }).limit(3),
    supabase.from('compliance_audits').select('id, title, status, overall_score, period, sections, completed_at, created_at')
      .order('created_at', { ascending: false }).limit(3),
    supabase.from('legal_requirements').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.from('inspections').select('id, asset_id, status, compliance_score, created_at, assets(name)')
      .order('created_at', { ascending: false }).limit(3),
  ]);

  const avgScore     = inspections?.length
    ? Math.round(inspections.reduce((a, i) => a + (i.compliance_score ?? 0), 0) / inspections.length) : 0;
  const criticalCount = inspections?.filter(i => i.status === 'flagged').length ?? 0;
  const completedAudits = recentAudits?.filter(a => a.status === 'completed' || a.status === 'submitted').length ?? 0;

  const severityColor: Record<string, string> = {
    low:      'bg-blue-100 text-blue-700',
    medium:   'bg-amber-100 text-amber-700',
    high:     'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  };

  const auditStatusColor: Record<string, string> = {
    completed:   'text-brand-600',
    submitted:   'text-blue-600',
    in_progress: 'text-amber-600',
    pending:     'text-gray-400',
    preparing:   'text-blue-400',
    failed:      'text-red-600',
  };

  return (
    <div className="fade-up space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-display">Compliance Overview</h1>
        <p className="text-[var(--color-muted)] text-sm mt-1">
          Real-time safety intelligence across all facility areas
        </p>
      </div>

      {/* ── Top stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          {
            label: 'Avg Inspection Score', value: `${avgScore}%`, href: '/dashboard/inspections',
            icon: ShieldCheck,
            color: avgScore >= 80 ? 'text-brand-600' : avgScore >= 60 ? 'text-amber-600' : 'text-red-600',
            bg:    avgScore >= 80 ? 'bg-brand-50'   : avgScore >= 60 ? 'bg-amber-50'   : 'bg-red-50',
          },
          {
            label: 'Total Inspections', value: totalInspections ?? 0, href: '/dashboard/inspections',
            icon: ClipboardList, color: 'text-blue-600', bg: 'bg-blue-50',
          },
          {
            label: 'Active Assets', value: totalAssets ?? 0, href: '/dashboard/assets',
            icon: Package, color: 'text-violet-600', bg: 'bg-violet-50',
          },
          {
            label: 'Open Reports', value: openHazards ?? 0, href: '/dashboard/hazards',
            icon: ShieldAlert,
            color: openHazards ? 'text-orange-600' : 'text-brand-600',
            bg:    openHazards ? 'bg-orange-50'    : 'bg-brand-50',
          },
          {
            label: 'Legal Requirements', value: totalRequirements ?? 0, href: '/dashboard/requirements',
            icon: Scale, color: 'text-brand-600', bg: 'bg-brand-50',
          },
        ].map(({ label, value, href, icon: Icon, color, bg }) => (
          <Link key={label} href={href}
            className="card p-5 hover:shadow-md transition-shadow group cursor-pointer">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-4`}>
              <Icon size={20} className={color} />
            </div>
            <p className={`text-2xl font-display ${color}`}>{value}</p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-[var(--color-muted)]">{label}</p>
              <ChevronRight size={12} className="text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>
        ))}
      </div>

      {/* ── Middle row: Audits + Hazards ── */}
      <div className="grid lg:grid-cols-2 gap-6">

        {/* Recent Compliance Audits */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
            <div>
              <h2 className="text-sm font-semibold">Legal Compliance Audits</h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                {completedAudits} completed · click to review
              </p>
            </div>
            <Link href="/dashboard/compliance"
              className="text-xs text-brand-600 font-medium hover:underline flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {recentAudits?.length ? recentAudits.map(audit => {
              const score = audit.overall_score ? Math.round(audit.overall_score) : null;
              const stColor = auditStatusColor[audit.status] ?? 'text-gray-400';
              return (
                <Link key={audit.id} href={`/dashboard/compliance/${audit.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--color-surface)] transition-colors">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0
                    ${audit.status === 'completed' || audit.status === 'submitted' ? 'bg-brand-50' : 'bg-amber-50'}`}>
                    {audit.status === 'completed' || audit.status === 'submitted'
                      ? <CheckCircle size={15} className="text-brand-600" />
                      : <Clock size={15} className="text-amber-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{audit.title}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {audit.period && <span>{audit.period} · </span>}
                      {(audit.sections as string[])?.join(', ')}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {score !== null
                      ? <p className={`text-sm font-bold ${score >= 80 ? 'text-brand-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{score}%</p>
                      : <p className={`text-xs font-medium capitalize ${stColor}`}>{audit.status.replace('_', ' ')}</p>
                    }
                  </div>
                </Link>
              );
            }) : (
              <div className="px-5 py-8 text-center">
                <Scale size={24} className="mx-auto text-[var(--color-muted)] opacity-30 mb-2" />
                <p className="text-xs text-[var(--color-muted)]">No audits yet</p>
                <Link href="/dashboard/compliance" className="text-xs text-brand-600 mt-1 inline-block hover:underline">
                  Start your first audit →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Recent Hazard Reports */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
            <div>
              <h2 className="text-sm font-semibold">Reports &amp; Incidents</h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                {openHazards ?? 0} open · hazards, incidents &amp; near misses
              </p>
            </div>
            <Link href="/dashboard/hazards"
              className="text-xs text-brand-600 font-medium hover:underline flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {recentHazards?.length ? recentHazards.map(h => (
              <Link key={h.id} href="/dashboard/hazards"
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--color-surface)] transition-colors">
                <div className={[
                  'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0',
                  h.report_type === 'accident'  ? 'bg-red-50'    :
                  h.report_type === 'incident'  ? 'bg-orange-50' :
                  h.report_type === 'near_miss' ? 'bg-blue-50'   : 'bg-amber-50'
                ].join(' ')}>
                  <AlertTriangle size={15} className={
                    h.report_type === 'accident'  ? 'text-red-500'    :
                    h.report_type === 'incident'  ? 'text-orange-500' :
                    h.report_type === 'near_miss' ? 'text-blue-500'   : 'text-amber-500'
                  } />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className={[
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize',
                      h.report_type === 'accident'  ? 'bg-red-100 text-red-700'    :
                      h.report_type === 'incident'  ? 'bg-orange-100 text-orange-700' :
                      h.report_type === 'near_miss' ? 'bg-blue-100 text-blue-700'  : 'bg-amber-100 text-amber-700'
                    ].join(' ')}>
                      {(h.report_type ?? 'hazard').replace('_', ' ')}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${severityColor[h.severity] ?? 'bg-gray-100 text-gray-600'}`}>
                      {h.severity}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-muted)] truncate">{h.location}</p>
                </div>
                {h.status === 'open' && (
                  <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                )}
              </Link>
            )) : (
              <div className="px-5 py-8 text-center">
                <ShieldCheck size={24} className="mx-auto text-brand-400 opacity-50 mb-2" />
                <p className="text-xs text-[var(--color-muted)]">No open hazards — great work!</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Compliance Heatmap ── */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-display">Inspection Compliance Heatmap</h2>
          <Link href="/dashboard/inspections"
            className="text-xs text-brand-600 font-medium hover:underline flex items-center gap-1">
            All inspections <ChevronRight size={12} />
          </Link>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-6">Asset-level compliance scores over time</p>
        <ComplianceHeatmap />
      </div>

      {/* ── Recent Inspections ── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-lg font-display">Recent Inspections</h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Latest field submissions</p>
          </div>
          <Link href="/dashboard/inspections"
            className="text-xs text-brand-600 font-medium hover:underline flex items-center gap-1">
            View all <ChevronRight size={12} />
          </Link>
        </div>
        <div className="p-6">
          <RecentInspections />
        </div>
      </div>

      {/* ── Quick links for admin ── */}
      {(profile?.role === 'admin' || profile?.role === 'ehs_manager') && (
        <div className="grid sm:grid-cols-2 gap-4">
          <Link href="/dashboard/admin"
            className="card p-5 hover:shadow-md transition-shadow flex items-center gap-4 group">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
              <FileText size={18} className="text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Staff Management</p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">Manage roles, invite team members</p>
            </div>
            <ChevronRight size={16} className="text-[var(--color-muted)] group-hover:text-brand-600 transition-colors" />
          </Link>

          <Link href="/dashboard/admin/legal-docs"
            className="card p-5 hover:shadow-md transition-shadow flex items-center gap-4 group">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
              <Scale size={18} className="text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Legal Documents</p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">Upload & extract regulatory requirements</p>
            </div>
            <ChevronRight size={16} className="text-[var(--color-muted)] group-hover:text-brand-600 transition-colors" />
          </Link>
        </div>
      )}
    </div>
  );
}