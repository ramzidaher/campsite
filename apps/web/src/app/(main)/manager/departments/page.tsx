import { AdminDepartmentsClient } from '@/components/admin/AdminDepartmentsClient';
import { loadDepartmentsDirectory } from '@/lib/departments/loadDepartmentsDirectory';
import { loadWorkspaceDepartmentIds } from '@/lib/manager/workspaceDepartmentIds';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';

export default async function ManagerDepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string }>;
}) {
  const pathStartedAtMs = Date.now();
  const sp = await searchParams;
  const openDeptId = typeof sp.dept === 'string' && sp.dept.trim() ? sp.dept.trim() : null;

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await withServerPerf(
    '/manager/departments',
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
  const permissionKeys = await withServerPerf(
    '/manager/departments',
    'get_my_permissions',
    getMyPermissions(orgId),
    300
  );
  if (!permissionKeys.includes('departments.view')) redirect('/broadcasts');

  const managedDeptIds = await withServerPerf(
    '/manager/departments',
    'workspace_department_ids',
    loadWorkspaceDepartmentIds(supabase, user.id, profile.role),
    300
  );

  const bundle = await withServerPerf(
    '/manager/departments',
    'load_departments_directory',
    loadDepartmentsDirectory(supabase, orgId, managedDeptIds),
    500
  );

  const view = (
    <AdminDepartmentsClient
      orgId={orgId}
      currentUserId={user.id}
      isOrgAdmin={false}
      openDeptIdFromUrl={openDeptId}
      initialDepartments={bundle.departments}
      categoriesByDept={bundle.categoriesByDept}
      teamsByDept={bundle.teamsByDept}
      teamMembersByTeamId={bundle.teamMembersByTeamId}
      managersByDept={bundle.managersByDept}
      memberCountByDept={bundle.memberCountByDept}
      membersByDept={bundle.membersByDept}
      broadcastPermsByDept={bundle.broadcastPermsByDept}
      staffOptions={bundle.staffOptions}
    />
  );
  warnIfSlowServerPath('/manager/departments', pathStartedAtMs);
  return view;
}
