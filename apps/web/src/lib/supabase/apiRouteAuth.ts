import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { getSupabasePublicKey, getSupabaseUrl } from './env';
import { createClient } from './server';

type AuthValidationSource = 'local_jwt' | 'cache_hit' | 'remote_user' | 'cookie_session';

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
  authValidationSource: AuthValidationSource;
  authRemoteUserCalls: number;
  authRemoteUserFailures: number;
};

type TokenCacheEntry = {
  result: ApiAuthUserResult;
  expiresAtMs: number;
};

const AUTH_CACHE_TTL_MS = Number.parseInt(process.env.CAMPSITE_AUTH_CACHE_TTL_MS ?? '45000', 10);
const JWKS_FETCH_TIMEOUT_MS = Number.parseInt(process.env.CAMPSITE_AUTH_JWKS_TIMEOUT_MS ?? '15000', 10);
const ALLOW_REMOTE_USER_FALLBACK = process.env.CAMPSITE_AUTH_REMOTE_FALLBACK === '1';
const tokenAuthCache = new Map<string, TokenCacheEntry>();
const tokenAuthInFlight = new Map<string, Promise<ApiAuthUserResult>>();
let remoteUserCalls = 0;
let remoteUserFailures = 0;
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function parseJwtPayload(token: string): (JWTPayload & Record<string, unknown>) | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as JWTPayload & Record<string, unknown>;
  } catch {
    return null;
  }
}

