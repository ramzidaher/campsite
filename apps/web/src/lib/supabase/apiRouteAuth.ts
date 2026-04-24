import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

import { getSupabasePublicKey, getSupabaseUrl } from './env';
import { createClient } from './server';

export type ApiAuthUserResult = {
  user: User | null;
  reason:
    | 'cookie_user'
    | 'missing_auth_header'
    | 'invalid_auth_header'
    | 'missing_supabase_env'
    | 'jwt_invalid_or_expired'
    | 'jwt_valid';
  hasAuthorizationHeader: boolean;
};

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
  const { user } = await getUserFromApiRequestWithReason(req);
  return user;
}

/** Cookie session (web) or `Authorization: Bearer <access_token>` (e.g. mobile), with diagnostics. */
export async function getUserFromApiRequestWithReason(req: Request): Promise<ApiAuthUserResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    return { user, reason: 'cookie_user', hasAuthorizationHeader: false };
  }

  const auth = req.headers.get('authorization');
  const hasAuthorizationHeader = Boolean(auth);
  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!auth) {
    return { user: null, reason: 'missing_auth_header', hasAuthorizationHeader };
  }
  if (!token) {
    return { user: null, reason: 'invalid_auth_header', hasAuthorizationHeader };
  }

  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) {
    return { user: null, reason: 'missing_supabase_env', hasAuthorizationHeader };
  }

  const sb = createSupabaseJsClient(url, key);
  const {
    data: { user: jwtUser },
    error,
  } = await sb.auth.getUser(token);
  if (error || !jwtUser) {
    return { user: null, reason: 'jwt_invalid_or_expired', hasAuthorizationHeader };
  }
  return { user: jwtUser, reason: 'jwt_valid', hasAuthorizationHeader };
}
