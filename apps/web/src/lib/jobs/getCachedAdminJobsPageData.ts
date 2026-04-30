import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { createClient } from '@/lib/supabase/server';

export type AdminJobsPageData = {
  orgSlug: string;
  jobRows: unknown[];
  deptRows: unknown[];
};

const JOBS_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_JOBS_PAGE_RESPONSE_CACHE_TTL_MS ?? '60000',
  10
);
const jobsPageResponseCache = new Map<string, TtlCacheEntry<AdminJobsPageData>>();
const jobsPageInFlight = new Map<string, Promise<AdminJobsPageData>>();
registerSharedCacheStore('campsite:jobs:listings', jobsPageResponseCache, jobsPageInFlight);

function getJobsPageCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

export const getCachedAdminJobsPageData = cache(async (orgId: string): Promise<AdminJobsPageData> => {
  return getOrLoadSharedCachedValue({
    cache: jobsPageResponseCache,
    inFlight: jobsPageInFlight,
    key: getJobsPageCacheKey(orgId),
    cacheNamespace: 'campsite:jobs:listings',
    ttlMs: JOBS_PAGE_RESPONSE_CACHE_TTL_MS,
    load: async () => {
      const supabase = await createClient();
      const [orgRes, jobsRes, deptsRes] = await Promise.all([
        supabase.from('organisations').select('slug').eq('id', orgId).maybeSingle(),
        supabase
          .from('job_listings')
          .select(
            'id, title, slug, status, grade_level, salary_band, contract_type, published_at, posted_year, department_id, departments(name)'
          )
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(300),
        supabase.from('departments').select('id, name').eq('org_id', orgId).order('name'),
      ]);
      return {
        orgSlug: (orgRes.data?.slug as string | undefined)?.trim() ?? '',
        jobRows: jobsRes.data ?? [],
        deptRows: deptsRes.data ?? [],
      };
    },
  });
});
