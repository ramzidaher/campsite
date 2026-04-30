import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { createClient } from '@/lib/supabase/server';

export type PerformanceCycleSummary = {
  id: string;
  name: string;
  type: string;
  status: string;
  period_start: string;
  period_end: string;
  self_assessment_due: string | null;
  manager_assessment_due: string | null;
  created_at: string;
  review_total: number;
  review_completed: number;
};

const PERFORMANCE_CYCLES_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_PERFORMANCE_CYCLES_RESPONSE_CACHE_TTL_MS ?? '120000',
  10
);
const performanceCyclesResponseCache = new Map<string, TtlCacheEntry<PerformanceCycleSummary[]>>();
const performanceCyclesInFlight = new Map<string, Promise<PerformanceCycleSummary[]>>();
registerSharedCacheStore('campsite:hr:performance', performanceCyclesResponseCache, performanceCyclesInFlight);

function getPerformanceCyclesCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

export const getCachedPerformanceCyclesPageData = cache(async (orgId: string): Promise<PerformanceCycleSummary[]> => {
  return getOrLoadSharedCachedValue({
    cache: performanceCyclesResponseCache,
    inFlight: performanceCyclesInFlight,
    key: getPerformanceCyclesCacheKey(orgId),
    cacheNamespace: 'campsite:hr:performance',
    ttlMs: PERFORMANCE_CYCLES_RESPONSE_CACHE_TTL_MS,
    load: async () => {
      const supabase = await createClient();
      const { data: cycles } = await supabase
        .from('review_cycles')
        .select('id, name, type, status, period_start, period_end, self_assessment_due, manager_assessment_due, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      const cycleRows = cycles ?? [];
      const cycleIds = cycleRows.map((cycle) => String(cycle.id));
      const reviewCounts: Record<string, { total: number; completed: number }> = {};

      if (cycleIds.length > 0) {
        const { data: counts } = await supabase
          .from('performance_reviews')
          .select('cycle_id, status')
          .eq('org_id', orgId)
          .in('cycle_id', cycleIds);

        for (const row of counts ?? []) {
          const cycleId = String(row.cycle_id ?? '');
          if (!cycleId) continue;
          const existing = reviewCounts[cycleId] ?? { total: 0, completed: 0 };
          existing.total += 1;
          if (row.status === 'completed') {
            existing.completed += 1;
          }
          reviewCounts[cycleId] = existing;
        }
      }

      return cycleRows.map((cycle) => ({
        id: String(cycle.id),
        name: String(cycle.name ?? ''),
        type: String(cycle.type ?? ''),
        status: String(cycle.status ?? ''),
        period_start: String(cycle.period_start ?? ''),
        period_end: String(cycle.period_end ?? ''),
        self_assessment_due: (cycle.self_assessment_due as string | null) ?? null,
        manager_assessment_due: (cycle.manager_assessment_due as string | null) ?? null,
        created_at: String(cycle.created_at ?? ''),
        review_total: reviewCounts[String(cycle.id)]?.total ?? 0,
        review_completed: reviewCounts[String(cycle.id)]?.completed ?? 0,
      }));
    },
  });
});
