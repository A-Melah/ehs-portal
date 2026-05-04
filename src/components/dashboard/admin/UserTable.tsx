'use client';

import { useState, useTransition } from 'react';
import RoleEditor from '@/components/dashboard/admin/RoleEditor';
import {
  CheckCircle, Clock, XCircle, ChevronDown,
  ShieldOff, ShieldCheck, Trash2, Loader2
} from 'lucide-react';

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
  last_sign_in: string | null;
  is_banned: boolean;
  confirmed: boolean;
};

const ROLES = [
  { value: 'shopfloor_worker', label: 'Shopfloor Worker' },
  { value: 'inspector',        label: 'Inspector' },
  { value: 'ehs_manager',      label: 'EHS Manager' },
  { value: 'admin',            label: 'Admin' },
];

const roleStyle: Record<string, string> = {
  shopfloor_worker: 'bg-blue-100 text-blue-700',
  inspector:        'bg-violet-100 text-violet-700',
  ehs_manager:      'bg-brand-100 text-brand-700',
  admin:            'bg-gray-200 text-gray-700',
};

const roleLabel: Record<string, string> = {
  shopfloor_worker: 'Shopfloor',
  inspector:        'Inspector',
  ehs_manager:      'EHS Manager',
  admin:            'Admin',
};

function ActionMenu({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm]      = useState<'deactivate' | 'delete' | null>(null);

  function run(fn: () => Promise<void>) {
    startTransition(async () => { await fn(); setConfirm(null); });
  }

  if (isSelf) {
    return <span className="text-xs text-[var(--color-muted)] italic">you</span>;
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--color-muted)]">
          {confirm === 'delete' ? 'Delete permanently?' : 'Deactivate user?'}
        </span>
        <button
          onClick={() => run(confirm === 'delete'
            ? async () => {
          const res = await fetch('/api/admin/user-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, action: 'delete' }),
          });
          if (!res.ok) throw new Error('Failed to delete user.');
        }
            : async () => {
          const res = await fetch('/api/admin/user-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, action: 'deactivate' }),
          });
          if (!res.ok) throw new Error('Failed to deactivate user.');
        }
          )}
          disabled={pending}
          className="text-xs font-medium text-red-600 hover:underline"
        >
          {pending ? <Loader2 size={12} className="animate-spin inline" /> : 'Confirm'}
        </button>
        <button onClick={() => setConfirm(null)}
          className="text-xs text-[var(--color-muted)] hover:underline">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {user.is_banned ? (
        <button
          onClick={() => run(async () => {
          const res = await fetch('/api/admin/user-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, action: 'reactivate' }),
          });
          if (!res.ok) throw new Error('Failed to reactivate user.');
        })}
          disabled={pending}
          title="Reactivate user"
          className="p-1.5 rounded-lg hover:bg-brand-50 text-[var(--color-muted)] hover:text-brand-600 transition-colors"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
        </button>
      ) : (
        <button
          onClick={() => setConfirm('deactivate')}
          title="Deactivate user"
          className="p-1.5 rounded-lg hover:bg-amber-50 text-[var(--color-muted)] hover:text-amber-600 transition-colors"
        >
          <ShieldOff size={14} />
        </button>
      )}
      <button
        onClick={() => setConfirm('delete')}
        title="Delete user permanently"
        className="p-1.5 rounded-lg hover:bg-red-50 text-[var(--color-muted)] hover:text-red-500 transition-colors"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function UserTable({ users, currentUserId }: {
  users: UserRow[];
  currentUserId: string;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const filtered = users.filter(u => {
    const matchSearch = u.full_name.toLowerCase().includes(search.toLowerCase())
      || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filter === 'all' || u.role === filter;
    return matchSearch && matchRole;
  });

  return (
    <div>
      {/* Filters */}
      <div className="px-6 py-3 border-b border-[var(--color-border)] flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]
                     focus:outline-none focus:ring-2 focus:ring-brand-500 w-56 transition"
        />
        <div className="flex items-center gap-1">
          {['all', ...ROLES.map(r => r.value)].map(r => (
            <button
              key={r}
              onClick={() => setFilter(r)}
              className={`text-xs px-3 py-1.5 rounded-xl transition-colors
                ${filter === r
                  ? 'bg-brand-600 text-white'
                  : 'bg-white border border-[var(--color-border)] text-[var(--color-muted)] hover:border-gray-300'
                }`}
            >
              {r === 'all' ? 'All' : roleLabel[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
              <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Staff member</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Role</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Status</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Last active</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Joined</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {filtered.map(u => {
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id} className={`hover:bg-[var(--color-surface)] transition-colors ${u.is_banned ? 'opacity-50' : ''}`}>
                  {/* Name + email */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center
                                      text-brand-700 text-xs font-bold flex-shrink-0">
                        {u.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{u.full_name}</p>
                        <p className="text-xs text-[var(--color-muted)]">{u.email}</p>
                      </div>
                    </div>
                  </td>

                  {/* Role — editable dropdown */}
                  <td className="px-5 py-3.5">
                    <RoleEditor
                      userId={u.id}
                      initialRole={u.role}
                      disabled={isSelf || u.is_banned}
                    />
                  </td>

                  {/* Status */}
                  <td className="px-5 py-3.5">
                    {u.is_banned ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1
                                       rounded-full bg-red-100 text-red-700">
                        <XCircle size={11} /> Deactivated
                      </span>
                    ) : u.confirmed ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1
                                       rounded-full bg-brand-100 text-brand-700">
                        <CheckCircle size={11} /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1
                                       rounded-full bg-amber-100 text-amber-700">
                        <Clock size={11} /> Invite pending
                      </span>
                    )}
                  </td>

                  {/* Last active */}
                  <td className="px-5 py-3.5 text-xs text-[var(--color-muted)]">
                    {u.last_sign_in
                      ? new Date(u.last_sign_in).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
                      : 'Never'}
                  </td>

                  {/* Joined */}
                  <td className="px-5 py-3.5 text-xs text-[var(--color-muted)]">
                    {new Date(u.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3.5">
                    <ActionMenu user={u} isSelf={isSelf} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-[var(--color-muted)]">
            No staff members match your search.
          </div>
        )}
      </div>
    </div>
  );
}