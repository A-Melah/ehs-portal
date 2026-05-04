'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { ChevronDown, Loader2, Check } from 'lucide-react';

const ROLES = [
  { value: 'shopfloor_worker', label: 'Shopfloor Worker', color: 'text-blue-700',   bg: 'bg-blue-100',   dot: 'bg-blue-500' },
  { value: 'inspector',        label: 'Inspector',        color: 'text-violet-700', bg: 'bg-violet-100', dot: 'bg-violet-500' },
  { value: 'ehs_manager',      label: 'EHS Manager',      color: 'text-brand-700',  bg: 'bg-brand-100',  dot: 'bg-brand-500' },
  { value: 'admin',            label: 'Admin',            color: 'text-gray-700',   bg: 'bg-gray-200',   dot: 'bg-gray-500' },
];

interface Props {
  userId:      string;
  initialRole: string;
  disabled?:   boolean;
}

export default function RoleEditor({ userId, initialRole, disabled = false }: Props) {
  const [role, setRole]         = useState(initialRole);
  const [prev, setPrev]         = useState(initialRole); // for rollback
  const [open, setOpen]         = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const current = ROLES.find(r => r.value === role) ?? ROLES[0];

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function select(next: string) {
    if (next === role || disabled) return;
    setOpen(false);
    setError('');
    setPrev(role);
    setRole(next);

    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/update-role', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ userId, role: next }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to update role.');
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (err: any) {
        // Roll back optimistic update
        setRole(prev);
        setError(err?.message ?? 'Failed to update role.');
        setTimeout(() => setError(''), 3000);
      }
    });
  }

  return (
    <div ref={ref} className="relative inline-block">
      {/* Trigger pill */}
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled || pending}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold
                    border transition-all select-none
                    ${current.bg} ${current.color}
                    ${disabled
                      ? 'cursor-default opacity-60'
                      : 'cursor-pointer hover:opacity-80 border-transparent hover:border-current/20'
                    }`}
      >
        {/* Status dot */}
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${current.dot}`} />

        {current.label}

        {pending
          ? <Loader2 size={11} className="animate-spin ml-0.5" />
          : saved
            ? <Check size={11} className="ml-0.5 text-brand-600" />
            : !disabled
              ? <ChevronDown size={11} className={`ml-0.5 transition-transform ${open ? 'rotate-180' : ''}`} />
              : null
        }
      </button>

      {/* Error toast */}
      {error && (
        <div className="absolute top-full left-0 mt-1 z-30 px-3 py-1.5 bg-red-50 border border-red-200
                        text-xs text-red-600 rounded-xl shadow-sm whitespace-nowrap">
          {error}
        </div>
      )}

      {/* Dropdown */}
      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1.5 z-30 bg-white border border-[var(--color-border)]
                          rounded-2xl shadow-xl overflow-hidden w-52 py-1.5">

            <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted)]">
              Change role to
            </p>

            {ROLES.map(r => (
              <button
                key={r.value}
                onClick={() => select(r.value)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                  ${r.value === role
                    ? 'bg-[var(--color-surface)]'
                    : 'hover:bg-[var(--color-surface)]'
                  }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${r.value === role ? r.color : 'text-[var(--color-text)]'}`}>
                    {r.label}
                  </p>
                </div>
                {r.value === role && (
                  <Check size={13} className={r.color} />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}