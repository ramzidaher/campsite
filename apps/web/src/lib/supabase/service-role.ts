import { createClient } from '@supabase/supabase-js';

import { getSupabaseServiceRoleKey, getSupabaseUrl } from './env';

/** Bypasses RLS. Use only in Server Actions / Route Handlers after verifying platform admin. */
export function createServiceRoleClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  if (!url || !key) {
    throw new Error(
      'Missing Supabase service role: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-only).'
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
