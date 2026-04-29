import { createClient } from '@/lib/supabase/server';
import { ShieldCheck, AlertTriangle, Package, ClipboardList } from 'lucide-react';
import ComplianceHeatmap from '@/components/dashboard/ComplianceHeatmap';
import RecentInspections from '@/components/dashboard/RecentInspections';

export default async function DashboardPage() {
  const supabase = await createClient();

  // Fetch summary stats
  const [
    { count: totalInspections },
    { data: inspections },
    { count: totalAssets },
  ] = await Promise.all([
    supabase.from('inspections').select('*', { count: 'exact', head: true }),
    supabase.from('inspections').select('compliance_score, status').order('created_at', { ascending: false }),
    supabase.from('assets').select('*', { count: 'exact', head: true }).eq('status', 'active'),
  ]);

  const avgScore = inspections?.length
    ? Math.round(inspections.reduce((a, i) => a + (i.compliance_score ?? 0), 0) / inspections.length)
    : 0;

  const criticalCount = inspections?.filter(i => i.status === 'flagged').length ?? 0;

  const stats = [
    {
      label: 'Avg Compliance Score',
      value: `${avgScore}%`,
      icon: ShieldCheck,
      color: avgScore >= 80 ? 'text-brand-600' : avgScore >= 60 ? 'text-amber-600' : 'text-red-600',
      bg: avgScore >= 80 ? 'bg-brand-50' : avgScore >= 60 ? 'bg-amber-50' : 'bg-red-50',
    },
    {
      label: 'Total Inspections',
      value: totalInspections ?? 0,
      icon: ClipboardList,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Active Assets',
      value: totalAssets ?? 0,
      icon: Package,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    {
      label: 'Critical Flags',
      value: criticalCount,
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
  ];

  return (
    <div className="fade-up space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display">Compliance Overview</h1>
        <p className="text-[var(--color-muted)] text-sm mt-1">
          Real-time safety intelligence across all facility assets
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card p-5">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-4`}>
              <Icon size={20} className={color} />
            </div>
            <p className={`text-2xl font-display ${color}`}>{value}</p>
            <p className="text-xs text-[var(--color-muted)] mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Heatmap */}
      <div className="card p-6">
        <h2 className="text-lg font-display mb-1">Compliance Heatmap</h2>
        <p className="text-xs text-[var(--color-muted)] mb-6">Asset-level compliance scores over time</p>
        <ComplianceHeatmap />
      </div>

      {/* Recent Inspections */}
      <div className="card p-6">
        <h2 className="text-lg font-display mb-1">Recent Inspections</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Latest field submissions</p>
        <RecentInspections />
      </div>
    </div>
  );
}