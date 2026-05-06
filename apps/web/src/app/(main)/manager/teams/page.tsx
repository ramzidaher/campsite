import { ManagerTeamsClient } from '@/components/manager/ManagerTeamsClient';
import { getCachedManagerWorkspaceDirectoryPageData } from '@/lib/manager/getCachedManagerWorkspaceDirectoryPageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { isOrgAdminRole } from '@campsite/types';

export default async function ManagerTeamsPage() {
  const pathStartedAtMs = Date.now();
  const bundle = await withServerPerf(
    '/manager/teams',
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
  if (!permissionKeys.includes('teams.view')) redirect('/forbidden');
  if (isOrgAdminRole(role)) redirect('/admin/teams');

  const pageData = await withServerPerf(
    '/manager/teams',
    'cached_manager_workspace_directory_page_data',
    getCachedManagerWorkspaceDirectoryPageData(orgId, userId, role),
    650
  );

  const view = (
    <ManagerTeamsClient
      currentUserId={userId}
      departments={pageData.departments}
      teamsByDept={pageData.teamsByDept}
      teamMembersByTeamId={pageData.teamMembersByTeamId}
      staffOptions={pageData.staffOptions}
    />
  );
  warnIfSlowServerPath('/manager/teams', pathStartedAtMs);
  return view;
}
