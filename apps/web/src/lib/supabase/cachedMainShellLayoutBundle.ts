import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  resolveBadgeWithGuardrails,
  resolveStructuralWithTimeout,
} from '@/lib/shell/shellRpcGuardrails';
import { getAuthUser } from './getAuthUser';
import { createClient } from './server';

const SHELL_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_SHELL_RESPONSE_CACHE_TTL_MS ?? '10000',
  10
);
const SHELL_RESPONSE_CACHE_NO_PROFILE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_SHELL_RESPONSE_CACHE_NO_PROFILE_TTL_MS ?? '750',
  10
);
const SHELL_IN_FLIGHT_AWAIT_TIMEOUT_MS = Number.parseInt(
  process.env.CAMPSITE_SHELL_IN_FLIGHT_AWAIT_TIMEOUT_MS ?? '4000',
  10
);
const SHELL_PERMISSION_RECOVERY_TIMEOUT_MS = Number.parseInt(
  process.env.CAMPSITE_SHELL_PERMISSION_RECOVERY_TIMEOUT_MS ?? '650',
  10
);

type ShellBundle = Record<string, unknown>;
type ShellRpcOptions = {
  bundleRpcName?: string;
  bundleRpcArgs?: Record<string, unknown>;
  structuralRpcName?: string;
  structuralRpcArgs?: Record<string, unknown>;
  badgeRpcName?: string;
  badgeRpcArgs?: Record<string, unknown>;
};
type ShellCacheEntry = {
  value: ShellBundle;
  cachedAt: number;
  expiresAt: number;
  lastSuccessAt: number | null;
};

const shellResponseCache = new Map<string, ShellCacheEntry>();
const shellInFlight = new Map<string, Promise<ShellBundle>>();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isMissingProfileBundle(value: ShellBundle): boolean {
  return value.has_profile === false;
}

function shellBundleOrgId(value: ShellBundle): string | null {
  const orgId = value.org_id;
  return typeof orgId === 'string' && orgId.trim() ? orgId.trim() : null;
}

function shellBundleProfileStatus(value: ShellBundle): string | null {
  return typeof value.profile_status === 'string' ? value.profile_status : null;
}

function shellBundleProfileRole(value: ShellBundle): string | null {
  return typeof value.profile_role === 'string' ? value.profile_role : null;
}

function shellBundlePermissionKeys(value: ShellBundle): string[] {
  const raw = value.permission_keys;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry === 'object') {
        return String((entry as { permission_key?: unknown }).permission_key ?? '').trim();
      }
      return '';
    })
    .filter(Boolean);
}

function mergeShellGuardrailReasons(value: ShellBundle, reasons: string[]): string[] {
  const existing = Array.isArray(value.shell_guardrail_reasons)
    ? value.shell_guardrail_reasons.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return [...new Set([...existing, ...reasons])];
}

function shouldRecoverPermissionKeys(value: ShellBundle): boolean {
  if (value.has_profile !== true) return false;
  if (shellBundleProfileStatus(value) !== 'active') return false;
  if (!shellBundleOrgId(value)) return false;
  if (shellBundleProfileRole(value) === 'unassigned') return false;
  return shellBundlePermissionKeys(value).length === 0;
}

function permissionRecoveryRpc(
  value: ShellBundle,
  rpcOptions?: ShellRpcOptions
):
  | { rpcName: 'get_my_permissions'; rpcArgs: { p_org_id: string } }
  | { rpcName: 'get_permissions_for_user'; rpcArgs: { p_user_id: string; p_org_id: string } }
  | null {
  const orgId = shellBundleOrgId(value);
  if (!orgId) return null;

  const explicitUserId =
    rpcOptions?.bundleRpcArgs?.['p_user_id'] ?? rpcOptions?.structuralRpcArgs?.['p_user_id'];
  if (typeof explicitUserId === 'string' && UUID_RE.test(explicitUserId)) {
    return {
      rpcName: 'get_permissions_for_user',
      rpcArgs: { p_user_id: explicitUserId, p_org_id: orgId },
    };
  }

  return { rpcName: 'get_my_permissions', rpcArgs: { p_org_id: orgId } };
}

