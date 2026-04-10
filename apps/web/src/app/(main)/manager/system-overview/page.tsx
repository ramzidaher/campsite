import { redirect } from 'next/navigation';
import type { PermissionKey } from '@campsite/types';

import { SystemOverviewGraphClient } from '@/components/system/SystemOverviewGraphClient';
import { loadDepartmentsDirectory } from '@/lib/departments/loadDepartmentsDirectory';
import { loadWorkspaceDepartmentIds } from '@/lib/manager/workspaceDepartmentIds';
import { buildSystemOverviewGraph } from '@/lib/systemOverview/buildSystemOverviewGraph';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function ManagerSystemOverviewPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const { data: perms } = await supabase.rpc('get_my_permissions', { p_org_id: profile.org_id });
  const permissionKeys = (Array.isArray(perms)
    ? (perms as Array<{ permission_key?: string }>).map((x) => String(x.permission_key ?? ''))
    : []) as PermissionKey[];

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

  const scopeDeptIds = await loadWorkspaceDepartmentIds(
    supabase,
    user.id,
    (profile.role as string | null | undefined) ?? null
  );
  const bundle = await loadDepartmentsDirectory(supabase, profile.org_id as string, scopeDeptIds);

  const graph = buildSystemOverviewGraph({
    permissions: permissionKeys,
    bundle,
    isManagerScoped: true,
  });

  return (
    <div className="-mx-5 -my-7 sm:-mx-[28px]">
      <SystemOverviewGraphClient
        title="Manager workspace map"
        subtitle="Connected view of modules and entities available in your scope."
        nodes={graph.nodes}
        edges={graph.edges}
      />
    </div>
  );
}

