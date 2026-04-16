import { AdminDepartmentsClient } from '@/components/admin/AdminDepartmentsClient';
import { loadDepartmentsDirectory } from '@/lib/departments/loadDepartmentsDirectory';
import { hasPermission } from '@/lib/adminGates';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminDepartmentsPage({
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
    '/admin/departments',
    'profile_lookup',
    supabase
      .from('profiles')
      .select('org_id, role, status')
      .eq('id', user.id)
      .single(),
    300
  );

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const permissionKeys = await withServerPerf(
    '/admin/departments',
    'get_my_permissions',
    getMyPermissions(profile.org_id as string),
    300
  );
  if (!hasPermission(permissionKeys, 'departments.view')) redirect('/admin');

  const bundle = await withServerPerf(
    '/admin/departments',
    'load_departments_directory',
    loadDepartmentsDirectory(supabase, profile.org_id as string, null),
    500
  );

  const view = (
    <AdminDepartmentsClient
      orgId={profile.org_id}
      currentUserId={user.id}
      isOrgAdmin
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
  warnIfSlowServerPath('/admin/departments', pathStartedAtMs);
  return view;
}
