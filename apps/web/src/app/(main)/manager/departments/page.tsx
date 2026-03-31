import { AdminDepartmentsClient } from '@/components/admin/AdminDepartmentsClient';
import { loadDepartmentsDirectory } from '@/lib/departments/loadDepartmentsDirectory';
import { loadWorkspaceDepartmentIds } from '@/lib/manager/workspaceDepartmentIds';
import { createClient } from '@/lib/supabase/server';
import { isDepartmentWorkspaceRole } from '@campsite/types';
import { redirect } from 'next/navigation';

export default async function ManagerDepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string }>;
}) {
  const sp = await searchParams;
  const openDeptId = typeof sp.dept === 'string' && sp.dept.trim() ? sp.dept.trim() : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!isDepartmentWorkspaceRole(profile.role)) redirect('/broadcasts');

  const managedDeptIds = await loadWorkspaceDepartmentIds(supabase, user.id, profile.role);

  const bundle = await loadDepartmentsDirectory(supabase, profile.org_id as string, managedDeptIds);

  return (
    <AdminDepartmentsClient
      orgId={profile.org_id}
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
}
