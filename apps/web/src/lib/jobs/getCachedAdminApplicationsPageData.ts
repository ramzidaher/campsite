import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
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
  job_listings: { title?: string } | { title?: string }[] | null;
  departments: { name?: string } | { name?: string }[] | null;
};

export type AdminApplicationsPageData = {
  jobs: AdminApplicationsJobRow[];
  departments: AdminApplicationsDepartmentRow[];
  apps: AdminApplicationsListRow[];
};

export type AdminApplicationsFilters = {
  jobId?: string;
  stage?: string;
  deptId?: string;
  from?: string;
  to?: string;
};

const ADMIN_APPLICATIONS_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ADMIN_APPLICATIONS_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const adminApplicationsResponseCache = new Map<string, TtlCacheEntry<AdminApplicationsPageData>>();
const adminApplicationsInFlight = new Map<string, Promise<AdminApplicationsPageData>>();
registerSharedCacheStore('campsite:jobs:applications', adminApplicationsResponseCache, adminApplicationsInFlight);

function getAdminApplicationsCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

function normalizeFilterValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getAdminApplicationsVariantCacheKey(orgId: string, filters: AdminApplicationsFilters): string {
  const jobId = normalizeFilterValue(filters.jobId);
  const stage = normalizeFilterValue(filters.stage);
  const deptId = normalizeFilterValue(filters.deptId);
  const from = normalizeFilterValue(filters.from);
  const to = normalizeFilterValue(filters.to);

  if (!jobId && !stage && !deptId && !from && !to) {
    return getAdminApplicationsCacheKey(orgId);
  }

  return [
    `org:${orgId}`,
    `job:${jobId ?? 'all'}`,
    `stage:${stage ?? 'all'}`,
    `dept:${deptId ?? 'all'}`,
    `from:${from ?? 'all'}`,
    `to:${to ?? 'all'}`,
  ].join(':');
}

async function loadAdminApplicationsPageData(
  orgId: string,
  filters: AdminApplicationsFilters
): Promise<AdminApplicationsPageData> {
  const supabase = await createClient();
  let applicationsQuery = supabase
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
        job_listings ( title ),
        departments ( name )
      `
    )
    .eq('org_id', orgId)
    .order('submitted_at', { ascending: false })
    .limit(300);

  const jobId = normalizeFilterValue(filters.jobId);
  const stage = normalizeFilterValue(filters.stage);
  const deptId = normalizeFilterValue(filters.deptId);
  const from = normalizeFilterValue(filters.from);
  const to = normalizeFilterValue(filters.to);

  if (jobId) applicationsQuery = applicationsQuery.eq('job_listing_id', jobId);
  if (stage) applicationsQuery = applicationsQuery.eq('stage', stage);
  if (deptId) applicationsQuery = applicationsQuery.eq('department_id', deptId);
  if (from) applicationsQuery = applicationsQuery.gte('submitted_at', `${from}T00:00:00.000Z`);
  if (to) applicationsQuery = applicationsQuery.lte('submitted_at', `${to}T23:59:59.999Z`);

  const [{ data: jobs }, { data: departments }, { data: apps, error }] = await Promise.all([
    supabase
      .from('job_listings')
      .select('id, title, status')
      .eq('org_id', orgId)
      .order('title', { ascending: true }),
    supabase.from('departments').select('id, name').eq('org_id', orgId).order('name', { ascending: true }),
    applicationsQuery,
  ]);

  if (error) {
    throw new Error(error.message);
  }

  return {
    jobs: (jobs ?? []) as AdminApplicationsJobRow[],
    departments: (departments ?? []) as AdminApplicationsDepartmentRow[],
    apps: (apps ?? []) as AdminApplicationsListRow[],
  };
}

export const getCachedAdminApplicationsPageData = cache(
  async (orgId: string, filters: AdminApplicationsFilters = {}): Promise<AdminApplicationsPageData> => {
    return getOrLoadSharedCachedValue({
      cache: adminApplicationsResponseCache,
      inFlight: adminApplicationsInFlight,
      key: getAdminApplicationsVariantCacheKey(orgId, filters),
      cacheNamespace: 'campsite:jobs:applications',
      ttlMs: ADMIN_APPLICATIONS_RESPONSE_CACHE_TTL_MS,
      load: async () => loadAdminApplicationsPageData(orgId, filters),
    });
  }
);
