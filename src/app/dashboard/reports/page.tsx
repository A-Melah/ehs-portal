import { createClient } from '@/lib/supabase/server';
import { FileBarChart, TrendingDown, TrendingUp, Minus } from 'lucide-react';

export default async function ReportsPage() {
  const supabase = await createClient();

  const { data: inspections } = await supabase
    .from('inspections')
    .select('compliance_score, status, created_at, asset:assets(name, type)')
    .order('created_at', { ascending: false });

  // Group by asset type
  const byType: Record<string, number[]> = {};
  inspections?.forEach((ins: any) => {
    const type = ins.asset?.type ?? 'Unknown';
    if (!byType[type]) byType[type] = [];
    byType[type].push(ins.compliance_score ?? 0);
  });

  const typeStats = Object.entries(byType).map(([type, scores]) => ({
    type,
    avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    count: scores.length,
    min: Math.round(Math.min(...scores)),
  }));

  return (
    <div className="fade-up space-y-6">
      <div>
        <h1 className="text-3xl font-display">Reports</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">Compliance analytics by asset category</p>
      </div>

      {/* By asset type */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {typeStats.map(({ type, avg, count, min }) => {
          const trend = avg >= 80 ? 'up' : avg >= 60 ? 'flat' : 'down';
          const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
          const trendColor = trend === 'up' ? 'text-brand-600' : trend === 'down' ? 'text-red-500' : 'text-amber-500';
          return (
            <div key={type} className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <FileBarChart size={18} className="text-blue-600" />
                </div>
                <TrendIcon size={18} className={trendColor} />
              </div>
              <h3 className="font-semibold text-sm mb-1">{type}</h3>
              <p className={`text-2xl font-display ${avg >= 80 ? 'text-brand-600' : avg >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                {avg}%
              </p>
              <p className="text-xs text-[var(--color-muted)] mt-1">avg compliance · {count} inspections</p>
              {min < 60 && (
                <p className="text-xs text-red-500 mt-2">Lowest: {min}% — review required</p>
              )}
            </div>
          );
        })}
      </div>

      {!typeStats.length && (
        <div className="card p-12 text-center">
          <FileBarChart size={36} className="mx-auto text-[var(--color-muted)] mb-3 opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">No data yet. Complete inspections to generate reports.</p>
        </div>
      )}
    </div>
  );
}