import { Redis } from '@upstash/redis';

import type { TtlCacheEntry } from './readThroughTtlCache';

// Envelope prevents null-ambiguity: redis.get() returns null for both "key not found"
// and "stored null value". Wrapping in { v: T } makes {"v":null} distinguishable from null.
type CacheEnvelope<T> = { v: T };
type RegisteredSharedCacheStore = {
  cache: Map<string, TtlCacheEntry<unknown>>;
  inFlight: Map<string, Promise<unknown>>;
};

let _redis: Redis | null | undefined = undefined;
const sharedCacheRegistry = new Map<string, RegisteredSharedCacheStore[]>();

function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    _redis = Redis.fromEnv();
  } else {
    _redis = null;
  }
  return _redis;
}

export function registerSharedCacheStore<T>(
  cacheNamespace: string,
  cache: Map<string, TtlCacheEntry<T>>,
  inFlight: Map<string, Promise<T>>
): void {
  const stores = sharedCacheRegistry.get(cacheNamespace) ?? [];
  const alreadyRegistered = stores.some((store) => store.cache === cache && store.inFlight === inFlight);
  if (alreadyRegistered) return;
  stores.push({
    cache: cache as Map<string, TtlCacheEntry<unknown>>,
    inFlight: inFlight as Map<string, Promise<unknown>>,
  });
  sharedCacheRegistry.set(cacheNamespace, stores);
}

function invalidateLocalSharedCache(cacheNamespace: string, key: string): void {
  const stores = sharedCacheRegistry.get(cacheNamespace) ?? [];
  for (const store of stores) {
    store.cache.delete(key);
    store.inFlight.delete(key);
  }
}

function invalidateLocalSharedCacheByPrefix(cacheNamespace: string, keyPrefix: string): void {
  const stores = sharedCacheRegistry.get(cacheNamespace) ?? [];
  for (const store of stores) {
    for (const key of store.cache.keys()) {
      if (key.startsWith(keyPrefix)) store.cache.delete(key);
    }
    for (const key of store.inFlight.keys()) {
      if (key.startsWith(keyPrefix)) store.inFlight.delete(key);
    }
  }
}

/**
 * Tiered cache: L1 in-process Map → L2 Redis → L3 DB.
 *
 * L1 (Map): zero-latency hits within a warm instance, with per-instance in-flight coalescing.
 * L2 (Redis): shared across all Vercel instances — eliminates thundering-herd on cold instances.
 * L3 (load): the actual DB fetch, called only on a full miss.
 *
 * Redis is optional: if UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are absent (local dev),
 * the function falls back to L1-only behaviour identical to the old readThroughTtlCache pattern.
 *
 * cacheNamespace must be globally unique per data type (e.g. 'campsite:hr:dashboard') so that
 * different caches sharing the same `key` value do not collide in Redis.
 */
export async function getOrLoadSharedCachedValue<T>({
  cache,
  inFlight,
  key,
  cacheNamespace,
  ttlMs,
  load,
}: {
  cache: Map<string, TtlCacheEntry<T>>;
  inFlight: Map<string, Promise<T>>;
  key: string;
  cacheNamespace: string;
  ttlMs: number;
  load: () => Promise<T>;
}): Promise<T> {
  const now = Date.now();

  // L1: in-process Map — zero-latency within same warm instance
  const l1 = cache.get(key);
  if (l1 && l1.expiresAt > now) return l1.value;

  // Per-instance in-flight coalescing: if another request on this instance is already
  // fetching the same key, wait for it rather than firing a duplicate DB call.
  const pending = inFlight.get(key);
  if (pending) return pending;

  const redisKey = `${cacheNamespace}:${key}`;

  const task = (async (): Promise<T> => {
    const redis = getRedis();

    // L2: Redis — shared across all Vercel instances, ~1ms hit latency
    if (redis) {
      try {
        const envelope = await redis.get<CacheEnvelope<T>>(redisKey);
        if (envelope !== null) {
          // Backfill L1 so subsequent requests on this instance are instant
          cache.set(key, { value: envelope.v, expiresAt: Date.now() + ttlMs });
          return envelope.v;
        }
      } catch {
        // Redis unavailable — fall through to DB without surfacing the error
      }
    }

    // L3: DB
    const value = await load();
    const expiresAt = Date.now() + ttlMs;
    cache.set(key, { value, expiresAt });

    if (redis) {
      try {
        await redis.set(redisKey, { v: value } satisfies CacheEnvelope<T>, { ex: Math.ceil(ttlMs / 1000) });
      } catch {
        // Redis write failure is non-fatal; L1 still serves this instance
      }
    }

    return value;
  })();

  inFlight.set(key, task);
  try {
    return await task;
  } finally {
    inFlight.delete(key);
  }
}

export async function invalidateSharedCache(cacheNamespace: string, key: string): Promise<void> {
  invalidateLocalSharedCache(cacheNamespace, key);
  await deleteRedisKey(`${cacheNamespace}:${key}`);
}

export async function invalidateSharedCacheByPrefix(cacheNamespace: string, keyPrefix: string): Promise<void> {
  invalidateLocalSharedCacheByPrefix(cacheNamespace, keyPrefix);
  await deleteRedisKeysByPrefix(`${cacheNamespace}:${keyPrefix}`);
}

export async function redisGet<T>(redisKey: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return await redis.get<T>(redisKey);
  } catch {
    return null;
  }
}

export async function redisSet(redisKey: string, value: unknown, exSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(redisKey, value, { ex: exSeconds });
  } catch {
    // Non-fatal
  }
}

export async function deleteRedisKey(redisKey: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(redisKey);
  } catch {
    // Non-fatal
  }
}

export async function deleteRedisKeysByPrefix(redisKeyPrefix: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: `${redisKeyPrefix}*`,
        count: 500,
      });
      if (keys.length > 0) {
        await Promise.all(keys.map((key) => redis.del(key)));
      }
      cursor = nextCursor;
    } while (cursor !== '0');
  } catch {
    // Non-fatal
  }
}
