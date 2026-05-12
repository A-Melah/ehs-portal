'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Mail, RefreshCw, CheckCircle } from 'lucide-react';

const ROLES = [
  { value: 'shopfloor_worker', label: 'Shopfloor Worker' },
  { value: 'inspector',        label: 'Inspector'        },
  { value: 'ehs_manager',      label: 'EHS Manager'      },
  { value: 'admin',            label: 'Admin'            },
];

export default function InviteModal({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [email,     setEmail]     = useState('');
  const [fullName,  setFullName]  = useState('');
  const [role,      setRole]      = useState('inspector');
  const [loading,   setLoading]   = useState(false);
  const [success,   setSuccess]   = useState('');
  const [error,     setError]     = useState('');
  const [canResend, setCanResend] = useState(false);

  async function submit(resend = false) {
    if (!email.trim()) { setError('Email is required.'); return; }
    if (!resend && !fullName.trim()) { setError('Full name is required.'); return; }

    setLoading(true);
    setError('');
    setSuccess('');

    const res  = await fetch('/api/admin/invite', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        email:     email.trim(),
        full_name: fullName.trim(),
        role,
        resend,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong.');
      if (data.alreadyExists) setCanResend(true);
      return;
    }

    setSuccess(
      resend
        ? data.message ?? 'Invite resent successfully.'
        : `Invite sent to ${email}. They will receive an email to set up their account.`
    );
    setCanResend(false);
  }

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-lg font-display">Invite Team Member</h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Send an email invite to add a new user</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--color-surface)] transition-colors">
            <X size={18} className="text-[var(--color-muted)]" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {success ? (
            <div className="flex flex-col items-center text-center py-6 gap-3">
              <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center">
                <CheckCircle size={28} className="text-brand-600" />
              </div>
              <p className="text-sm font-medium">{success}</p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => { setSuccess(''); setEmail(''); setFullName(''); }}
                  className="btn-ghost text-sm px-4 py-2">
                  Invite another
                </button>
                <button onClick={onClose} className="btn-primary text-sm px-4 py-2">Done</button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium mb-1.5">Email address <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setCanResend(false); setError(''); }}
                  placeholder="colleague@company.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Full name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="John Adeyemi"
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Role</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-500 transition bg-white"
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              {error && (
                <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={onClose} className="btn-ghost flex-1 py-2.5 text-sm">Cancel</button>

                {canResend && (
                  <button
                    onClick={() => submit(true)}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium
                               rounded-xl border border-amber-300 bg-amber-50 text-amber-700
                               hover:bg-amber-100 transition-colors"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Resend Invite
                  </button>
                )}

                <button
                  onClick={() => submit(false)}
                  disabled={loading}
                  className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                  Send Invite
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}