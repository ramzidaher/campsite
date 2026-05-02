import { EmployeePerformanceIndexClient } from '@/components/performance/EmployeePerformanceIndexClient';
import { getCachedPerformanceIndexPageData } from '@/lib/performance/getCachedPerformanceIndexPageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function EmployeePerformancePage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  const userId = typeof bundle.user_id === 'string' ? bundle.user_id : null;
  if (!orgId || !userId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const canReviewDirectReports = permissionKeys.includes('performance.review_direct_reports');
  const pageData = await getCachedPerformanceIndexPageData(orgId, userId, canReviewDirectReports);
  const reviews = pageData.reviews;

  if (!reviews?.length && !canReviewDirectReports) redirect('/broadcasts');

  return (
    <EmployeePerformanceIndexClient
      userId={userId}
      mayHaveTeamReviews={!!canReviewDirectReports}
      reviews={reviews}
    />
  );
}
