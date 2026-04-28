import { cache } from 'react';

import { getOrLoadTtlCachedValue, type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { createClient } from '@/lib/supabase/server';

export type AdminApplicationsJobRow = {
  id: string;
  title: string;
  status: string;
};

export type AdminApplicationsDepartmentRow = {
  id: string;
  name: string;
};

export type AdminApplicationsListRow = {
  id: string;
  candidate_name: string | null;
  candidate_email: string | null;
  stage: string | null;
  submitted_at: string | null;
  job_listing_id: string | null;
  department_id: string | null;
  job_listings: { title?: string; slug?: string; status?: string } | { title?: string; slug?: string; status?: string }[] | null;
  departments: { name?: string } | { name?: string }[] | null;
};

export type AdminApplicationsPageData = {
  jobs: AdminApplicationsJobRow[];
  departments: AdminApplicationsDepartmentRow[];
  apps: AdminApplicationsListRow[];
};

const ADMIN_APPLICATIONS_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ADMIN_APPLICATIONS_RESPONSE_CACHE_TTL_MS ?? '8000',
  10
);
const adminApplicationsResponseCache = new Map<string, TtlCacheEntry<AdminApplicationsPageData>>();
const adminApplicationsInFlight = new Map<string, Promise<AdminApplicationsPageData>>();

function getAdminApplicationsCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

export const getCachedAdminApplicationsPageData = cache(async (orgId: string): Promise<AdminApplicationsPageData> => {
  return getOrLoadTtlCachedValue({
    cache: adminApplicationsResponseCache,
    inFlight: adminApplicationsInFlight,
    key: getAdminApplicationsCacheKey(orgId),
    ttlMs: ADMIN_APPLICATIONS_RESPONSE_CACHE_TTL_MS,
    load: async () => {
      const supabase = await createClient();
      const [{ data: jobs }, { data: departments }, { data: apps }] = await Promise.all([
        supabase
          .from('job_listings')
          .select('id, title, status')
          .eq('org_id', orgId)
          .order('title', { ascending: true }),
        supabase.from('departments').select('id, name').eq('org_id', orgId).order('name', { ascending: true }),
        supabase
          .from('job_applications')
          .select(
            `
              id,
              candidate_name,
              candidate_email,
              stage,
              submitted_at,
              job_listing_id,
              department_id,
              job_listings ( title, slug, status ),
              departments ( name )
            `
          )
          .eq('org_id', orgId)
          .order('submitted_at', { ascending: false })
          .limit(300),
      ]);
      return {
        jobs: (jobs ?? []) as AdminApplicationsJobRow[],
        departments: (departments ?? []) as AdminApplicationsDepartmentRow[],
        apps: (apps ?? []) as AdminApplicationsListRow[],
      };
    },
  });
});
