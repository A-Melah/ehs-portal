import { NextRequest, NextResponse } from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Action = 'deactivate' | 'reactivate' | 'delete';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return profile?.role === 'admin' ? user : null;
}

export async function POST(req: NextRequest) {
  const admin_user = await requireAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { userId, action }: { userId: string; action: Action } = await req.json();

  if (!userId || !action) {
    return NextResponse.json({ error: 'userId and action are required.' }, { status: 400 });
  }

  const admin = createAdminClient();

  switch (action) {
    case 'deactivate': {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: '87600h',
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      break;
    }

    case 'reactivate': {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: 'none',
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      break;
    }

    case 'delete': {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      break;
    }

    default:
      return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}