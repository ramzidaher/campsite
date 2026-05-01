import { AdminRecruitmentListClient } from '@/components/admin/AdminRecruitmentListClient';
import { ManagerRecruitmentClient } from '@/components/manager/ManagerRecruitmentClient';
import { getCachedHrRecruitmentPageData } from '@/lib/recruitment/getCachedHrRecruitmentPageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { withServerPerf } from '@/lib/perf/serverPerf';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { redirect } from 'next/navigation';

export default async function HrRecruitmentPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');

  const user = await getAuthUser();
  if (!user) redirect('/login');

  const permissionKeys = parseShellPermissionKeys(bundle);
  const canCreateRequest    = permissionKeys.includes('recruitment.create_request');
  const canViewRecruitment  = permissionKeys.includes('recruitment.view');
  const canApproveRequest   = permissionKeys.includes('recruitment.approve_request');
  const canManageRecruitment = permissionKeys.includes('recruitment.manage');

  const canRaise = Boolean(canCreateRequest);
  const canUseRecruitmentWorkspace =
    canRaise || canViewRecruitment || canApproveRequest || canManageRecruitment;
  if (!canUseRecruitmentWorkspace) redirect('/forbidden');

  const canViewQueue = Boolean(canViewRecruitment || canApproveRequest || canManageRecruitment);
  const pageData = await withServerPerf(
    '/hr/recruitment',
    'cached_hr_recruitment_page_data',
    getCachedHrRecruitmentPageData(
      orgId,
      user.id,
      canRaise,
      canViewQueue,
      canApproveRequest,
      canManageRecruitment
    ),
    700
  );

  if (pageData.mode === 'queue') {
    return (
      <AdminRecruitmentListClient
        rows={pageData.rows as Parameters<typeof AdminRecruitmentListClient>[0]['rows']}
      />
    );
  }

  return (
    <ManagerRecruitmentClient
      managedDepartments={pageData.managedDepartments}
      initialRequests={pageData.initialRequests}
      canRaise={canRaise}
      showHrAdminLink={Boolean(canApproveRequest || canManageRecruitment)}
    />
  );
}
