'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface HeatCell { asset: string; score: number; date: string }

function scoreToColor(score: number) {
  if (score >= 85) return '#15b36e';
  if (score >= 70) return '#22c55e';
  if (score >= 55) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

export default function ComplianceHeatmap() {
  const [cells, setCells] = useState<HeatCell[]>([]);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from('inspections')
      .select('compliance_score, created_at, asset:assets(name)')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!data) return;
        const mapped: HeatCell[] = data.map((d: any) => ({
          asset: d.asset?.name ?? 'Unknown',
          score: Math.round(d.compliance_score ?? 0),
          date: new Date(d.created_at).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' }),
        }));
        setCells(mapped);
      });
  }, []);

  if (!cells.length) {
    return (
      <div className="h-32 flex items-center justify-center text-sm text-[var(--color-muted)]">
        No inspection data yet. Start an inspection to see heatmap data.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex flex-wrap gap-2">
        {cells.map((cell, i) => (
          <div
            key={i}
            title={`${cell.asset} · ${cell.date} · ${cell.score}%`}
            className="relative group cursor-default"
          >
            <div
              className="w-10 h-10 rounded-lg transition-transform group-hover:scale-110"
              style={{ backgroundColor: scoreToColor(cell.score) }}
            />
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white
                            text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
              {cell.asset}<br />{cell.score}% · {cell.date}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-[var(--color-muted)]">
        <span>Legend:</span>
        {[
          { label: '≥85% Good', color: '#15b36e' },
          { label: '70–84% Fair', color: '#22c55e' },
          { label: '55–69% Warn', color: '#f59e0b' },
          { label: '40–54% Poor', color: '#f97316' },
          { label: '<40% Critical', color: '#ef4444' },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
