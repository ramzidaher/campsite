import { AdminDepartmentsClient } from '@/components/admin/AdminDepartmentsClient';
import { loadDepartmentsDirectory } from '@/lib/departments/loadDepartmentsDirectory';
import { hasPermission } from '@/lib/adminGates';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminDepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string }>;
}) {
  const sp = await searchParams;
  const openDeptId = typeof sp.dept === 'string' && sp.dept.trim() ? sp.dept.trim() : null;

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const { data: perms } = await supabase.rpc('get_my_permissions', { p_org_id: profile.org_id });
  const permissionKeys = ((perms ?? []) as Array<{ permission_key?: string }>).map((p) => String(p.permission_key ?? ''));
  if (!hasPermission(permissionKeys, 'departments.view')) redirect('/admin');

  const bundle = await loadDepartmentsDirectory(supabase, profile.org_id as string, null);

  return (
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
}
