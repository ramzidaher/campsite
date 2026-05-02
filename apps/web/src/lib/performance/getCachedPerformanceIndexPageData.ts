import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

export type PerformanceIndexReviewItem = {
  id: string;
  cycle: {
    name: string;
    type: string;
    period_start: string;
    period_end: string;
    status: string;
    self_assessment_due: string | null;
    manager_assessment_due: string | null;
  } | null;
  is_reviewee: boolean;
  reviewee_name: string | null;
  status: string;
  overall_rating: string | null;
  self_submitted_at: string | null;
  manager_submitted_at: string | null;
  completed_at: string | null;
};

export type PerformanceIndexPageData = {
  reviews: PerformanceIndexReviewItem[];
};

const PERFORMANCE_INDEX_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_PERFORMANCE_INDEX_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const performanceIndexPageResponseCache = new Map<string, TtlCacheEntry<PerformanceIndexPageData>>();
const performanceIndexPageInFlight = new Map<string, Promise<PerformanceIndexPageData>>();
registerSharedCacheStore(
  'campsite:performance:index',
  performanceIndexPageResponseCache,
  performanceIndexPageInFlight
);

function getPerformanceIndexPageCacheKey(orgId: string, userId: string, canReviewDirectReports: boolean): string {
  return `org:${orgId}:user:${userId}:mgr:${canReviewDirectReports ? '1' : '0'}`;
}

export const getCachedPerformanceIndexPageData = cache(
  async (orgId: string, userId: string, canReviewDirectReports: boolean): Promise<PerformanceIndexPageData> => {
    return getOrLoadSharedCachedValue({
      cache: performanceIndexPageResponseCache,
      inFlight: performanceIndexPageInFlight,
      key: getPerformanceIndexPageCacheKey(orgId, userId, canReviewDirectReports),
      cacheNamespace: 'campsite:performance:index',
      ttlMs: PERFORMANCE_INDEX_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const reviewFilter = canReviewDirectReports
          ? `reviewee_id.eq.${userId},reviewer_id.eq.${userId}`
          : `reviewee_id.eq.${userId}`;

        const { data: reviews } = await supabase
          .from('performance_reviews')
          .select(
            'id, cycle_id, reviewee_id, reviewer_id, status, overall_rating, self_submitted_at, manager_submitted_at, completed_at'
          )
          .eq('org_id', orgId)
          .or(reviewFilter)
          .order('created_at', { ascending: false });

        const cycleIds = [...new Set((reviews ?? []).map((r) => String(r.cycle_id ?? '')).filter(Boolean))];
        const { data: cycles } = cycleIds.length
          ? await supabase
              .from('review_cycles')
              .select(
                'id, name, type, period_start, period_end, status, self_assessment_due, manager_assessment_due'
              )
              .in('id', cycleIds)
          : { data: [] as Array<Record<string, unknown>> };

        const cycleMap: Record<
          string,
          {
            name: string;
            type: string;
            period_start: string;
            period_end: string;
            status: string;
            self_assessment_due: string | null;
            manager_assessment_due: string | null;
          }
        > = {};
        for (const cycle of cycles ?? []) {
          cycleMap[String(cycle.id)] = {
            name: String(cycle.name ?? ''),
            type: String(cycle.type ?? ''),
            period_start: String(cycle.period_start ?? ''),
            period_end: String(cycle.period_end ?? ''),
            status: String(cycle.status ?? ''),
            self_assessment_due: (cycle.self_assessment_due as string | null) ?? null,
            manager_assessment_due: (cycle.manager_assessment_due as string | null) ?? null,
          };
        }

        const revieweeIds = [
          ...new Set(
            (reviews ?? [])
              .filter((review) => String(review.reviewer_id ?? '') === userId)
              .map((review) => String(review.reviewee_id ?? ''))
              .filter(Boolean)
          ),
        ];
        const revieweeNames: Record<string, string> = {};
        if (revieweeIds.length) {
          const { data: profs } = await supabase
            .from('coworker_directory_public')
            .select('id, full_name')
            .in('id', revieweeIds);
          for (const prof of profs ?? []) {
            revieweeNames[String(prof.id ?? '')] = String(prof.full_name ?? '');
          }
        }

        return {
          reviews: (reviews ?? []).map((review) => ({
            id: String(review.id ?? ''),
            cycle: cycleMap[String(review.cycle_id ?? '')] ?? null,
            is_reviewee: String(review.reviewee_id ?? '') === userId,
            reviewee_name: revieweeNames[String(review.reviewee_id ?? '')] ?? null,
            status: String(review.status ?? ''),
            overall_rating: (review.overall_rating as string | null) ?? null,
            self_submitted_at: (review.self_submitted_at as string | null) ?? null,
            manager_submitted_at: (review.manager_submitted_at as string | null) ?? null,
            completed_at: (review.completed_at as string | null) ?? null,
          })),
        };
      },
    });
  }
);
