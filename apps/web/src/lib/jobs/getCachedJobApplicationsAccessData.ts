import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

export type JobApplicationsAccessData = {
  isAssignedPanelist: boolean;
};

const JOB_APPLICATIONS_ACCESS_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_JOB_APPLICATIONS_ACCESS_RESPONSE_CACHE_TTL_MS ?? '15000',
  10
);
const jobApplicationsAccessResponseCache = new Map<string, TtlCacheEntry<JobApplicationsAccessData>>();
const jobApplicationsAccessInFlight = new Map<string, Promise<JobApplicationsAccessData>>();
registerSharedCacheStore(
  'campsite:jobs:detail:applications:access',
  jobApplicationsAccessResponseCache,
  jobApplicationsAccessInFlight
);

function getJobApplicationsAccessCacheKey(orgId: string, jobId: string, userId: string): string {
  return `org:${orgId}:job:${jobId}:user:${userId}`;
}

export const getCachedJobApplicationsAccessData = cache(
  async (orgId: string, jobId: string, userId: string): Promise<JobApplicationsAccessData> => {
    return getOrLoadSharedCachedValue({
      cache: jobApplicationsAccessResponseCache,
      inFlight: jobApplicationsAccessInFlight,
      key: getJobApplicationsAccessCacheKey(orgId, jobId, userId),
      cacheNamespace: 'campsite:jobs:detail:applications:access',
      ttlMs: JOB_APPLICATIONS_ACCESS_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const { data: panelRow } = await supabase
          .from('job_listing_panelists')
          .select('id')
          .eq('org_id', orgId)
          .eq('job_listing_id', jobId)
          .eq('profile_id', userId)
          .maybeSingle();
        return { isAssignedPanelist: Boolean(panelRow?.id) };
      },
    });
  }
);
