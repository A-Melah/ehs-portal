// src/app/api/admin/invite/route.ts
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // 1. Verify the requester is actually an Admin
    // We don't want just anyone hitting this API endpoint
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'ehs_manager' && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 0.3 });
    }

    // 2. Parse the body
    const { email, fullName, role } = await request.json();

    if (!email || !fullName || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 3. Initialize the Admin Client (God Mode)
    const adminClient = createAdminClient();

    // 4. Execute the Invite
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { 
        full_name: fullName, 
        role: role 
      },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      message: `Successfully invited ${email}`,
      user: data.user 
    }, { status: 200 });

  } catch (err) {
    console.error('API Route Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}