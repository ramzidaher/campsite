import { cache } from 'react';

import { getOrLoadTtlCachedValue, type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { createClient } from '@/lib/supabase/server';

export type RecruitmentQueueRow = {
  id: string;
  job_title: string | null;
  status: string | null;
  urgency: string | null;
  archived_at: string | null;
  created_at: string | null;
  department_id: string | null;
  departments: { name?: string } | { name?: string }[] | null;
  submitter: { full_name?: string } | { full_name?: string }[] | null;
};

const RECRUITMENT_QUEUE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_RECRUITMENT_QUEUE_RESPONSE_CACHE_TTL_MS ?? '8000',
  10
);
const recruitmentQueueResponseCache = new Map<string, TtlCacheEntry<RecruitmentQueueRow[]>>();
const recruitmentQueueInFlight = new Map<string, Promise<RecruitmentQueueRow[]>>();

function getRecruitmentQueueCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

export const getCachedRecruitmentQueuePageData = cache(async (orgId: string): Promise<RecruitmentQueueRow[]> => {
  return getOrLoadTtlCachedValue({
    cache: recruitmentQueueResponseCache,
    inFlight: recruitmentQueueInFlight,
    key: getRecruitmentQueueCacheKey(orgId),
    ttlMs: RECRUITMENT_QUEUE_RESPONSE_CACHE_TTL_MS,
    load: async () => {
      const supabase = await createClient();
      const { data } = await supabase
        .from('recruitment_requests')
        .select(
          'id, job_title, status, urgency, archived_at, created_at, department_id, departments(name), submitter:profiles!recruitment_requests_created_by_fkey(full_name)'
        )
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      return (data ?? []) as RecruitmentQueueRow[];
    },
  });
});
