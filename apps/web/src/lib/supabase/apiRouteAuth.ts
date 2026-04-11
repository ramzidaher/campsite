import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

import { getSupabasePublicKey, getSupabaseUrl } from './env';
import { createClient } from './server';

/**
 * Supabase client scoped to the caller (cookie session on web or Bearer JWT on mobile)
 * so RLS policies see `auth.uid()` correctly in API routes.
 */
export async function createSupabaseForApiRequest(req: Request): Promise<SupabaseClient | null> {
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) return null;

  const auth = req.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (token) {
    return createSupabaseJsClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return createClient();
}

/** Cookie session (web) or `Authorization: Bearer <access_token>` (e.g. mobile). */
export async function getUserFromApiRequest(req: Request): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return user;

  const auth = req.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;

  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) return null;

  const sb = createSupabaseJsClient(url, key);
  const {
    data: { user: jwtUser },
    error,
  } = await sb.auth.getUser(token);
  if (error || !jwtUser) return null;
  return jwtUser;
}