function nextShellExpiry(value: ShellBundle, now: number): number {
  // Degraded bundles (permission timeout, RPC timeout) must not be cached — the user
  // navigating away caused Vercel to keep running a slow/cancelled request, and caching
  // that degraded result for 10s would lock them in member-mode on every subsequent page.
  if (value.shell_degraded) return now;
  // Profile bootstrap can complete seconds after auth. Keep "no profile" cache very short
  // so users don't get stuck on stale "Finish setup" UI after registration succeeds.
  return now + (isMissingProfileBundle(value) ? SHELL_RESPONSE_CACHE_NO_PROFILE_TTL_MS : SHELL_RESPONSE_CACHE_TTL_MS);
}

function withShellCacheMeta(
  value: ShellBundle,
  status: 'hit' | 'miss' | 'coalesced',
  cachedAt: number,
  freshness: 'fresh' | 'stale' | 'unknown',
  lastSuccessAt: number | null
): ShellBundle {
  return {
    ...value,
    shell_response_cache_status: status,
    shell_response_cache_age_ms: Math.max(0, Date.now() - cachedAt),
    shell_data_freshness: freshness,
    shell_last_success_at: lastSuccessAt,
  };
}

function withShellDegradedMeta(value: ShellBundle, reason: string): ShellBundle {
  const existingReasons = Array.isArray(value.shell_guardrail_reasons)
    ? value.shell_guardrail_reasons.filter((x): x is string => typeof x === 'string')
    : [];
  return {
    ...value,
    shell_degraded: true,
    shell_degraded_reason: reason,
    shell_guardrail_reasons: [...new Set([...existingReasons, reason])],
  };
}

