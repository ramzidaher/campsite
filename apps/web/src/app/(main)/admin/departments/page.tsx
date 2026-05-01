import { AdminDepartmentsClient } from '@/components/admin/AdminDepartmentsClient';
import { getCachedAdminTeamsPageData } from '@/lib/admin/getCachedAdminTeamsPageData';
import { hasPermission } from '@/lib/adminGates';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { redirect } from 'next/navigation';

export default async function AdminDepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string }>;
}) {
  const pathStartedAtMs = Date.now();
  const sp = await searchParams;
  const openDeptId = typeof sp.dept === 'string' && sp.dept.trim() ? sp.dept.trim() : null;

  const bundle = await withServerPerf(
    '/admin/departments',
    'shell_bundle_for_access',
    getCachedMainShellLayoutBundle(),
    300
  );
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!hasPermission(permissionKeys, 'departments.view')) redirect('/admin');
  const userIdRaw = (bundle as Record<string, unknown>)['user_id'];
  const userId = typeof userIdRaw === 'string' ? userIdRaw : '';
  if (!userId) redirect('/login');

  const pageData = await withServerPerf(
    '/admin/departments',
    'cached_admin_teams_page_data',
    getCachedAdminTeamsPageData(orgId),
    650
  );

  const view = (
    <AdminDepartmentsClient
      orgId={orgId}
      currentUserId={userId}
      isOrgAdmin
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
  warnIfSlowServerPath('/admin/departments', pathStartedAtMs);
  return view;
}
