import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

export type PerformanceReviewDetailPageData = {
  review: {
    id: string;
    reviewee_id: string;
    reviewer_id: string | null;
    status: string;
    self_assessment: string | null;
    self_submitted_at: string | null;
    manager_assessment: string | null;
    overall_rating: string | null;
    manager_submitted_at: string | null;
    completed_at: string | null;
    cycle_id: string;
  };
  cycle: {
    name: string;
    type: string;
    period_start: string;
    period_end: string;
    self_assessment_due: string | null;
    manager_assessment_due: string | null;
    status: string;
  } | null;
  goals: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    rating: string | null;
    set_by: string;
    sort_order: number;
  }>;
  revieweeName: string;
  reviewerName: string | null;
} | null;

const PERFORMANCE_REVIEW_DETAIL_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_PERFORMANCE_REVIEW_DETAIL_PAGE_RESPONSE_CACHE_TTL_MS ?? '15000',
  10
);
const performanceReviewDetailPageResponseCache = new Map<string, TtlCacheEntry<PerformanceReviewDetailPageData>>();
const performanceReviewDetailPageInFlight = new Map<string, Promise<PerformanceReviewDetailPageData>>();
registerSharedCacheStore(
  'campsite:performance:review-detail',
  performanceReviewDetailPageResponseCache,
  performanceReviewDetailPageInFlight
);

function getPerformanceReviewDetailPageCacheKey(orgId: string, reviewId: string): string {
  return `org:${orgId}:review:${reviewId}`;
}

export const getCachedPerformanceReviewDetailPageData = cache(
  async (orgId: string, reviewId: string): Promise<PerformanceReviewDetailPageData> => {
    return getOrLoadSharedCachedValue({
      cache: performanceReviewDetailPageResponseCache,
      inFlight: performanceReviewDetailPageInFlight,
      key: getPerformanceReviewDetailPageCacheKey(orgId, reviewId),
      cacheNamespace: 'campsite:performance:review-detail',
      ttlMs: PERFORMANCE_REVIEW_DETAIL_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const { data: review } = await supabase
          .from('performance_reviews')
          .select(
            'id, cycle_id, reviewee_id, reviewer_id, status, self_assessment, self_submitted_at, manager_assessment, overall_rating, manager_submitted_at, completed_at'
          )
          .eq('org_id', orgId)
          .eq('id', reviewId)
          .maybeSingle();
        if (!review) return null;

        const [{ data: cycle }, { data: goals }, { data: revieweeName }, { data: reviewerName }] = await Promise.all([
          supabase
            .from('review_cycles')
            .select(
              'id, name, type, period_start, period_end, self_assessment_due, manager_assessment_due, status'
            )
            .eq('id', review.cycle_id as string)
            .maybeSingle(),
          supabase
            .from('review_goals')
            .select('id, title, description, status, rating, set_by, sort_order')
            .eq('review_id', reviewId)
            .order('sort_order'),
          supabase.from('profiles').select('full_name').eq('id', review.reviewee_id as string).maybeSingle(),
          review.reviewer_id
            ? supabase.from('profiles').select('full_name').eq('id', review.reviewer_id as string).maybeSingle()
            : Promise.resolve({ data: null as { full_name?: string | null } | null }),
        ]);

        return {
          review: {
            id: review.id as string,
            reviewee_id: review.reviewee_id as string,
            reviewer_id: (review.reviewer_id as string | null) ?? null,
            status: review.status as string,
            self_assessment: (review.self_assessment as string | null) ?? null,
            self_submitted_at: (review.self_submitted_at as string | null) ?? null,
            manager_assessment: (review.manager_assessment as string | null) ?? null,
            overall_rating: (review.overall_rating as string | null) ?? null,
            manager_submitted_at: (review.manager_submitted_at as string | null) ?? null,
            completed_at: (review.completed_at as string | null) ?? null,
            cycle_id: review.cycle_id as string,
          },
          cycle: cycle
            ? {
                name: cycle.name as string,
                type: cycle.type as string,
                period_start: cycle.period_start as string,
                period_end: cycle.period_end as string,
                self_assessment_due: (cycle.self_assessment_due as string | null) ?? null,
                manager_assessment_due: (cycle.manager_assessment_due as string | null) ?? null,
                status: cycle.status as string,
              }
            : null,
          goals: (goals ?? []).map((goal) => ({
            id: goal.id as string,
            title: goal.title as string,
            description: (goal.description as string | null) ?? null,
            status: goal.status as string,
            rating: (goal.rating as string | null) ?? null,
            set_by: goal.set_by as string,
            sort_order: goal.sort_order as number,
          })),
          revieweeName: (revieweeName?.full_name as string) ?? 'Employee',
          reviewerName: (reviewerName?.full_name as string | null) ?? null,
        };
      },
    });
  }
);
