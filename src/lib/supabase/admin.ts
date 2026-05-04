import { createClient } from '@supabase/supabase-js';

/**
 * Admin client using the service role key.
 * ONLY use this in server-side code (API routes, Server Actions).
 * NEVER import this in client components — it bypasses all RLS.
 */
export function createAdminClient() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase service role environment variables.');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
  });
}