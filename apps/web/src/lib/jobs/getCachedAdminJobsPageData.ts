import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

export type AdminJobsPageData = {
  orgSlug: string;
  jobRows: unknown[];
  deptRows: unknown[];
};

type JobsPageCacheEntry = {
  value: AdminJobsPageData;
  expiresAt: number;
};

const JOBS_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_JOBS_PAGE_RESPONSE_CACHE_TTL_MS ?? '10000',
  10
);
const jobsPageResponseCache = new Map<string, JobsPageCacheEntry>();
const jobsPageInFlight = new Map<string, Promise<AdminJobsPageData>>();

function getJobsPageCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

/**
 * Per-request dedupe for the admin jobs list bundle (slug + departments + listings).
 * Uses React `cache()` so `createClient()` / cookies stay valid — unlike `unstable_cache`, which forbids dynamic data inside the cached scope.
 */
export const getCachedAdminJobsPageData = cache(async (orgId: string): Promise<AdminJobsPageData> => {
  const cacheKey = getJobsPageCacheKey(orgId);
  const now = Date.now();
  const cached = jobsPageResponseCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inFlight = jobsPageInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const task = (async (): Promise<AdminJobsPageData> => {
  const supabase = await createClient();
  const [orgRes, jobsRes, deptsRes] = await Promise.all([
    supabase.from('organisations').select('slug').eq('id', orgId).maybeSingle(),
    supabase
      .from('job_listings')
      .select(
        'id, title, slug, status, grade_level, salary_band, contract_type, published_at, applications_close_at, posted_year, department_id, departments(name)'
      )
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase.from('departments').select('id, name').eq('org_id', orgId).order('name'),
  ]);

    const value = {
      orgSlug: (orgRes.data?.slug as string | undefined)?.trim() ?? '',
      jobRows: jobsRes.data ?? [],
      deptRows: deptsRes.data ?? [],
    };

    jobsPageResponseCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + JOBS_PAGE_RESPONSE_CACHE_TTL_MS,
    });

    return value;
  })();

  jobsPageInFlight.set(cacheKey, task);
  try {
    return await task;
  } finally {
    jobsPageInFlight.delete(cacheKey);
  }
});
