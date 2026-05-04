'use client';

import { useState, useTransition, useRef } from 'react';
import { UserPlus, X, Loader2, CheckCircle, Info } from 'lucide-react';

const ROLES = [
  {
    value:       'shopfloor_worker',
    label:       'Shopfloor Worker',
    description: 'Can log hazard reports only. No dashboard access.',
    color:       'border-blue-200 bg-blue-50 text-blue-700',
    selected:    'ring-2 ring-blue-400 border-blue-400 bg-blue-50',
  },
  {
    value:       'inspector',
    label:       'Inspector',
    description: 'Conducts asset audits and views inspection history.',
    color:       'border-violet-200 bg-violet-50 text-violet-700',
    selected:    'ring-2 ring-violet-400 border-violet-400 bg-violet-50',
  },
  {
    value:       'ehs_manager',
    label:       'EHS Manager',
    description: 'Full dashboard access. Views all reports and AI verdicts.',
    color:       'border-brand-200 bg-brand-50 text-brand-700',
    selected:    'ring-2 ring-brand-400 border-brand-400 bg-brand-50',
  },
  {
    value:       'admin',
    label:       'Admin',
    description: 'Full access including staff management.',
    color:       'border-gray-300 bg-gray-100 text-gray-700',
    selected:    'ring-2 ring-gray-400 border-gray-400 bg-gray-100',
  },
];

export default function InviteModal() {
  const [open, setOpen]         = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail]       = useState('');
  const [role, setRole]         = useState('inspector');
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);
  const [pending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLDivElement>(null);

  function reset() {
    setFullName('');
    setEmail('');
    setRole('inspector');
    setError('');
    setDone(false);
  }

  function close() {
    setOpen(false);
    setTimeout(reset, 300); // wait for close animation
  }

  function submit() {
    if (!fullName.trim()) { setError('Full name is required.'); bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!email.trim())    { setError('Email address is required.'); bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('Enter a valid email address.'); bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setError('');

    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/invite', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ full_name: fullName.trim(), email: email.trim(), role }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Something went wrong.'); return; }
        setDone(true);
      } catch {
        setError('Network error. Please try again.');
      }
    });
  }

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        className="btn-primary flex items-center gap-2"
      >
        <UserPlus size={16} />
        Invite Staff
      </button>

      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={close}
          />

          {/* Modal */}
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[var(--color-border)] fade-up flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)]">
              <div>
                <h2 className="text-xl font-display">Invite Staff Member</h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  They'll receive an email to set their password.
                </p>
              </div>
              <button
                onClick={close}
                className="w-8 h-8 flex items-center justify-center rounded-xl
                           hover:bg-[var(--color-surface)] text-[var(--color-muted)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div ref={bodyRef} className="px-6 py-5 overflow-y-auto flex-1">
              {done ? (
                /* Success state */
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle size={28} className="text-brand-600" />
                  </div>
                  <h3 className="text-lg font-display mb-1">Invite sent!</h3>
                  <p className="text-sm text-[var(--color-muted)] mb-6">
                    <strong>{email}</strong> will receive an email to activate their account
                    as a <strong>{ROLES.find(r => r.value === role)?.label}</strong>.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={reset} className="btn-primary flex-1 py-2">
                      Invite another
                    </button>
                    <button onClick={close} className="btn-ghost flex-1 py-2">
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Validation error banner — always visible at top */}
                  {error && (
                    <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                      <span className="mt-0.5 flex-shrink-0">⚠</span>
                      {error}
                    </div>
                  )}

                  {/* Full name */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Full name</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="e.g. Emeka Okonkwo"
                      className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                                 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Work email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="emeka@company.com"
                      onKeyDown={e => e.key === 'Enter' && submit()}
                      className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                                 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition"
                    />
                  </div>

                  {/* Role picker */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Portal role</label>
                    <div className="space-y-2">
                      {ROLES.map(r => (
                        <button
                          key={r.value}
                          onClick={() => setRole(r.value)}
                          className={`w-full text-left px-4 py-3 rounded-xl border transition-all
                            ${role === r.value ? r.selected : 'border-[var(--color-border)] hover:border-gray-300 bg-white'}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center
                              ${role === r.value ? 'border-current bg-current' : 'border-gray-300'}`}>
                              {role === r.value && (
                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              )}
                            </div>
                            <div>
                              <p className={`text-sm font-semibold ${role === r.value ? r.color.split(' ')[2] : 'text-[var(--color-text)]'}`}>
                                {r.label}
                              </p>
                              <p className="text-xs text-[var(--color-muted)] mt-0.5">{r.description}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Info note */}
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-[var(--color-surface)]
                                  border border-[var(--color-border)] text-xs text-[var(--color-muted)]">
                    <Info size={13} className="mt-0.5 flex-shrink-0" />
                    Role access can be changed at any time from this page.
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-1">
                    <button onClick={close} className="btn-ghost flex-1 py-2.5">
                      Cancel
                    </button>
                    <button
                      onClick={submit}
                      disabled={pending}
                      className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2"
                    >
                      {pending
                        ? <><Loader2 size={15} className="animate-spin" /> Sending…</>
                        : <><UserPlus size={15} /> Send Invite</>
                      }
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}