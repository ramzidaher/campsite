export type TtlCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export async function getOrLoadTtlCachedValue<T>({
  cache,
  inFlight,
  key,
  ttlMs,
  load,
}: {
  cache: Map<string, TtlCacheEntry<T>>;
  inFlight: Map<string, Promise<T>>;
  key: string;
  ttlMs: number;
  load: () => Promise<T>;
}): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const pending = inFlight.get(key);
  if (pending) {
    return pending;
  }

  const task = (async () => {
    const value = await load();
    cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
    return value;
  })();

  inFlight.set(key, task);
  try {
    return await task;
  } finally {
    inFlight.delete(key);
  }
}
