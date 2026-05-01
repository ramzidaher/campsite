import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { createClient } from '@/lib/supabase/server';

type HrEmployeeFileRpcResult = { data: unknown[]; error: null };

const PROFILE_HEAVY_RPC_TIMEOUT_MS = 1200;
const PROFILE_EMPLOYEE_FILE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_PROFILE_EMPLOYEE_FILE_CACHE_TTL_MS ?? '10000',
  10
);

const profileEmployeeFileResponseCache = new Map<string, TtlCacheEntry<HrEmployeeFileRpcResult>>();
const profileEmployeeFileInFlight = new Map<string, Promise<HrEmployeeFileRpcResult>>();
registerSharedCacheStore('campsite:profile:employee-file', profileEmployeeFileResponseCache, profileEmployeeFileInFlight);

async function resolveWithTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, fallback: unknown): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<T>([
      Promise.resolve(promise),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback as T), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function getProfileEmployeeFileCacheKey(orgId: string, userId: string): string {
  return `org:${orgId}:user:${userId}`;
}

export const getCachedHrEmployeeFile = cache(
  async (orgId: string, userId: string): Promise<HrEmployeeFileRpcResult> => {
    return getOrLoadSharedCachedValue({
      cache: profileEmployeeFileResponseCache,
      inFlight: profileEmployeeFileInFlight,
      key: getProfileEmployeeFileCacheKey(orgId, userId),
      cacheNamespace: 'campsite:profile:employee-file',
      ttlMs: PROFILE_EMPLOYEE_FILE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        return resolveWithTimeout(
          supabase.rpc('hr_employee_file', { p_user_id: userId }),
          PROFILE_HEAVY_RPC_TIMEOUT_MS,
          { data: [], error: null }
        ) as Promise<HrEmployeeFileRpcResult>;
      },
    });
  }
);
