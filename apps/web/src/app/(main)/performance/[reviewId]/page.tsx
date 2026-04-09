import { ReviewDetailClient } from '@/components/performance/ReviewDetailClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function ReviewDetailPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const orgId = profile.org_id as string;

  const { data: review } = await supabase
    .from('performance_reviews')
    .select('id, cycle_id, reviewee_id, reviewer_id, status, self_assessment, self_submitted_at, manager_assessment, overall_rating, manager_submitted_at, completed_at')
    .eq('org_id', orgId)
    .eq('id', reviewId)
    .maybeSingle();

  if (!review) redirect('/broadcasts');

  const isReviewee = review.reviewee_id === user.id;
  const isReviewer = review.reviewer_id === user.id;
  const [canViewReports, canManageCycles, canReviewDirectReports] = await Promise.all([
    supabase
      .rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'performance.view_reports', p_context: {} })
      .then(({ data }) => !!data),
    supabase
      .rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'performance.manage_cycles', p_context: {} })
      .then(({ data }) => !!data),
    supabase
      .rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'performance.review_direct_reports', p_context: {} })
      .then(({ data }) => !!data),
  ]);
  const canHR = canViewReports || canManageCycles;
  const canReviewerWrite = isReviewer && canReviewDirectReports;

  if (!isReviewee && !canReviewerWrite && !canHR) redirect('/broadcasts');

  const [{ data: cycle }, { data: goals }, { data: revieweeName }, { data: reviewerName }] = await Promise.all([
    supabase.from('review_cycles').select('id, name, type, period_start, period_end, self_assessment_due, manager_assessment_due, status').eq('id', review.cycle_id as string).maybeSingle(),
    supabase.from('review_goals').select('id, title, description, status, rating, set_by, sort_order').eq('review_id', reviewId).order('sort_order'),
    supabase.from('profiles').select('full_name').eq('id', review.reviewee_id as string).maybeSingle(),
    review.reviewer_id
      ? supabase.from('profiles').select('full_name').eq('id', review.reviewer_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <ReviewDetailClient
      reviewId={reviewId}
      isReviewee={isReviewee}
      isReviewer={canReviewerWrite}
      canHR={canHR}
      review={{
        id: review.id as string,
        status: review.status as string,
        self_assessment: (review.self_assessment as string | null) ?? null,
        self_submitted_at: (review.self_submitted_at as string | null) ?? null,
        manager_assessment: (review.manager_assessment as string | null) ?? null,
        overall_rating: (review.overall_rating as string | null) ?? null,
        manager_submitted_at: (review.manager_submitted_at as string | null) ?? null,
        completed_at: (review.completed_at as string | null) ?? null,
        reviewee_name: (revieweeName?.full_name as string) ?? 'Employee',
        reviewer_name: (reviewerName?.full_name as string | null) ?? null,
      }}
      cycle={
        cycle
          ? {
              name: cycle.name as string,
              type: cycle.type as string,
              period_start: cycle.period_start as string,
              period_end: cycle.period_end as string,
              self_assessment_due: (cycle.self_assessment_due as string | null) ?? null,
              manager_assessment_due: (cycle.manager_assessment_due as string | null) ?? null,
              status: cycle.status as string,
            }
          : null
      }
      goals={(goals ?? []).map((g) => ({
        id: g.id as string,
        title: g.title as string,
        description: (g.description as string | null) ?? null,
        status: g.status as string,
        rating: (g.rating as string | null) ?? null,
        set_by: g.set_by as string,
        sort_order: g.sort_order as number,
      }))}
    />
  );
}
