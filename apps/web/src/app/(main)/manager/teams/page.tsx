import { ManagerTeamsClient } from '@/components/manager/ManagerTeamsClient';
import { loadDepartmentsDirectory } from '@/lib/departments/loadDepartmentsDirectory';
import { loadWorkspaceDepartmentIds } from '@/lib/manager/workspaceDepartmentIds';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';

export default async function ManagerTeamsPage() {
  const pathStartedAtMs = Date.now();
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await withServerPerf(
    '/manager/teams',
    'profile_lookup',
    supabase
      .from('profiles')
      .select('org_id, role, status')
      .eq('id', user.id)
      .single(),
    300
  );

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const orgId = profile.org_id as string;
  const permissionKeys = await withServerPerf('/manager/teams', 'get_my_permissions', getMyPermissions(orgId), 300);
  if (!permissionKeys.includes('teams.view')) redirect('/broadcasts');

  const managedDeptIds = await withServerPerf(
    '/manager/teams',
    'workspace_department_ids',
    loadWorkspaceDepartmentIds(supabase, user.id, profile.role),
    300
  );
  const bundle = await withServerPerf(
    '/manager/teams',
    'load_departments_directory',
    loadDepartmentsDirectory(supabase, orgId, managedDeptIds),
    500
  );

  const view = (
    <ManagerTeamsClient
      currentUserId={user.id}
      departments={bundle.departments}
      teamsByDept={bundle.teamsByDept}
      teamMembersByTeamId={bundle.teamMembersByTeamId}
      staffOptions={bundle.staffOptions}
    />
  );
  warnIfSlowServerPath('/manager/teams', pathStartedAtMs);
  return view;
}
