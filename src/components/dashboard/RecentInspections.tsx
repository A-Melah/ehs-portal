'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle, AlertTriangle, Clock } from 'lucide-react';

interface InspectionRow {
  id: string;
  compliance_score: number;
  status: string;
  created_at: string;
  asset_name: string;
  inspector_name: string;
}

const statusConfig = {
  completed: { icon: CheckCircle, color: 'text-brand-600', bg: 'bg-brand-50', label: 'Completed' },
  flagged:   { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', label: 'Flagged' },
  in_progress: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', label: 'In Progress' },
};

export default function RecentInspections() {
  const [rows, setRows] = useState<InspectionRow[]>([]);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from('inspections')
      .select('id, compliance_score, status, created_at, asset:assets(name), inspector:profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (!data) return;
        setRows(data.map((d: any) => ({
          id: d.id,
          compliance_score: Math.round(d.compliance_score ?? 0),
          status: d.status,
          created_at: d.created_at,
          asset_name: d.asset?.name ?? 'Unknown',
          inspector_name: d.inspector?.full_name ?? 'Unknown',
        })));
      });
  }, []);

  if (!rows.length) {
    return <p className="text-sm text-[var(--color-muted)] py-4">No inspections found.</p>;
  }

  return (
    <div className="divide-y divide-[var(--color-border)]">
      {rows.map(row => {
        const cfg = statusConfig[row.status as keyof typeof statusConfig] ?? statusConfig.in_progress;
        const Icon = cfg.icon;
        return (
          <div key={row.id} className="flex items-center gap-4 py-3">
            <div className={`w-8 h-8 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
              <Icon size={15} className={cfg.color} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{row.asset_name}</p>
              <p className="text-xs text-[var(--color-muted)]">
                {row.inspector_name} · {new Date(row.created_at).toLocaleDateString('en-NG')}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`text-sm font-semibold ${
                row.compliance_score >= 80 ? 'text-brand-600' :
                row.compliance_score >= 60 ? 'text-amber-600' : 'text-red-600'
              }`}>{row.compliance_score}%</p>
              <p className="text-xs text-[var(--color-muted)]">{cfg.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
