import { NextRequest, NextResponse } from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const VALID_ROLES = ['shopfloor_worker', 'inspector', 'ehs_manager', 'admin'];

export async function PATCH(req: NextRequest) {
  // Verify caller is an admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: caller } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (caller?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { userId, role } = await req.json();

  if (!userId || !role) {
    return NextResponse.json({ error: 'userId and role are required.' }, { status: 400 });
  }

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error: profileErr } = await admin
    .from('profiles')
    .update({ role })
    .eq('id', userId);

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  // Keep auth metadata in sync
  await admin.auth.admin.updateUserById(userId, {
    user_metadata: { role },
  });

  return NextResponse.json({ success: true });
}