async function awaitWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<{ value: T; timedOut: boolean }> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  try {
    const value = await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error(`shell_bundle_timeout_after_${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
    return { value, timedOut };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolveWithTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  fallback: T
): Promise<{ value: T; timedOut: boolean }> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  try {
    const value = await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          resolve(fallback);
        }, timeoutMs);
      }),
    ]);
    return { value, timedOut };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function recoverPermissionKeysIfNeeded(
  supabase: Pick<SupabaseClient, 'rpc'>,
  value: ShellBundle,
  rpcOptions?: ShellRpcOptions
): Promise<ShellBundle> {
  if (!shouldRecoverPermissionKeys(value)) return value;

  const recovery = permissionRecoveryRpc(value, rpcOptions);
  if (!recovery) {
    return withShellDegradedMeta(
      {
        ...value,
        shell_guardrail_reasons: mergeShellGuardrailReasons(value, ['permission_keys_empty']),
      },
      'permission_keys_empty'
    );
  }

  const recoveredWrapped = await resolveWithTimeout(
    supabase.rpc(recovery.rpcName, recovery.rpcArgs as never) as PromiseLike<{ data: unknown; error: unknown }>,
    SHELL_PERMISSION_RECOVERY_TIMEOUT_MS,
    { data: [], error: null } as { data: unknown; error: unknown }
  );
  const recovered = recoveredWrapped.value;
  if (recovered.error) {
    return withShellDegradedMeta(
      {
        ...value,
        shell_guardrail_reasons: mergeShellGuardrailReasons(value, ['permission_keys_recovery_error']),
      },
      'permission_keys_recovery_error'
    );
  }

  const recoveredKeys = shellBundlePermissionKeys({ permission_keys: recovered.data });
  if (recoveredKeys.length > 0) {
    return {
      ...value,
      permission_keys: recoveredKeys,
      shell_guardrail_reasons: mergeShellGuardrailReasons(value, ['permission_keys_recovered']),
    };
  }

  return withShellDegradedMeta(
    {
      ...value,
      shell_guardrail_reasons: mergeShellGuardrailReasons(value, [
        recoveredWrapped.timedOut ? 'permission_keys_recovery_timeout' : 'permission_keys_empty',
      ]),
    },
    recoveredWrapped.timedOut ? 'permission_keys_recovery_timeout' : 'permission_keys_empty'
  );
}

export function getStaleOrDefaultShellBundle(viewerKey: string): ShellBundle {
  const cached = shellResponseCache.get(viewerKey);
  if (cached) {
    return withShellDegradedMeta(
      withShellCacheMeta(cached.value, 'hit', cached.cachedAt, 'stale', cached.lastSuccessAt),
      'app_timeout_fallback'
    );
  }
  return {
    shell_response_cache_status: 'unknown',
    shell_response_cache_age_ms: null,
    shell_cache_status: 'stale-fallback',
    shell_degraded: true,
    shell_degraded_reason: 'app_timeout_fallback',
    shell_guardrail_reasons: ['app_timeout_fallback'],
    shell_data_freshness: 'unknown',
    shell_last_success_at: null,
    has_profile: null,
  };
}

/**
 * Shell bundle loader shared via React `cache()`.
 * Uses a single merged RPC by default, with optional split-RPC compatibility.
 */
export const getCachedMainShellLayoutBundle = cache(async (): Promise<Record<string, unknown>> => {
  const supabase = await createClient();
  const user = await getAuthUser();
  const viewerKey = user?.id ?? 'anonymous';
  return getMainShellLayoutBundleForViewer(supabase, viewerKey);
});

export async function getMainShellLayoutBundleForViewer(
  supabase: Pick<SupabaseClient, 'rpc'>,
  viewerKey: string,
  rpcOptions?: ShellRpcOptions
): Promise<ShellBundle> {
  const bundleRpcName = rpcOptions?.bundleRpcName ?? 'main_shell_layout_bundle';
  const bundleRpcArgs = rpcOptions?.bundleRpcArgs;
  const structuralRpcName = rpcOptions?.structuralRpcName ?? 'main_shell_layout_structural';
  const structuralRpcArgs = rpcOptions?.structuralRpcArgs;
  const badgeRpcName = rpcOptions?.badgeRpcName ?? 'main_shell_badge_counts_bundle';
  const badgeRpcArgs = rpcOptions?.badgeRpcArgs;
  const now = Date.now();
  const cached = shellResponseCache.get(viewerKey);
  if (cached && cached.expiresAt > now) {
    return withShellCacheMeta(cached.value, 'hit', cached.cachedAt, 'fresh', cached.lastSuccessAt);
  }

  const inFlight = shellInFlight.get(viewerKey);
  if (inFlight) {
    try {
      const { value } = await awaitWithTimeout(inFlight, SHELL_IN_FLIGHT_AWAIT_TIMEOUT_MS);
      return withShellCacheMeta(value, 'coalesced', Date.now(), 'fresh', Date.now());
    } catch {
      // If an in-flight request hangs or fails, release coalescing so future requests can recover.
      shellInFlight.delete(viewerKey);
      return getStaleOrDefaultShellBundle(viewerKey);
    }
  }

  const fetchPromise = (async () => {
    // Default path: one merged RPC reduces DB round-trips under Nano constraints.
    if (!rpcOptions?.structuralRpcName && !rpcOptions?.badgeRpcName) {
      const wrapped = await resolveStructuralWithTimeout(
        supabase.rpc(bundleRpcName, bundleRpcArgs),
        { data: {}, error: null } as Awaited<ReturnType<typeof supabase.rpc>>
      );
      const result = wrapped.value;
      if (result.error) throw result.error;
      const payload =
        result.data && typeof result.data === 'object'
          ? (result.data as Record<string, unknown>)
          : {};
      const recoveredPayload = await recoverPermissionKeysIfNeeded(supabase, payload, rpcOptions);
      const reasons = wrapped.timedOut ? ['timeout'] : [];
      const merged = {
        ...recoveredPayload,
        shell_degraded: wrapped.timedOut || Boolean(recoveredPayload.shell_degraded),
        shell_guardrail_reasons: [
          ...new Set([
            ...(Array.isArray(recoveredPayload.shell_guardrail_reasons)
              ? recoveredPayload.shell_guardrail_reasons.filter((x): x is string => typeof x === 'string')
              : []),
            ...reasons,
          ]),
        ],
        shell_cache_status:
          typeof recoveredPayload.shell_cache_status === 'string'
            ? recoveredPayload.shell_cache_status
            : 'single-rpc',
      };
      const cachedAt = Date.now();
      shellResponseCache.set(viewerKey, {
        value: merged,
        cachedAt,
        expiresAt: nextShellExpiry(merged, cachedAt),
        lastSuccessAt: cachedAt,
      });
      return merged;
    }

    // Compatibility path for explicit split-RPC callers.
    const structuralPromise = resolveStructuralWithTimeout(
      supabase.rpc(structuralRpcName, structuralRpcArgs),
      { data: {}, error: null } as Awaited<ReturnType<typeof supabase.rpc>>
    );
    const badgePromise = resolveBadgeWithGuardrails(
      `shell:badge:${viewerKey}`,
      () => supabase.rpc(badgeRpcName, badgeRpcArgs)
    );
    const [structuralWrapped, badgeWrapped] = await Promise.all([structuralPromise, badgePromise]);
    const structural = structuralWrapped.value;
    const badge = badgeWrapped.value;
    if (structural.error) throw structural.error;
    const s =
      structural.data && typeof structural.data === 'object'
        ? (structural.data as Record<string, unknown>)
        : {};
    const b = badge.data && typeof badge.data === 'object' ? (badge.data as Record<string, unknown>) : {};
    const isDegraded = structuralWrapped.timedOut || Boolean(badge.error) || badgeWrapped.meta.degraded;
    const reasons = [
      ...(structuralWrapped.timedOut ? ['structural_timeout'] : []),
      ...(badge.error ? ['badge_rpc_error'] : []),
      ...badgeWrapped.meta.reasons,
    ];
    const merged = await recoverPermissionKeysIfNeeded(
      supabase,
      {
        ...s,
        ...b,
        shell_degraded: structuralWrapped.timedOut || Boolean(badge.error) || badgeWrapped.meta.degraded,
        shell_guardrail_reasons: [...new Set(reasons)],
        shell_cache_status: badgeWrapped.meta.cacheStatus,
      },
      rpcOptions
    );
    const finalBundle = {
      ...s,
      ...b,
      ...merged,
      shell_degraded: isDegraded || Boolean(merged.shell_degraded),
      shell_guardrail_reasons: mergeShellGuardrailReasons(merged, reasons),
      shell_cache_status:
        typeof merged.shell_cache_status === 'string' ? merged.shell_cache_status : badgeWrapped.meta.cacheStatus,
    };
    const cachedAt = Date.now();
    shellResponseCache.set(viewerKey, {
      value: finalBundle,
      cachedAt,
      expiresAt: nextShellExpiry(finalBundle, cachedAt),
      lastSuccessAt: cachedAt,
    });
    return finalBundle;
  })();

  shellInFlight.set(viewerKey, fetchPromise);
  try {
    const { value } = await awaitWithTimeout(fetchPromise, SHELL_IN_FLIGHT_AWAIT_TIMEOUT_MS);
    return withShellCacheMeta(value, 'miss', Date.now(), 'fresh', Date.now());
  } catch {
    return getStaleOrDefaultShellBundle(viewerKey);
  } finally {
    shellInFlight.delete(viewerKey);
  }
}

export function broadcastUnreadFromShellBundle(b: Record<string, unknown>): number {
  const v = b['broadcast_unread'];
  if (typeof v === 'number' && !Number.isNaN(v)) return Math.max(0, v);
  if (v !== null && v !== undefined) return Math.max(0, Number(v));
  return 0;
}
