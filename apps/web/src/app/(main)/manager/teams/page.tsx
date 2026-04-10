import { ManagerTeamsClient } from '@/components/manager/ManagerTeamsClient';
import { loadDepartmentsDirectory } from '@/lib/departments/loadDepartmentsDirectory';
import { loadWorkspaceDepartmentIds } from '@/lib/manager/workspaceDepartmentIds';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function ManagerTeamsPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const { data: canViewTeams } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: profile.org_id,
    p_permission_key: 'teams.view',
    p_context: {},
  });
  if (!canViewTeams) redirect('/broadcasts');

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
