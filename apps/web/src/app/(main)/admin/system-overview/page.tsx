import { redirect } from 'next/navigation';
import type { PermissionKey } from '@campsite/types';

import { SystemOverviewGraphClient } from '@/components/system/SystemOverviewGraphClient';
import { getCachedAdminSystemOverviewPageData } from '@/lib/admin/getCachedAdminSystemOverviewPageData';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import {
  parseShellPermissionKeys,
  shellBundleOrgId,
  shellBundleProfileFullName,
  shellBundleProfileRole,
  shellBundleProfileStatus,
} from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminSystemOverviewPage() {
  const pathStartedAtMs = Date.now();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const shellBundle = await withServerPerf(
    '/admin/system-overview',
    'shell_bundle_for_access',
    getCachedMainShellLayoutBundle(),
    300
  );
  const orgId = shellBundleOrgId(shellBundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(shellBundle) !== 'active') redirect('/broadcasts');
  const role = shellBundleProfileRole(shellBundle);
  const fullName = shellBundleProfileFullName(shellBundle);
  const permissionKeys = parseShellPermissionKeys(shellBundle) as PermissionKey[];

  const hasGraphAccess = permissionKeys.some(
    (k) =>
      k.startsWith('members.') ||
      k.startsWith('roles.') ||
      k.startsWith('approvals.') ||
      k.startsWith('departments.') ||
      k.startsWith('teams.') ||
      k.startsWith('broadcasts.') ||
      k.startsWith('rota.') ||
      k.startsWith('recruitment.') ||
      k.startsWith('jobs.') ||
      k.startsWith('applications.') ||
      k.startsWith('offers.') ||
      k.startsWith('interviews.')
  );
  if (!hasGraphAccess) redirect('/forbidden');

  const graph = await withServerPerf(
    '/admin/system-overview',
    'cached_admin_system_overview_page_data',
    getCachedAdminSystemOverviewPageData(orgId, user.id, role, fullName, permissionKeys),
    700
  );

  const view = (
    <SystemOverviewGraphClient
      title="System overview"
      subtitle="Permission-scoped connected map of modules, entities, and operations."
      nodes={graph.nodes}
      edges={graph.edges}
    />
  );
  warnIfSlowServerPath('/admin/system-overview', pathStartedAtMs);
  return view;
}
