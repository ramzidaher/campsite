import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { resolveWithTimeout } from '@/lib/perf/resolveWithTimeout';
import { createClient } from '@/lib/supabase/server';

const PERFORMANCE_CYCLE_DETAIL_QUERY_TIMEOUT_MS = 1200;
const PERFORMANCE_CYCLE_DETAIL_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_PERFORMANCE_CYCLE_DETAIL_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);

export type PerformanceCycleDetailPageData = {
  cycle: {
    id: string;
    name: string;
    type: string;
    status: string;
    period_start: string;
    period_end: string;
    self_assessment_due: string | null;
    manager_assessment_due: string | null;
    created_at: string;
  } | null;
  reviews: Record<string, unknown>[];
  members: Array<{ id: string; full_name: string; email: string | null }>;
  partialSections: string[];
};

const performanceCycleDetailResponseCache = new Map<string, TtlCacheEntry<PerformanceCycleDetailPageData>>();
const performanceCycleDetailInFlight = new Map<string, Promise<PerformanceCycleDetailPageData>>();
registerSharedCacheStore(
  'campsite:hr:performance:cycle',
  performanceCycleDetailResponseCache,
  performanceCycleDetailInFlight
);

function getPerformanceCycleDetailCacheKey(orgId: string, cycleId: string): string {
  return `org:${orgId}:cycle:${cycleId}`;
}

export const getCachedPerformanceCycleDetailPageData = cache(
  async (orgId: string, cycleId: string): Promise<PerformanceCycleDetailPageData> => {
    return getOrLoadSharedCachedValue({
      cache: performanceCycleDetailResponseCache,
      inFlight: performanceCycleDetailInFlight,
      key: getPerformanceCycleDetailCacheKey(orgId, cycleId),
      cacheNamespace: 'campsite:hr:performance:cycle',
      ttlMs: PERFORMANCE_CYCLE_DETAIL_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const timeoutFallbackLabels = new Set<string>();

        const [{ data: cycle }, { data: reviews }, { data: members }] = await Promise.all([
          supabase
            .from('review_cycles')
            .select(
              'id, name, type, status, period_start, period_end, self_assessment_due, manager_assessment_due, created_at'
            )
            .eq('org_id', orgId)
            .eq('id', cycleId)
            .maybeSingle(),
          supabase.rpc('review_cycle_reviews', { p_cycle_id: cycleId }),
          resolveWithTimeout(
            supabase
              .from('profiles')
              .select('id, full_name, email')
              .eq('org_id', orgId)
              .eq('status', 'active')
              .order('full_name'),
            PERFORMANCE_CYCLE_DETAIL_QUERY_TIMEOUT_MS,
            { data: [], error: null },
            () => timeoutFallbackLabels.add('active_members_lookup')
          ),
        ]);

        return {
          cycle: cycle
            ? {
                id: String(cycle.id),
                name: String(cycle.name),
                type: String(cycle.type),
                status: String(cycle.status),
                period_start: String(cycle.period_start),
                period_end: String(cycle.period_end),
                self_assessment_due: cycle.self_assessment_due ? String(cycle.self_assessment_due) : null,
                manager_assessment_due: cycle.manager_assessment_due ? String(cycle.manager_assessment_due) : null,
                created_at: String(cycle.created_at),
              }
            : null,
          reviews: (reviews ?? []) as Record<string, unknown>[],
          members: (members ?? []).map((member) => ({
            id: String(member.id),
            full_name: String(member.full_name),
            email: member.email ? String(member.email) : null,
          })),
          partialSections: [...timeoutFallbackLabels],
        };
      },
    });
  }
);
