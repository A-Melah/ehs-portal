import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect }          from 'next/navigation';
import { Users, UserPlus, ShieldCheck } from 'lucide-react';
import UserTable   from '@/components/dashboard/admin/UserTable';
import InviteModal from '@/components/dashboard/admin/InviteModal';

export default async function AdminPage() {
  // Guard — admins only
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: self } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (self?.role !== 'admin') redirect('/dashboard');

  // Fetch all users via service role (bypasses RLS)
  const admin = createAdminClient();
  const { data: { users: authUsers } } = await admin.auth.admin.listUsers();

  // Merge auth metadata (banned, last_sign_in) with profile rows
  const { data: profiles } = await admin.from('profiles').select('*');
  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));

  const users = authUsers.map(u => ({
    id:            u.id,
    email:         u.email ?? '',
    full_name:     profileMap[u.id]?.full_name ?? '—',
    role:          profileMap[u.id]?.role ?? 'shopfloor_worker',
    created_at:    u.created_at,
    last_sign_in:  u.last_sign_in_at ?? null,
    is_banned:     !!u.banned_until,
    confirmed:     !!u.email_confirmed_at,
  }));

  // Stats
  const roleCounts = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="fade-up space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display">Staff Management</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Onboard staff and manage their portal access
          </p>
        </div>
        <InviteModal />
      </div>

      {/* Role breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { role: 'shopfloor_worker', label: 'Shopfloor',  color: 'text-blue-600',   bg: 'bg-blue-50' },
          { role: 'inspector',        label: 'Inspectors', color: 'text-violet-600', bg: 'bg-violet-50' },
          { role: 'ehs_manager',      label: 'Managers',   color: 'text-brand-600',  bg: 'bg-brand-50' },
          { role: 'admin',            label: 'Admins',     color: 'text-gray-700',   bg: 'bg-gray-100' },
        ].map(({ role, label, color, bg }) => (
          <div key={role} className="card p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>
              <ShieldCheck size={16} className={color} />
            </div>
            <div>
              <p className={`text-xl font-display ${color}`}>{roleCounts[role] ?? 0}</p>
              <p className="text-xs text-[var(--color-muted)]">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* User table */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center gap-2">
          <Users size={16} className="text-[var(--color-muted)]" />
          <h2 className="text-sm font-semibold">{users.length} staff members</h2>
        </div>
        <UserTable users={users} currentUserId={user.id} />
      </div>
    </div>
  );
}