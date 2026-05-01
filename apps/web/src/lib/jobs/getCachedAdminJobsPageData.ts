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

function getPanelJobsPageCacheKey(orgId: string, profileId: string): string {
  return `org:${orgId}:panelist:${profileId}`;
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

export const getCachedPanelJobsPageData = cache(
  async (orgId: string, profileId: string): Promise<AdminJobsPageData> => {
    return getOrLoadSharedCachedValue({
      cache: jobsPageResponseCache,
      inFlight: jobsPageInFlight,
      key: getPanelJobsPageCacheKey(orgId, profileId),
      cacheNamespace: 'campsite:jobs:listings',
      ttlMs: JOBS_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const [{ data: orgRes }, { data: panelJobs }] = await Promise.all([
          supabase.from('organisations').select('slug').eq('id', orgId).maybeSingle(),
          supabase
            .from('job_listing_panelists')
            .select(
              'job_listings!inner(id, title, slug, status, grade_level, salary_band, contract_type, published_at, applications_close_at, posted_year, department_id, departments(name))'
            )
            .eq('org_id', orgId)
            .eq('profile_id', profileId)
            .order('created_at', { ascending: false }),
        ]);

        const jobRows = (panelJobs ?? [])
          .map(
            (row) =>
              (
                row as {
                  job_listings:
                    | AdminJobsPageData['jobRows'][number]
                    | AdminJobsPageData['jobRows'][number][];
                }
              ).job_listings
          )
          .flatMap((rel) => (Array.isArray(rel) ? rel : [rel]))
          .filter(Boolean);

        const deptMap = new Map<string, string>();
        for (const job of jobRows as Array<{
          department_id?: string | null;
          departments?: { name?: string } | { name?: string }[] | null;
        }>) {
          const dept = Array.isArray(job.departments) ? job.departments[0] : job.departments;
          if (job.department_id && dept?.name) deptMap.set(job.department_id, dept.name);
        }

        return {
          orgSlug: (orgRes?.slug as string | undefined)?.trim() ?? '',
          jobRows,
          deptRows: [...deptMap.entries()].map(([id, name]) => ({ id, name })),
        };
      },
    });
  }
);
