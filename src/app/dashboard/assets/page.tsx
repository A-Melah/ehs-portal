import { createClient } from '@/lib/supabase/server';
import { Package, MapPin, Tag } from 'lucide-react';

const statusStyle = {
  active:      'bg-brand-100 text-brand-700',
  inactive:    'bg-gray-100 text-gray-600',
  maintenance: 'bg-amber-100 text-amber-700',
};

export default async function AssetsPage() {
  const supabase = await createClient();
  const { data: assets } = await supabase
    .from('assets')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div className="fade-up space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display">Assets</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            All registered facility equipment
          </p>
        </div>
        <span className="text-sm text-[var(--color-muted)] bg-white border border-[var(--color-border)] px-3 py-1.5 rounded-xl">
          {assets?.length ?? 0} assets
        </span>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {assets?.map(asset => (
          <div key={asset.id} className="card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                <Package size={18} className="text-violet-600" />
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusStyle[asset.status as keyof typeof statusStyle]}`}>
                {asset.status}
              </span>
            </div>
            <h3 className="font-semibold text-sm">{asset.name}</h3>
            <p className="text-xs text-[var(--color-muted)] mb-3">{asset.type}</p>
            <div className="space-y-1.5 text-xs text-[var(--color-muted)]">
              <div className="flex items-center gap-1.5">
                <Tag size={11} /> {asset.tag_number}
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin size={11} /> {asset.location}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!assets?.length && (
        <div className="card p-12 text-center">
          <Package size={36} className="mx-auto text-[var(--color-muted)] mb-3 opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">No assets found. Add assets via Supabase or the admin panel.</p>
        </div>
      )}
    </div>
  );
}