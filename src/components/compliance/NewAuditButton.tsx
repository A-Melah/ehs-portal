'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Plus, X, Loader2 } from 'lucide-react';
import type { FacilitySection } from '@/types';

export default function NewAuditButton({ sections }: { sections: FacilitySection[] }) {
  const router   = useRouter();
  const supabase = createClient();

  const [open, setOpen]               = useState(false);
  const [title, setTitle]             = useState('Legal Compliance Audit');
  const [period, setPeriod]           = useState('');
  const [selected, setSelected]       = useState<string[]>(sections.map(s => s.name));
  const [error, setError]             = useState('');
  const [pending, startTransition]    = useTransition();

  function toggle(name: string) {
    setSelected(prev => prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]);
  }

  function submit() {
    if (!title.trim())    { setError('Please enter a title.'); return; }
    if (!selected.length) { setError('Select at least one section.'); return; }
    setError('');

    startTransition(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: audit, error: err } = await supabase
        .from('compliance_audits')
        .insert({
          title:      title.trim(),
          period:     period.trim() || null,
          auditor_id: user.id,
          sections:   selected,
          status:     'in_progress',
        })
        .select()
        .single();

      if (err || !audit) { setError('Failed to create audit.'); return; }

      router.push(`/dashboard/compliance/${audit.id}`);
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2">
        <Plus size={16} /> New Audit
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center px-4 py-4 sm:py-0 overflow-y-auto">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[var(--color-border)] fade-up flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[90vh] my-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)]">
              <div>
                <h2 className="text-xl font-display">Start Compliance Audit</h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  All legal requirements will be loaded automatically
                </p>
              </div>
              <button onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[var(--color-surface)] text-[var(--color-muted)] transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium mb-1.5">Audit title</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                             focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Period <span className="text-[var(--color-muted)] font-normal">(optional)</span>
                </label>
                <input
                  value={period}
                  onChange={e => setPeriod(e.target.value)}
                  placeholder="e.g. Q1 2025, October 2024"
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                             focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Facility sections to audit</label>
                <div className="space-y-2">
                  {sections.map(s => (
                    <label key={s.id}
                      className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all
                        ${selected.includes(s.name)
                          ? 'border-brand-300 bg-brand-50'
                          : 'border-[var(--color-border)] hover:border-gray-300'
                        }`}>
                      <input
                        type="checkbox"
                        checked={selected.includes(s.name)}
                        onChange={() => toggle(s.name)}
                        className="mt-0.5 accent-brand-600"
                      />
                      <div>
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-[var(--color-muted)]">{s.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl border border-red-100">{error}</p>
              )}

            </div>

            {/* Pinned footer — always visible */}
            <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] flex-shrink-0">
              <button onClick={() => setOpen(false)} className="btn-ghost flex-1 py-2.5">Cancel</button>
              <button onClick={submit} disabled={pending}
                className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2">
                {pending ? <><Loader2 size={15} className="animate-spin" /> Creating…</> : <><Plus size={15} /> Start Audit</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}