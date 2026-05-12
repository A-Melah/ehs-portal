import { createClient } from '@/lib/supabase/server';
import { redirect }     from 'next/navigation';
import { Scale, BookOpen, Shield, Leaf, Heart } from 'lucide-react';
import RequirementsTable from '@/components/compliance/RequirementsTable';

export default async function RequirementsPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; doc?: string; section?: string; q?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const params = await searchParams;
  const { area, doc, q } = params;

  // Use count queries for stats (avoids 1000-row Supabase limit)
  // Build filter params then run single query
  const filters: Record<string, string> = { active: 'true' };
  let tableQuery = supabase
    .from('legal_requirements')
    .select('*')
    .eq('active', true)
    .order('area')
    .order('legal_document')
    .order('source_section')
    .limit(2000);

  if (area) tableQuery = tableQuery.eq('area', area as 'Safety' | 'Health' | 'Environment');
  if (doc)  tableQuery = tableQuery.eq('legal_document', doc);

  const [
    { data: requirements },
    { count: totalCount },
    { count: safetyCount },
    { count: healthCount },
    { count: envCount },
    { data: allDocs },
  ] = await Promise.all([
    tableQuery,
    supabase.from('legal_requirements').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.from('legal_requirements').select('*', { count: 'exact', head: true }).eq('active', true).eq('area', 'Safety'),
    supabase.from('legal_requirements').select('*', { count: 'exact', head: true }).eq('active', true).eq('area', 'Health'),
    supabase.from('legal_requirements').select('*', { count: 'exact', head: true }).eq('active', true).eq('area', 'Environment'),
    supabase.from('legal_requirements').select('legal_document, area').eq('active', true).order('legal_document').limit(1000),
  ]);

  const uniqueDocs = [...new Map(allDocs?.map(d => [d.legal_document, d]) ?? []).values()];

  const stats = {
    total:       totalCount  ?? 0,
    safety:      safetyCount ?? 0,
    health:      healthCount ?? 0,
    environment: envCount    ?? 0,
    nullArea:    (totalCount ?? 0) - (safetyCount ?? 0) - (healthCount ?? 0) - (envCount ?? 0),
  };

  return (
    <div className="fade-up space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
        <div>
          <h1 className="text-3xl font-display">Legal Requirements</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {stats.total} active requirements across all facility sections
          {stats.nullArea > 0 && <span className="text-amber-600"> · {stats.nullArea} with missing area</span>}
          </p>
        </div>
      </div>

      {/* Area stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',       value: stats.total,       icon: Scale,   color: 'text-brand-600', bg: 'bg-brand-50',  href: '/dashboard/requirements' },
          { label: 'Safety',      value: stats.safety,      icon: Shield,  color: 'text-red-600',   bg: 'bg-red-50',    href: '/dashboard/requirements?area=Safety' },
          { label: 'Health',      value: stats.health,      icon: Heart,   color: 'text-blue-600',  bg: 'bg-blue-50',   href: '/dashboard/requirements?area=Health' },
          { label: 'Environment', value: stats.environment, icon: Leaf,    color: 'text-brand-600', bg: 'bg-brand-50',  href: '/dashboard/requirements?area=Environment' },
        ].map(({ label, value, icon: Icon, color, bg, href }) => (
          <a key={label} href={href}
            className={`card p-4 cursor-pointer transition-all hover:shadow-md
              ${(area === label || (!area && label === 'Total')) ? 'ring-2 ring-brand-400' : ''}`}>
            <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center mb-2`}>
              <Icon size={15} className={color} />
            </div>
            <p className={`text-2xl font-display ${color}`}>{value}</p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">{label}</p>
          </a>
        ))}
      </div>

      {/* Requirements table — client component for search/filter */}
      <RequirementsTable
        requirements={requirements ?? []}
        uniqueDocs={uniqueDocs}
        activeArea={area}
        activeDoc={doc}
        initialQuery={q}
        totalCount={
          area === 'Safety'      ? stats.safety :
          area === 'Health'      ? stats.health :
          area === 'Environment' ? stats.environment :
          stats.total
        }
      />
    </div>
  );
}