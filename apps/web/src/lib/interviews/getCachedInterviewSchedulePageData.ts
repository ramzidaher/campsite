import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { createClient } from '@/lib/supabase/server';

export type InterviewScheduleJobRow = {
  id: string;
  title: string;
  status: string;
};

export type InterviewScheduleProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export type InterviewSchedulePageData = {
  jobs: InterviewScheduleJobRow[];
  profiles: InterviewScheduleProfileRow[];
  slots: unknown[];
};

const INTERVIEW_SCHEDULE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_INTERVIEW_SCHEDULE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const interviewScheduleResponseCache = new Map<string, TtlCacheEntry<InterviewSchedulePageData>>();
const interviewScheduleInFlight = new Map<string, Promise<InterviewSchedulePageData>>();
registerSharedCacheStore('campsite:jobs:interviews', interviewScheduleResponseCache, interviewScheduleInFlight);

function getInterviewScheduleCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

export const getCachedInterviewSchedulePageData = cache(async (orgId: string): Promise<InterviewSchedulePageData> => {
  return getOrLoadSharedCachedValue({
    cache: interviewScheduleResponseCache,
    inFlight: interviewScheduleInFlight,
    key: getInterviewScheduleCacheKey(orgId),
    cacheNamespace: 'campsite:jobs:interviews',
    ttlMs: INTERVIEW_SCHEDULE_RESPONSE_CACHE_TTL_MS,
    load: async () => {
      const supabase = await createClient();
      const fromPast = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [{ data: jobs }, { data: profiles }, { data: slots }] = await Promise.all([
        supabase
          .from('job_listings')
          .select('id, title, status')
          .eq('org_id', orgId)
          .order('title', { ascending: true }),
        supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('org_id', orgId)
          .eq('status', 'active')
          .order('full_name', { ascending: true }),
        supabase
          .from('interview_slots')
          .select(
            `
              id,
              title,
              starts_at,
              ends_at,
              status,
              job_listing_id,
              job_listings ( title ),
              interview_slot_panelists ( profile_id, profiles ( full_name ) )
            `
          )
          .eq('org_id', orgId)
          .gte('starts_at', fromPast)
          .order('starts_at', { ascending: true })
          .limit(80),
      ]);
      return {
        jobs: (jobs ?? []) as InterviewScheduleJobRow[],
        profiles: (profiles ?? []) as InterviewScheduleProfileRow[],
        slots: slots ?? [],
      };
    },
  });
});
