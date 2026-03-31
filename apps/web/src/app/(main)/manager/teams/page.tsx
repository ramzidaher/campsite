import { ManagerTeamsClient } from '@/components/manager/ManagerTeamsClient';
import { loadDepartmentsDirectory } from '@/lib/departments/loadDepartmentsDirectory';
import { loadWorkspaceDepartmentIds } from '@/lib/manager/workspaceDepartmentIds';
import { createClient } from '@/lib/supabase/server';
import { isDepartmentWorkspaceRole } from '@campsite/types';
import { redirect } from 'next/navigation';

export default async function ManagerTeamsPage() {
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
    <ManagerTeamsClient
      currentUserId={user.id}
      departments={bundle.departments}
      teamsByDept={bundle.teamsByDept}
      teamMembersByTeamId={bundle.teamMembersByTeamId}
      staffOptions={bundle.staffOptions}
    />
  );
}
