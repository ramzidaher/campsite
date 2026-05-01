import { redirect } from 'next/navigation';
import type { PermissionKey } from '@campsite/types';

import { SystemOverviewGraphClient } from '@/components/system/SystemOverviewGraphClient';
import { getCachedManagerSystemOverviewPageData } from '@/lib/manager/getCachedManagerSystemOverviewPageData';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileRole, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function ManagerSystemOverviewPage() {
  const pathStartedAtMs = Date.now();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const shellBundle = await withServerPerf(
    '/manager/system-overview',
    'shell_bundle_for_access',
    getCachedMainShellLayoutBundle(),
    300
  );
  const orgId = shellBundleOrgId(shellBundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(shellBundle) !== 'active') redirect('/broadcasts');
  const role = shellBundleProfileRole(shellBundle);
  const permissionKeys = parseShellPermissionKeys(shellBundle) as PermissionKey[];

  const canAccessManagerWorkspace = permissionKeys.some(
    (k) =>
      k === 'recruitment.view' ||
      k === 'recruitment.create_request' ||
      k === 'recruitment.manage' ||
      k === 'recruitment.approve_request' ||
      k === 'departments.view' ||
      k === 'teams.view' ||
      k === 'approvals.members.review'
  );
  if (!canAccessManagerWorkspace) redirect('/manager');

  const graph = await withServerPerf(
    '/manager/system-overview',
    'cached_manager_system_overview_page_data',
    getCachedManagerSystemOverviewPageData(orgId, user.id, role, permissionKeys),
    700
  );

  const view = (
    <div className="-mx-5 -my-7 sm:-mx-[28px]">
      <SystemOverviewGraphClient
        title="Manager workspace map"
        subtitle="Connected view of modules and entities available in your scope."
        nodes={graph.nodes}
        edges={graph.edges}
      />
    </div>
  );
  warnIfSlowServerPath('/manager/system-overview', pathStartedAtMs);
  return view;
}

