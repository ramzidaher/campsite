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
    | 'jwt_expired'
    | 'jwt_invalid'
    | 'jwt_validation_error'
    | 'jwt_valid';
  hasAuthorizationHeader: boolean;
  authErrorCode: string | null;
  authErrorMessage: string | null;
  jwtExpUnix: number | null;
  serverNowUnix: number;
  secondsUntilExpiry: number | null;
};

function parseJwtExp(token: string): number | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

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
  const serverNowUnix = Math.floor(Date.now() / 1000);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    return {
      user,
      reason: 'cookie_user',
      hasAuthorizationHeader: false,
      authErrorCode: null,
      authErrorMessage: null,
      jwtExpUnix: null,
      serverNowUnix,
      secondsUntilExpiry: null,
    };
  }

  const auth = req.headers.get('authorization');
  const hasAuthorizationHeader = Boolean(auth);
  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!auth) {
    return {
      user: null,
      reason: 'missing_auth_header',
      hasAuthorizationHeader,
      authErrorCode: null,
      authErrorMessage: null,
      jwtExpUnix: null,
      serverNowUnix,
      secondsUntilExpiry: null,
    };
  }
  if (!token) {
    return {
      user: null,
      reason: 'invalid_auth_header',
      hasAuthorizationHeader,
      authErrorCode: null,
      authErrorMessage: null,
      jwtExpUnix: null,
      serverNowUnix,
      secondsUntilExpiry: null,
    };
  }
  const jwtExpUnix = parseJwtExp(token);
  const secondsUntilExpiry = jwtExpUnix === null ? null : jwtExpUnix - serverNowUnix;

  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) {
    return {
      user: null,
      reason: 'missing_supabase_env',
      hasAuthorizationHeader,
      authErrorCode: null,
      authErrorMessage: null,
      jwtExpUnix,
      serverNowUnix,
      secondsUntilExpiry,
    };
  }

  const sb = createSupabaseJsClient(url, key);
  const {
    data: { user: jwtUser },
    error,
  } = await sb.auth.getUser(token);
  if (error || !jwtUser) {
    const message = String(error?.message ?? '');
    const code = String((error as { code?: string } | null)?.code ?? '');
    const expiredByTime = secondsUntilExpiry !== null && secondsUntilExpiry <= 0;
    const expiredByMessage = /expired/i.test(message) || /exp/i.test(code);
    const reason = expiredByTime || expiredByMessage ? 'jwt_expired' : message ? 'jwt_invalid' : 'jwt_validation_error';
    return {
      user: null,
      reason,
      hasAuthorizationHeader,
      authErrorCode: code || null,
      authErrorMessage: message || null,
      jwtExpUnix,
      serverNowUnix,
      secondsUntilExpiry,
    };
  }
  return {
    user: jwtUser,
    reason: 'jwt_valid',
    hasAuthorizationHeader,
    authErrorCode: null,
    authErrorMessage: null,
    jwtExpUnix,
    serverNowUnix,
    secondsUntilExpiry,
  };
}
