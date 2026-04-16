import { redirect } from 'next/navigation';
import type { PermissionKey } from '@campsite/types';

import { SystemOverviewGraphClient } from '@/components/system/SystemOverviewGraphClient';
import { loadDepartmentsDirectory } from '@/lib/departments/loadDepartmentsDirectory';
import { loadWorkspaceDepartmentIds } from '@/lib/manager/workspaceDepartmentIds';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { buildSystemOverviewGraph } from '@/lib/systemOverview/buildSystemOverviewGraph';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function ManagerSystemOverviewPage() {
  const pathStartedAtMs = Date.now();
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await withServerPerf(
    '/manager/system-overview',
    'profile_lookup',
    supabase
      .from('profiles')
      .select('org_id, status, role')
      .eq('id', user.id)
      .maybeSingle(),
    300
  );
  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const permissionKeys = (await withServerPerf(
    '/manager/system-overview',
    'get_my_permissions',
    getMyPermissions(profile.org_id as string),
    300
  )) as PermissionKey[];

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

  const scopeDeptIds = await withServerPerf(
    '/manager/system-overview',
    'workspace_department_ids',
    loadWorkspaceDepartmentIds(
      supabase,
      user.id,
      (profile.role as string | null | undefined) ?? null
    ),
    350
  );
  const bundle = await withServerPerf(
    '/manager/system-overview',
    'load_departments_directory',
    loadDepartmentsDirectory(supabase, profile.org_id as string, scopeDeptIds),
    500
  );

  const graph = buildSystemOverviewGraph({
    permissions: permissionKeys,
    bundle,
    isManagerScoped: true,
  });

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

