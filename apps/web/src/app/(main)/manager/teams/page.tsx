import { ManagerTeamsClient } from '@/components/manager/ManagerTeamsClient';
import { loadDepartmentsDirectory } from '@/lib/departments/loadDepartmentsDirectory';
import { createClient } from '@/lib/supabase/server';
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

  const { data: managedRows } = await supabase
    .from('dept_managers')
    .select('dept_id')
    .eq('user_id', user.id);

  const managedDeptIds = [...new Set((managedRows ?? []).map((r) => r.dept_id as string))];
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
