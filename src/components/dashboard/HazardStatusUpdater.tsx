'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

type Status = 'open' | 'in_review' | 'resolved';

const options: { value: Status; label: string }[] = [
  { value: 'open',      label: 'Open' },
  { value: 'in_review', label: 'In Review' },
  { value: 'resolved',  label: 'Resolved' },
];

const activeStyle: Record<Status, string> = {
  open:      'bg-red-100 text-red-700 border-red-200',
  in_review: 'bg-amber-100 text-amber-700 border-amber-200',
  resolved:  'bg-brand-100 text-brand-700 border-brand-200',
};

export default function HazardStatusUpdater({
  reportId,
  currentStatus,
}: {
  reportId: string;
  currentStatus: string;
}) {
  const [status, setStatus]   = useState<Status>(currentStatus as Status);
  const [saving, setSaving]   = useState(false);
  const supabase = createClient();
  const router   = useRouter();

  async function updateStatus(next: Status) {
    if (next === status) return;
    setSaving(true);
    await supabase
      .from('hazard_reports')
      .update({ status: next })
      .eq('id', reportId);
    setStatus(next);
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {saving && <Loader2 size={12} className="animate-spin text-[var(--color-muted)]" />}
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => updateStatus(opt.value)}
          disabled={saving}
          className={`text-xs font-medium px-3 py-1 rounded-full border transition-all
            ${status === opt.value
              ? activeStyle[opt.value]
              : 'bg-white border-[var(--color-border)] text-[var(--color-muted)] hover:border-gray-300'
            }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}