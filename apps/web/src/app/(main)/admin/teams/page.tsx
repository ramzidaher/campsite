import { AdminTeamsClient } from '@/components/admin/AdminTeamsClient';
import { getCachedAdminTeamsPageData } from '@/lib/admin/getCachedAdminTeamsPageData';
import { hasPermission } from '@/lib/adminGates';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { withServerPerf } from '@/lib/perf/serverPerf';
import { redirect } from 'next/navigation';

export default async function AdminTeamsPage() {
  const bundle = await withServerPerf('/admin/teams', 'shell_bundle_for_access', getCachedMainShellLayoutBundle(), 300);
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!hasPermission(permissionKeys, 'departments.view')) redirect('/forbidden');

  const pageData = await withServerPerf(
    '/admin/teams',
    'cached_admin_teams_page_data',
    getCachedAdminTeamsPageData(orgId),
    650
  );

  return (
    <AdminTeamsClient
      initialDepartments={pageData.departments}
      initialTeamsByDept={pageData.teamsByDept}
      teamMembersByTeamId={pageData.teamMembersByTeamId}
      staffOptions={pageData.staffOptions}
    />
  );
}
