import { cache } from 'react';

import { getOrLoadTtlCachedValue, type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { createClient } from '@/lib/supabase/server';

export type HrOverviewStats = {
  liveJobs: number | null;
  draftJobs: number | null;
  applications: number | null;
  applicationsWeek: number | null;
  activeMembers: number | null;
  upcomingInterviewSlots: number | null;
};

const HR_OVERVIEW_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_HR_OVERVIEW_RESPONSE_CACHE_TTL_MS ?? '10000',
  10
);
const hrOverviewResponseCache = new Map<string, TtlCacheEntry<HrOverviewStats>>();
const hrOverviewInFlight = new Map<string, Promise<HrOverviewStats>>();

function getHrOverviewCacheKey(
  orgId: string,
  includeJobs: boolean,
  includeApplications: boolean,
  includeMembers: boolean,
  includeInterviews: boolean
): string {
  return [
    `org:${orgId}`,
    `jobs:${includeJobs ? '1' : '0'}`,
    `applications:${includeApplications ? '1' : '0'}`,
    `members:${includeMembers ? '1' : '0'}`,
    `interviews:${includeInterviews ? '1' : '0'}`,
  ].join(':');
}

export const getCachedHrOverviewStats = cache(
  async (
    orgId: string,
    {
      includeJobs,
      includeApplications,
      includeMembers,
      includeInterviews,
    }: {
      includeJobs: boolean;
      includeApplications: boolean;
      includeMembers: boolean;
      includeInterviews: boolean;
    }
  ): Promise<HrOverviewStats> => {
    return getOrLoadTtlCachedValue({
      cache: hrOverviewResponseCache,
      inFlight: hrOverviewInFlight,
      key: getHrOverviewCacheKey(orgId, includeJobs, includeApplications, includeMembers, includeInterviews),
      ttlMs: HR_OVERVIEW_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const nowIso = new Date().toISOString();
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoIso = weekAgo.toISOString();
        const horizon = new Date();
        horizon.setDate(horizon.getDate() + 14);
        const horizonIso = horizon.toISOString();

        const stats: HrOverviewStats = {
          liveJobs: null,
          draftJobs: null,
          applications: null,
          applicationsWeek: null,
          activeMembers: null,
          upcomingInterviewSlots: null,
        };

        const tasks: Array<PromiseLike<void>> = [];

        if (includeJobs) {
          tasks.push(
            supabase
              .from('job_listings')
              .select('id', { count: 'exact', head: true })
              .eq('org_id', orgId)
              .eq('status', 'live')
              .then(({ count }) => {
                stats.liveJobs = count ?? 0;
              })
          );
          tasks.push(
            supabase
              .from('job_listings')
              .select('id', { count: 'exact', head: true })
              .eq('org_id', orgId)
              .eq('status', 'draft')
              .then(({ count }) => {
                stats.draftJobs = count ?? 0;
              })
          );
        }

        if (includeApplications) {
          tasks.push(
            supabase
              .from('job_applications')
              .select('id', { count: 'exact', head: true })
              .eq('org_id', orgId)
              .then(({ count }) => {
                stats.applications = count ?? 0;
              })
          );
          tasks.push(
            supabase
              .from('job_applications')
              .select('id', { count: 'exact', head: true })
              .eq('org_id', orgId)
              .gte('submitted_at', weekAgoIso)
              .then(({ count }) => {
                stats.applicationsWeek = count ?? 0;
              })
          );
        }

        if (includeMembers) {
          tasks.push(
            supabase
              .from('profiles')
              .select('id', { count: 'exact', head: true })
              .eq('org_id', orgId)
              .eq('status', 'active')
              .then(({ count }) => {
                stats.activeMembers = count ?? 0;
              })
          );
        }

        if (includeInterviews) {
          tasks.push(
            supabase
              .from('interview_slots')
              .select('id', { count: 'exact', head: true })
              .eq('org_id', orgId)
              .gte('starts_at', nowIso)
              .lte('starts_at', horizonIso)
              .in('status', ['available', 'booked'])
              .then(({ count }) => {
                stats.upcomingInterviewSlots = count ?? 0;
              })
          );
        }

        await Promise.all(tasks);
        return stats;
      },
    });
  }
);
