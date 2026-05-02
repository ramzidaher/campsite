import { ManagerDashboardClient } from '@/components/admin/ManagerDashboardClient';
import { getCachedManagerDashboardPageData } from '@/lib/manager/getCachedManagerDashboardPageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';

export default async function ManagerDashboardPage() {
  const pathStartedAtMs = Date.now();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const shellBundle = await withServerPerf('/manager', 'shell_bundle_for_access', getCachedMainShellLayoutBundle(), 300);
  const orgId = shellBundleOrgId(shellBundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(shellBundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(shellBundle);
  const canViewDepartments = permissionKeys.includes('departments.view');
  const canCreateRecruitment = permissionKeys.includes('recruitment.create_request');
  if (!canViewDepartments && !canCreateRecruitment) redirect('/forbidden');

  if (!canCreateRecruitment) {
    redirect('/manager/teams');
  }

  const pageData = await withServerPerf(
    '/manager',
    'cached_manager_dashboard_page_data',
    getCachedManagerDashboardPageData(orgId, user.id),
    700
  );

  const view = (
    <ManagerDashboardClient
      stats={{
        pendingUsers: pageData.pendingUsers,
        activeUsers: pageData.activeUsers,
        totalMembers: pageData.totalMembers,
        pendingBroadcasts: pageData.pendingBroadcasts,
        broadcastsThisWeek: pageData.broadcastsThisWeek,
        shiftsWeek: pageData.shiftsWeek,
        shiftsToday: pageData.shiftsToday,
        teamsCount: pageData.teamsCount,
      }}
      hasDepartments={pageData.deptIds.length > 0}
      departmentNames={pageData.departmentNames}
      upcomingItems={pageData.upcomingItems}
      departmentBreakdown={pageData.departmentBreakdown}
      staffTimelineRows={pageData.staffTimelineRows}
      viewerUserId={user.id}
      viewerFullName={pageData.viewerFullName}
    />
  );
  warnIfSlowServerPath('/manager', pathStartedAtMs);
  return view;
}
