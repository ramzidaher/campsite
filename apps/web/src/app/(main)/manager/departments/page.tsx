import { AdminDepartmentsClient } from '@/components/admin/AdminDepartmentsClient';
import { loadDepartmentsDirectory } from '@/lib/departments/loadDepartmentsDirectory';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function ManagerDepartmentsPage() {
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
    <AdminDepartmentsClient
      orgId={profile.org_id}
      currentUserId={user.id}
      isOrgAdmin={false}
      initialDepartments={bundle.departments}
      categoriesByDept={bundle.categoriesByDept}
      managersByDept={bundle.managersByDept}
      memberCountByDept={bundle.memberCountByDept}
      membersByDept={bundle.membersByDept}
      broadcastPermsByDept={bundle.broadcastPermsByDept}
      staffOptions={bundle.staffOptions}
    />
  );
}
