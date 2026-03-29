import { AdminDepartmentsClient } from '@/components/admin/AdminDepartmentsClient';
import { loadDepartmentsDirectory } from '@/lib/departments/loadDepartmentsDirectory';
import { canManageOrgDepartments } from '@/lib/adminGates';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AdminDepartmentsPage() {
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
  if (!canManageOrgDepartments(profile.role)) redirect('/admin');

  const bundle = await loadDepartmentsDirectory(supabase, profile.org_id as string, null);

  return (
    <AdminDepartmentsClient
      orgId={profile.org_id}
      currentUserId={user.id}
      isOrgAdmin
      initialDepartments={bundle.departments}
      categoriesByDept={bundle.categoriesByDept}
      teamsByDept={bundle.teamsByDept}
      memberTeamByDept={bundle.memberTeamByDept}
      managersByDept={bundle.managersByDept}
      memberCountByDept={bundle.memberCountByDept}
      membersByDept={bundle.membersByDept}
      broadcastPermsByDept={bundle.broadcastPermsByDept}
      staffOptions={bundle.staffOptions}
    />
  );
}
