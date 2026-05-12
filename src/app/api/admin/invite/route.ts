import { NextRequest, NextResponse } from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: caller } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (caller?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });

  const { email, full_name, role, resend } = await req.json();
  const validRoles = ['shopfloor_worker', 'inspector', 'ehs_manager', 'admin'];

  if (!email || !role)
    return NextResponse.json({ error: 'email and role are required.' }, { status: 400 });
  if (!validRoles.includes(role))
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });

  const admin = createAdminClient();

  // ── Resend: look up existing user and re-invite ──────────────────────────
  if (resend) {
    const { data: { users }, error: listErr } = await admin.auth.admin.listUsers();
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

    const existing = users.find(u => u.email === email);
    if (!existing)
      return NextResponse.json({ error: 'No user found with this email.' }, { status: 404 });

    // Re-send invite by calling inviteUserByEmail — Supabase resets the token
    const { error: resendErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data:       { full_name: full_name ?? existing.user_metadata?.full_name, role },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/login`,
    });

    // Supabase returns "already registered" when user confirmed — use generateLink instead
    if (resendErr?.message?.includes('already been registered')) {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type:       'magiclink',
        email,
        options:    { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/login` },
      });
      if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

      // Update role in profile
      await admin.from('profiles').update({ role }).eq('email', email);

      return NextResponse.json({
        success: true,
        message: 'Magic link sent — user can log in with this link.',
        link:    linkData?.properties?.action_link,
      });
    }

    if (resendErr) return NextResponse.json({ error: resendErr.message }, { status: 500 });

    // Update role in case it changed
    await admin.from('profiles').update({ role }).eq('id', existing.id);
    return NextResponse.json({ success: true, message: 'Invite resent successfully.' });
  }

  // ── New invite ────────────────────────────────────────────────────────────
  const { data: newUser, error: createError } = await admin.auth.admin.inviteUserByEmail(email, {
    data:       { full_name, role },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/login`,
  });

  if (createError) {
    const message = createError.message.includes('already been registered')
      ? 'A user with this email already exists. Use "Resend Invite" instead.'
      : createError.message;
    return NextResponse.json({ error: message, alreadyExists: true }, { status: 400 });
  }

  await admin.from('profiles').upsert({
    id:        newUser.user.id,
    email,
    full_name,
    role,
  }, { onConflict: 'id' });

  return NextResponse.json({ success: true, user_id: newUser.user.id });
}