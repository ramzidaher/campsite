import { ManagerRecruitmentClient } from '@/components/manager/ManagerRecruitmentClient';
import { getCachedHrRecruitmentPageData } from '@/lib/recruitment/getCachedHrRecruitmentPageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

/**
 * Dedicated “raise request” surface for users who also see the org queue on `/hr/hiring/requests`
 * (the queue page only renders `AdminRecruitmentListClient`).
 */
export default async function HiringNewRequestPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');

  const permissionKeys = parseShellPermissionKeys(bundle);
  const userIdRaw = (bundle as Record<string, unknown>)['user_id'];
  const userId = typeof userIdRaw === 'string' ? userIdRaw : '';
  if (!userId) redirect('/login');
  const canCreateRequest = permissionKeys.includes('recruitment.create_request');
  if (!canCreateRequest) redirect('/hr/hiring/requests');

  const canApproveRequest = permissionKeys.includes('recruitment.approve_request');
  const canManageRecruitment = permissionKeys.includes('recruitment.manage');

  const pageData = await getCachedHrRecruitmentPageData(
    orgId,
    userId,
    canCreateRequest,
    false,
    canApproveRequest,
    canManageRecruitment
  );
  if (pageData.mode !== 'manager') redirect('/hr/hiring/requests');

  return (
    <ManagerRecruitmentClient
      managedDepartments={pageData.managedDepartments}
      initialRequests={pageData.initialRequests}
      canRaise
      showHrAdminLink={Boolean(canApproveRequest || canManageRecruitment)}
      hiringHubRaise
    />
  );
}
