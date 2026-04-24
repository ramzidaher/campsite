type GuardrailMeta = {
  degraded: boolean;
  reasons: string[];
  cacheStatus: 'hit' | 'miss' | 'stale-fallback';
};

const BADGE_RPC_TIMEOUT_MS = Number.parseInt(
  process.env.CAMPSITE_SHELL_BADGE_RPC_TIMEOUT_MS ?? '800',
  10
);
const STRUCTURAL_RPC_TIMEOUT_MS = Number.parseInt(
  process.env.CAMPSITE_SHELL_STRUCTURAL_RPC_TIMEOUT_MS ?? '1500',
  10
);
const BADGE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_SHELL_BADGE_CACHE_TTL_MS ?? '10000',
  10
);
const BADGE_RPC_MAX_IN_FLIGHT = Number.parseInt(
  process.env.CAMPSITE_SHELL_BADGE_RPC_MAX_IN_FLIGHT ?? '30',
  10
);

let inFlightBadgeRpc = 0;
const badgeCache = new Map<string, { value: Record<string, unknown>; expiresAt: number }>();

export async function resolveStructuralWithTimeout<T>(
  promise: PromiseLike<T>,
  fallback: T
): Promise<{ value: T; timedOut: boolean }> {
  return resolveWithTimeout(promise, STRUCTURAL_RPC_TIMEOUT_MS, fallback);
}

export async function resolveBadgeWithGuardrails<T extends { data: unknown; error: unknown }>(
  cacheKey: string,
  badgeRpcFactory: () => Promise<T>
): Promise<{ value: T; meta: GuardrailMeta }> {
  const now = Date.now();
  const reasons: string[] = [];
  const cached = badgeCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return {
      value: { data: cached.value, error: null } as T,
      meta: { degraded: false, reasons: [], cacheStatus: 'hit' },
    };
  }

  if (inFlightBadgeRpc >= BADGE_RPC_MAX_IN_FLIGHT) {
    reasons.push('in_flight_limit');
    if (cached) {
      return {
        value: { data: cached.value, error: null } as T,
        meta: { degraded: true, reasons, cacheStatus: 'stale-fallback' },
      };
    }
    return {
      value: { data: {}, error: null } as T,
      meta: { degraded: true, reasons, cacheStatus: 'stale-fallback' },
    };
  }

  inFlightBadgeRpc += 1;
  try {
    const fallback = cached
      ? ({ data: cached.value, error: null } as T)
      : ({ data: {}, error: null } as T);
    const resolved = await resolveWithTimeout(badgeRpcFactory(), BADGE_RPC_TIMEOUT_MS, fallback);
    if (resolved.timedOut) reasons.push('timeout');
    const dataObj =
      resolved.value &&
      typeof resolved.value === 'object' &&
      (resolved.value as Record<string, unknown>).data &&
      typeof (resolved.value as Record<string, unknown>).data === 'object'
        ? ((resolved.value as Record<string, unknown>).data as Record<string, unknown>)
        : {};
    badgeCache.set(cacheKey, { value: dataObj, expiresAt: Date.now() + BADGE_CACHE_TTL_MS });
    return {
      value: resolved.value,
      meta: {
        degraded: reasons.length > 0,
        reasons,
        cacheStatus: cached ? 'stale-fallback' : 'miss',
      },
    };
  } finally {
    inFlightBadgeRpc = Math.max(0, inFlightBadgeRpc - 1);
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
    const value = await Promise.race<T>([
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
