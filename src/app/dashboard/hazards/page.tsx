import { createClient } from '@/lib/supabase/server';
import { redirect }     from 'next/navigation';
import { ShieldAlert, AlertTriangle, Eye, Siren } from 'lucide-react';
import ReportsList from '@/components/dashboard/ReportsList';

export default async function HazardsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const params     = await searchParams;
  const activeType = params.type;

  let query = supabase
    .from('hazard_reports')
    .select('*, reporter:profiles(full_name)')
    .order('created_at', { ascending: false });

  if (activeType) query = query.eq('report_type', activeType);

  const { data: reports } = await query;

  const { data: allReports } = await supabase
    .from('hazard_reports')
    .select('report_type, status');

  const counts = {
    all:       allReports?.length ?? 0,
    hazard:    allReports?.filter(r => r.report_type === 'hazard').length    ?? 0,
    near_miss: allReports?.filter(r => r.report_type === 'near_miss').length ?? 0,
    incident:  allReports?.filter(r => r.report_type === 'incident').length  ?? 0,
    accident:  allReports?.filter(r => r.report_type === 'accident').length  ?? 0,
    open:      allReports?.filter(r => r.status === 'open').length           ?? 0,
  };

  const canUpdateStatus = ['admin', 'ehs_manager', 'inspector'].includes(profile?.role ?? '');

  const tabs = [
    { key: '',          label: 'All',        count: counts.all,       icon: ShieldAlert   },
    { key: 'hazard',    label: 'Hazards',    count: counts.hazard,    icon: ShieldAlert   },
    { key: 'near_miss', label: 'Near Misses',count: counts.near_miss, icon: Eye           },
    { key: 'incident',  label: 'Incidents',  count: counts.incident,  icon: AlertTriangle },
    { key: 'accident',  label: 'Accidents',  count: counts.accident,  icon: Siren         },
  ];

  return (
    <div className="fade-up space-y-6">
      <div>
        <h1 className="text-3xl font-display">Reports & Incidents</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          {counts.open} open · {counts.all} total · click any report to view details
        </p>
      </div>

      {/* Type filter tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map(({ key, label, count, icon: Icon }) => (
          <a key={key}
            href={key ? `/dashboard/hazards?type=${key}` : '/dashboard/hazards'}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all
              ${(activeType ?? '') === key
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white border-[var(--color-border)] text-[var(--color-muted)] hover:border-gray-300'
              }`}>
            <Icon size={14} />
            {label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold
              ${(activeType ?? '') === key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {count}
            </span>
          </a>
        ))}
      </div>

      <ReportsList reports={reports ?? []} canUpdateStatus={canUpdateStatus} />
    </div>
  );
}