import { ReviewDetailClient } from '@/components/performance/ReviewDetailClient';
import { getCachedPerformanceReviewDetailPageData } from '@/lib/performance/getCachedPerformanceReviewDetailPageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function ReviewDetailPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const viewerUserIdRaw = (bundle as Record<string, unknown>)['user_id'];
  const viewerUserId = typeof viewerUserIdRaw === 'string' ? viewerUserIdRaw : '';
  if (!viewerUserId) redirect('/login');
  const pageData = await getCachedPerformanceReviewDetailPageData(orgId, reviewId);
  if (!pageData) redirect('/broadcasts');

  const isReviewee = pageData.review.reviewee_id === viewerUserId;
  const isReviewer = pageData.review.reviewer_id === viewerUserId;
  const permissionKeys = parseShellPermissionKeys(bundle);
  const canViewReports          = permissionKeys.includes('performance.view_reports');
  const canManageCycles         = permissionKeys.includes('performance.manage_cycles');
  const canReviewDirectReports  = permissionKeys.includes('performance.review_direct_reports');
  const canHR = canViewReports || canManageCycles;
  const canReviewerWrite = isReviewer && canReviewDirectReports;

  if (!isReviewee && !canReviewerWrite && !canHR) redirect('/forbidden');

  return (
    <ReviewDetailClient
      reviewId={reviewId}
      isReviewee={isReviewee}
      isReviewer={canReviewerWrite}
      canHR={canHR}
      review={{
        id: pageData.review.id,
        status: pageData.review.status,
        self_assessment: pageData.review.self_assessment,
        self_submitted_at: pageData.review.self_submitted_at,
        manager_assessment: pageData.review.manager_assessment,
        overall_rating: pageData.review.overall_rating,
        manager_submitted_at: pageData.review.manager_submitted_at,
        completed_at: pageData.review.completed_at,
        reviewee_name: pageData.revieweeName,
        reviewer_name: pageData.reviewerName,
      }}
      cycle={pageData.cycle}
      goals={pageData.goals}
    />
  );
}
