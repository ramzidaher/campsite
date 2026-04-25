import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  resolveBadgeWithGuardrails,
  resolveStructuralWithTimeout,
} from '@/lib/shell/shellRpcGuardrails';
import { createClient } from './server';

const SHELL_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_SHELL_RESPONSE_CACHE_TTL_MS ?? '10000',
  10
);
const SHELL_IN_FLIGHT_AWAIT_TIMEOUT_MS = Number.parseInt(
  process.env.CAMPSITE_SHELL_IN_FLIGHT_AWAIT_TIMEOUT_MS ?? '4000',
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
};

const shellResponseCache = new Map<string, ShellCacheEntry>();
const shellInFlight = new Map<string, Promise<ShellBundle>>();

function withShellCacheMeta(
  value: ShellBundle,
  status: 'hit' | 'miss' | 'coalesced',
  cachedAt: number
): ShellBundle {
  return {
    ...value,
    shell_response_cache_status: status,
    shell_response_cache_age_ms: Math.max(0, Date.now() - cachedAt),
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

export function getStaleOrDefaultShellBundle(viewerKey: string): ShellBundle {
  const cached = shellResponseCache.get(viewerKey);
  if (cached) {
    return withShellDegradedMeta(withShellCacheMeta(cached.value, 'hit', cached.cachedAt), 'app_timeout_fallback');
  }
  return {
    shell_response_cache_status: 'unknown',
    shell_response_cache_age_ms: null,
    shell_cache_status: 'stale-fallback',
    shell_degraded: true,
    shell_degraded_reason: 'app_timeout_fallback',
    shell_guardrail_reasons: ['app_timeout_fallback'],
  };
}

/**
 * Shell bundle loader shared via React `cache()`.
 * Uses a single merged RPC by default, with optional split-RPC compatibility.
 */
export const getCachedMainShellLayoutBundle = cache(async (): Promise<Record<string, unknown>> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
    return withShellCacheMeta(cached.value, 'hit', cached.cachedAt);
  }

  const inFlight = shellInFlight.get(viewerKey);
  if (inFlight) {
    try {
      const { value } = await awaitWithTimeout(inFlight, SHELL_IN_FLIGHT_AWAIT_TIMEOUT_MS);
      return withShellCacheMeta(value, 'coalesced', Date.now());
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
      const reasons = wrapped.timedOut ? ['timeout'] : [];
      const merged = {
        ...payload,
        shell_degraded: wrapped.timedOut || Boolean(payload.shell_degraded),
        shell_guardrail_reasons: [
          ...new Set([
            ...(Array.isArray(payload.shell_guardrail_reasons)
              ? payload.shell_guardrail_reasons.filter((x): x is string => typeof x === 'string')
              : []),
            ...reasons,
          ]),
        ],
        shell_cache_status:
          typeof payload.shell_cache_status === 'string' ? payload.shell_cache_status : 'single-rpc',
      };
      shellResponseCache.set(viewerKey, {
        value: merged,
        cachedAt: Date.now(),
        expiresAt: Date.now() + SHELL_RESPONSE_CACHE_TTL_MS,
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
    const merged = {
      ...s,
      ...b,
      shell_degraded: isDegraded,
      shell_guardrail_reasons: [...new Set(reasons)],
      shell_cache_status: badgeWrapped.meta.cacheStatus,
    };
    shellResponseCache.set(viewerKey, {
      value: merged,
      cachedAt: Date.now(),
      expiresAt: Date.now() + SHELL_RESPONSE_CACHE_TTL_MS,
    });
    return merged;
  })();

  shellInFlight.set(viewerKey, fetchPromise);
  try {
    const { value } = await awaitWithTimeout(fetchPromise, SHELL_IN_FLIGHT_AWAIT_TIMEOUT_MS);
    return withShellCacheMeta(value, 'miss', Date.now());
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
