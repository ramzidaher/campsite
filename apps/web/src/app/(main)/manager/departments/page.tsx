import { AdminDepartmentsClient } from '@/components/admin/AdminDepartmentsClient';
import { getCachedManagerWorkspaceDirectoryPageData } from '@/lib/manager/getCachedManagerWorkspaceDirectoryPageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';

export default async function ManagerDepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string }>;
}) {
  const pathStartedAtMs = Date.now();
  const sp = await searchParams;
  const openDeptId = typeof sp.dept === 'string' && sp.dept.trim() ? sp.dept.trim() : null;

  const bundle = await withServerPerf(
    '/manager/departments',
    'shell_bundle_for_access',
    getCachedMainShellLayoutBundle(),
    300
  );
  const orgId = shellBundleOrgId(bundle);
  const userId = typeof bundle.user_id === 'string' ? bundle.user_id : null;
  const role = typeof bundle.profile_role === 'string' ? bundle.profile_role : null;
  if (!orgId || !userId || !role) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!permissionKeys.includes('departments.view')) redirect('/broadcasts');

  const pageData = await withServerPerf(
    '/manager/departments',
    'cached_manager_workspace_directory_page_data',
    getCachedManagerWorkspaceDirectoryPageData(orgId, userId, role),
    650
  );

  const view = (
    <AdminDepartmentsClient
      orgId={orgId}
      currentUserId={userId}
      isOrgAdmin={false}
      openDeptIdFromUrl={openDeptId}
      initialDepartments={pageData.departments}
      categoriesByDept={pageData.categoriesByDept}
      teamsByDept={pageData.teamsByDept}
      teamMembersByTeamId={pageData.teamMembersByTeamId}
      managersByDept={pageData.managersByDept}
      memberCountByDept={pageData.memberCountByDept}
      membersByDept={pageData.membersByDept}
      broadcastPermsByDept={pageData.broadcastPermsByDept}
      staffOptions={pageData.staffOptions}
    />
  );
  warnIfSlowServerPath('/manager/departments', pathStartedAtMs);
  return view;
}
