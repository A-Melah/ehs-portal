'use server';

import { revalidatePath }    from 'next/cache';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ── Guard: only admins may call these actions ─────────────────────────────────
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') throw new Error('Forbidden');
  return createAdminClient();
}

// ── Update a user's role ──────────────────────────────────────────────────────
export async function updateUserRole(userId: string, newRole: string) {
  const validRoles = ['shopfloor_worker', 'inspector', 'ehs_manager', 'admin'];
  if (!validRoles.includes(newRole)) throw new Error('Invalid role');

  const admin = await requireAdmin();

  // Update profile table
  const { error: profileErr } = await admin
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId);

  if (profileErr) throw new Error(profileErr.message);

  // Keep auth.users metadata in sync so middleware reads correctly
  await admin.auth.admin.updateUserById(userId, {
    user_metadata: { role: newRole },
  });

  revalidatePath('/dashboard/admin');
}

// ── Deactivate a user (ban them) ──────────────────────────────────────────────
export async function deactivateUser(userId: string) {
  const admin = await requireAdmin();

  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: '87600h', // 10 years = effectively permanent
  });

  if (error) throw new Error(error.message);

  await admin
    .from('profiles')
    .update({ role: 'shopfloor_worker' }) // demote as safety measure
    .eq('id', userId);

  revalidatePath('/dashboard/admin');
}

// ── Reactivate a user ─────────────────────────────────────────────────────────
export async function reactivateUser(userId: string) {
  const admin = await requireAdmin();

  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: 'none',
  });

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/admin');
}

// ── Delete a user permanently ─────────────────────────────────────────────────
export async function deleteUser(userId: string) {
  const admin = await requireAdmin();

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/admin');
}