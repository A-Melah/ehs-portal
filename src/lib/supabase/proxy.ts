import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // ── Helper: fetch role once and reuse ────────────────────────────────────────
  let _role: string | null = null;
  async function getRole(): Promise<string | null> {
    if (_role) return _role;
    if (!user) return null;
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    _role = data?.role ?? null;
    return _role;
  }

  function redirect(path: string) {
    const url = request.nextUrl.clone();
    url.pathname = path;
    return NextResponse.redirect(url);
  }

  // ── 1. Unauthenticated → login ───────────────────────────────────────────────
  if (!user && !pathname.startsWith('/auth')) {
    return redirect('/auth/login');
  }

  // ── 2. Authenticated on login page → role-based home ────────────────────────
  if (user && pathname.startsWith('/auth')) {
    const role = await getRole();
    return redirect(role === 'shopfloor_worker' ? '/report' : '/dashboard');
  }

  // ── 3. Shopfloor workers blocked from dashboard ──────────────────────────────
  if (user && pathname.startsWith('/dashboard')) {
    const role = await getRole();
    if (role === 'shopfloor_worker') return redirect('/report');
  }

  // ── 4. Non-workers blocked from /report ─────────────────────────────────────
  if (user && pathname.startsWith('/report')) {
    const role = await getRole();
    if (role !== 'shopfloor_worker') return redirect('/dashboard');
  }

  // ── 5. Non-admins blocked from /dashboard/admin ──────────────────────────────
  if (user && pathname.startsWith('/dashboard/admin')) {
    const role = await getRole();
    if (role !== 'admin') return redirect('/dashboard');
  }

  // ── 6. Non-admins blocked from admin API routes ───────────────────────────────
  if (user && pathname.startsWith('/api/admin')) {
    const role = await getRole();
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  return supabaseResponse;
}