function toResult(result: Omit<ApiAuthUserResult, 'authRemoteUserCalls' | 'authRemoteUserFailures'>): ApiAuthUserResult {
  return {
    ...result,
    authRemoteUserCalls: remoteUserCalls,
    authRemoteUserFailures: remoteUserFailures,
  };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function getCachedAuthResult(token: string): ApiAuthUserResult | null {
  const key = hashToken(token);
  const cached = tokenAuthCache.get(key);
  if (!cached || cached.expiresAtMs <= Date.now()) {
    if (cached) tokenAuthCache.delete(key);
    return null;
  }
  return toResult({ ...cached.result, authValidationSource: 'cache_hit' });
}

function setCachedAuthResult(token: string, result: ApiAuthUserResult) {
  const ttlMsByExpiry =
    result.secondsUntilExpiry === null ? AUTH_CACHE_TTL_MS : Math.max(0, result.secondsUntilExpiry * 1000);
  const ttlMs = Math.max(0, Math.min(AUTH_CACHE_TTL_MS, ttlMsByExpiry));
  if (ttlMs <= 0) return;
  tokenAuthCache.set(hashToken(token), {
    result,
    expiresAtMs: Date.now() + ttlMs,
  });
}

function toApiUserFromSub(sub: string): User {
  return { id: sub } as User;
}

function getSupabaseJwtSecret(): string | undefined {
  return process.env.SUPABASE_JWT_SECRET;
}

function getIssuer(url: string): string {
  return `${url.replace(/\/+$/, '')}/auth/v1`;
}

function getAllowedAudiences(): string[] {
  const configured = (process.env.CAMPSITE_SUPABASE_JWT_AUDIENCE ?? 'authenticated')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return configured.length ? configured : ['authenticated'];
}

async function verifyLocally(token: string, url: string): Promise<JWTPayload> {
  const secret = getSupabaseJwtSecret();
  const issuer = getIssuer(url);
  const audience = getAllowedAudiences();
  if (secret) {
    const verified = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer,
      audience,
      clockTolerance: 60,
    });
    return verified.payload;
  }
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${url.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`), {
      timeoutDuration: JWKS_FETCH_TIMEOUT_MS,
      cacheMaxAge: 600_000,
    });
  }
  const verified = await jwtVerify(token, jwks, {
    issuer,
    audience,
    clockTolerance: 60,
  });
  return verified.payload;
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
    return toResult({
      user,
      reason: 'cookie_user',
      hasAuthorizationHeader: false,
      authErrorCode: null,
      authErrorMessage: null,
      jwtExpUnix: null,
      serverNowUnix,
      secondsUntilExpiry: null,
      authValidationSource: 'cookie_session',
    });
  }

  const auth = req.headers.get('authorization');
  const hasAuthorizationHeader = Boolean(auth);
  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!auth) {
    return toResult({
      user: null,
      reason: 'missing_auth_header',
      hasAuthorizationHeader,
      authErrorCode: null,
      authErrorMessage: null,
      jwtExpUnix: null,
      serverNowUnix,
      secondsUntilExpiry: null,
      authValidationSource: 'local_jwt',
    });
  }
  if (!token) {
    return toResult({
      user: null,
      reason: 'invalid_auth_header',
      hasAuthorizationHeader,
      authErrorCode: null,
      authErrorMessage: null,
      jwtExpUnix: null,
      serverNowUnix,
      secondsUntilExpiry: null,
      authValidationSource: 'local_jwt',
    });
  }
  const cached = getCachedAuthResult(token);
  if (cached) {
    return cached;
  }
  const jwtPayload = parseJwtPayload(token);
  const jwtExpUnix = typeof jwtPayload?.exp === 'number' ? jwtPayload.exp : null;
  const secondsUntilExpiry = jwtExpUnix === null ? null : jwtExpUnix - serverNowUnix;

  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) {
    return toResult({
      user: null,
      reason: 'missing_supabase_env',
      hasAuthorizationHeader,
      authErrorCode: null,
      authErrorMessage: null,
      jwtExpUnix,
      serverNowUnix,
      secondsUntilExpiry,
      authValidationSource: 'local_jwt',
    });
  }

  const inflightKey = hashToken(token);
  const existing = tokenAuthInFlight.get(inflightKey);
  if (existing) {
    const coalesced = await existing;
    return toResult({ ...coalesced, authValidationSource: 'cache_hit' });
  }

  const verifyPromise = (async (): Promise<ApiAuthUserResult> => {
    try {
      const payload = await verifyLocally(token, url);
      const sub = typeof payload.sub === 'string' ? payload.sub : '';
      if (!sub) {
        return toResult({
          user: null,
          reason: 'jwt_invalid',
          hasAuthorizationHeader,
          authErrorCode: 'missing_sub',
          authErrorMessage: 'JWT payload missing sub',
          jwtExpUnix,
          serverNowUnix,
          secondsUntilExpiry,
          authValidationSource: 'local_jwt',
        });
      }
      const ok = toResult({
        user: toApiUserFromSub(sub),
        reason: 'jwt_valid',
        hasAuthorizationHeader,
        authErrorCode: null,
        authErrorMessage: null,
        jwtExpUnix,
        serverNowUnix,
        secondsUntilExpiry,
        authValidationSource: 'local_jwt',
      });
      setCachedAuthResult(token, ok);
      return ok;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code =
        error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : null;
      const expiredByTime = secondsUntilExpiry !== null && secondsUntilExpiry <= 0;
      const jwksOrNetworkIssue = code === 'ERR_JWKS_TIMEOUT' || /timed out|fetch failed|network/i.test(message);
      const expiredByMessage =
        !jwksOrNetworkIssue &&
        (/expired/i.test(message) ||
          (typeof code === 'string' && /jwt[_-]?expired|token[_-]?expired|ERR_JWT_EXPIRED/i.test(code)));
      if (ALLOW_REMOTE_USER_FALLBACK) {
        remoteUserCalls += 1;
        const sb = createSupabaseJsClient(url, key);
        const {
          data: { user: jwtUser },
          error: remoteError,
        } = await sb.auth.getUser(token);
        if (!remoteError && jwtUser) {
          const remoteOk = toResult({
            user: jwtUser,
            reason: 'jwt_valid',
            hasAuthorizationHeader,
            authErrorCode: null,
            authErrorMessage: null,
            jwtExpUnix,
            serverNowUnix,
            secondsUntilExpiry,
            authValidationSource: 'remote_user',
          });
          setCachedAuthResult(token, remoteOk);
          return remoteOk;
        }
        remoteUserFailures += 1;
        const remoteMessage = String(remoteError?.message ?? message);
        const remoteCode = String((remoteError as { code?: string } | null)?.code ?? code ?? '');
        const remoteReason =
          expiredByTime || /expired|exp/i.test(remoteMessage) || /expired|exp/i.test(remoteCode)
            ? 'jwt_expired'
            : 'jwt_invalid';
        return toResult({
          user: null,
          reason: remoteReason,
          hasAuthorizationHeader,
          authErrorCode: remoteCode || null,
          authErrorMessage: remoteMessage || null,
          jwtExpUnix,
          serverNowUnix,
          secondsUntilExpiry,
          authValidationSource: 'remote_user',
        });
      }
      return toResult({
        user: null,
        reason: jwksOrNetworkIssue
          ? 'jwt_validation_error'
          : expiredByTime || expiredByMessage
            ? 'jwt_expired'
            : 'jwt_invalid',
        hasAuthorizationHeader,
        authErrorCode: code,
        authErrorMessage: message || null,
        jwtExpUnix,
        serverNowUnix,
        secondsUntilExpiry,
        authValidationSource: 'local_jwt',
      });
    }
  })();

  tokenAuthInFlight.set(inflightKey, verifyPromise);
  try {
    const result = await verifyPromise;
    if (result.user) {
      setCachedAuthResult(token, result);
    }
    return result;
  } finally {
    tokenAuthInFlight.delete(inflightKey);
  }
}
